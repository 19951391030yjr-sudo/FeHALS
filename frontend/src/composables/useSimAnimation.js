import * as THREE from 'three'
import { useThreeScene } from './useThreeScene'

// 仿真过程动画：平台代理沿规划航迹飞行，点云按 HELIOS++ 出点顺序逐步生成。
//
// 分层约定（与既有代码一致）：
//   - 本模块只管三维对象与每帧更新，不直接依赖 Pinia store；
//   - 播放状态由调用方（Scene3D.vue）通过 getPlayback() 提供快照，
//     进度与统计经 onProgress() 回写，再由调用方写入 animation store；
//   - 每帧更新挂在 useThreeScene 的帧回调上，共用同一渲染循环（不另起 RAF）。
//
// 点云「逐步生成」的依据：后端解析保持 HELIOS++ 的写出顺序（平台沿航迹推进时
// 依次落点），降采样亦为 np.linspace 等距取样，故按索引比例揭示
// （geometry.setDrawRange）等价于按扫描进程揭示，且无需重建缓冲区。

let singleton = null

export function useSimAnimation() {
  if (!singleton) singleton = createSimAnimation()
  return singleton
}

// 扫描幅宽半宽 (m)：航高 × tan(扫描半角)。供航迹统计与面板展示使用。
export function swathHalfWidth(altitude, scanAngleDeg) {
  const a = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(scanAngleDeg) || 0, 0, 89))
  return Math.max(0, Number(altitude) || 0) * Math.tan(a)
}

const COLOR = {
  path: 0x94a3b8, // 规划航迹（暗）
  trail: 0x2563eb, // 已飞轨迹（与 UI 主色一致）
  body: 0x334155,
  skin: 0xe2e8f0,
  accent: 0x0ea5e9,
  rotor: 0x1f2937,
  cone: 0x22d3ee,
  footprint: 0xf59e0b,
  beam: 0xfbbf24,
}

// 扫描线示意转速（转/秒）。真实 scan_freq 为 10~200 Hz，按真实值旋转在 60 fps 下
// 会严重混叠，故取固定示意转速，仅表达「旋转扫描」这一事实。
const BEAM_VISUAL_HZ = 0.8
// 单帧最大步长（秒）：切走标签页后 RAF 停摆，回来时避免进度瞬移
const MAX_DT = 0.1

function createSimAnimation() {
  const three = useThreeScene()

  const ctx = {
    mounted: false,
    group: null,
    // 平台
    platform: null,
    platformKind: null,
    platformScale: 1,
    rotors: [], // [{obj, dir}] 旋翼 spinner（绕世界 Z 自转）
    // 扫描器示意
    cone: null,
    coneKey: '',
    footprint: null,
    footprintDisc: null,
    beam: null,
    beamRadius: 0,
    beamAngle: 0,
    altitude: 0,
    // 航迹
    pathLine: null,
    trailLine: null,
    trailAttr: null,
    course: [], // THREE.Vector3[]（已抬升到航高）
    cum: [0], // 累计弧长
    length: 0,
    // 播放
    progress: 0,
    lastEmitted: 0,
    lastReveal: -1,
    getPlayback: null,
    onProgress: null,
    frame: null,
  }

  // ---------------------------- 生命周期 ----------------------------

  function mount(handlers = {}) {
    ctx.getPlayback = handlers.getPlayback || null
    ctx.onProgress = handlers.onProgress || null
    if (ctx.mounted) return
    if (!three.animGroup) return // 场景尚未 init
    ctx.group = new THREE.Group()
    ctx.group.name = 'simAnimation'
    ctx.group.visible = false
    three.animGroup.add(ctx.group)
    buildPathLines()
    buildScanner(0, 30)
    ctx.frame = frame
    three.onFrame(ctx.frame)
    ctx.mounted = true
  }

  function unmount() {
    if (!ctx.mounted) return
    three.offFrame(ctx.frame)
    clearPlatform()
    disposeChildren(ctx.group)
    if (ctx.group && ctx.group.parent) ctx.group.parent.remove(ctx.group)
    Object.assign(ctx, {
      group: null, pathLine: null, trailLine: null, trailAttr: null,
      cone: null, coneKey: '', footprint: null, footprintDisc: null, beam: null,
      course: [], cum: [0], length: 0, progress: 0, lastEmitted: 0, lastReveal: -1,
      platformKind: null, rotors: [], mounted: false,
    })
    three.revealPointCloud(Infinity) // 恢复完整点云
  }

  // ---------------------------- 航迹 ----------------------------

  // 由地面航点 + 航高构建飞行航迹（与后端 .trj 生成规则一致：恒高，仅取 x、y）
  function setCourse(waypoints, altitude) {
    const alt = Number(altitude) || 0
    ctx.course = (waypoints || []).map((p) => new THREE.Vector3(p.x, p.y, alt))
    ctx.cum = [0]
    let len = 0
    for (let i = 1; i < ctx.course.length; i++) {
      len += ctx.course[i].distanceTo(ctx.course[i - 1])
      ctx.cum.push(len)
    }
    ctx.length = len
    // 进度真源在 animation store：航迹重建后保留当前进度，平台自动贴合新路径
    ctx.lastReveal = -1 // 几何已重建，强制下一帧重新揭示点云
    buildPathLines()
    return { length: len, segments: Math.max(0, ctx.course.length - 1) }
  }

  function buildPathLines() {
    if (!ctx.group) return
    removeLine(ctx.pathLine)
    removeLine(ctx.trailLine)
    ctx.pathLine = null
    ctx.trailLine = null
    ctx.trailAttr = null
    const n = ctx.course.length
    if (n === 0) return

    const flat = new Float32Array(n * 3)
    ctx.course.forEach((p, i) => {
      flat[i * 3] = p.x
      flat[i * 3 + 1] = p.y
      flat[i * 3 + 2] = p.z
    })

    const pathGeo = new THREE.BufferGeometry()
    pathGeo.setAttribute('position', new THREE.BufferAttribute(flat.slice(), 3))
    ctx.pathLine = new THREE.Line(
      pathGeo,
      new THREE.LineBasicMaterial({ color: COLOR.path, transparent: true, opacity: 0.85 })
    )
    ctx.group.add(ctx.pathLine)

    // 已飞轨迹：多预留 1 个顶点写入平台当前插值位置，使轨迹末端平滑跟随
    const tf = new Float32Array((n + 1) * 3)
    tf.set(flat)
    const last = ctx.course[n - 1]
    tf[n * 3] = last.x
    tf[n * 3 + 1] = last.y
    tf[n * 3 + 2] = last.z
    const trailGeo = new THREE.BufferGeometry()
    ctx.trailAttr = new THREE.BufferAttribute(tf, 3)
    trailGeo.setAttribute('position', ctx.trailAttr)
    trailGeo.setDrawRange(0, 1)
    trailGeo.computeBoundingSphere()
    ctx.trailLine = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: COLOR.trail })
    )
    ctx.group.add(ctx.trailLine)
  }

  // 弧长参数化取样：返回 {pos, dir, segIndex}
  function sampleAt(t) {
    const n = ctx.course.length
    if (n === 0) return null
    if (n === 1 || ctx.length <= 0) {
      return { pos: ctx.course[0].clone(), dir: null, segIndex: 0 }
    }
    const s = THREE.MathUtils.clamp(t, 0, 1) * ctx.length
    // 二分定位航段：cum[i-1] <= s <= cum[i]
    let lo = 1
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ctx.cum[mid] < s) lo = mid + 1
      else hi = mid
    }
    const a = ctx.course[lo - 1]
    const b = ctx.course[lo]
    const seg = ctx.cum[lo] - ctx.cum[lo - 1]
    const f = seg > 1e-9 ? THREE.MathUtils.clamp((s - ctx.cum[lo - 1]) / seg, 0, 1) : 0
    return { pos: a.clone().lerp(b, f), dir: b.clone().sub(a), segIndex: lo - 1 }
  }

  // ---------------------------- 平台代理 ----------------------------

  function clearPlatform() {
    if (!ctx.platform) return
    disposeChildren(ctx.platform)
    if (ctx.platform.parent) ctx.platform.parent.remove(ctx.platform)
    ctx.platform = null
    ctx.rotors = []
  }

  // 平台局部坐标：+X 为机头方向，+Z 为上（与场景 Z-up 一致，偏航即 rotation.z）
  function buildPlatform(kind) {
    if (!ctx.group) return
    clearPlatform()
    ctx.platformKind = kind
    ctx.platform = kind === 'Airborne' ? buildFixedWing() : buildCopter()
    ctx.platform.name = 'platform'
    ctx.group.add(ctx.platform)
  }

  function buildCopter() {
    const g = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: COLOR.body, roughness: 0.55, metalness: 0.15 })
    const accentMat = new THREE.MeshStandardMaterial({ color: COLOR.accent, roughness: 0.4 })
    const rotorMat = new THREE.MeshStandardMaterial({
      color: COLOR.rotor, roughness: 0.8, transparent: true, opacity: 0.7,
    })

    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.24), bodyMat))

    // 机头指示（锥体默认顶点朝 +Y，绕 Z 转 -90° 指向 +X）
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 16), accentMat)
    nose.rotation.z = -Math.PI / 2
    nose.position.set(0.56, 0, 0)
    g.add(nose)

    // 机腹扫描头（圆柱轴 +Y，绕 X 转 90° 变为竖直）
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 16), accentMat)
    pod.rotation.x = Math.PI / 2
    pod.position.set(0, 0, -0.19)
    g.add(pod)

    // 四机臂 + 旋翼
    const R = 0.52
    const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.62, 10)
    const hubGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12)
    const rotorGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.015, 24)
    const angles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]
    angles.forEach((a, i) => {
      const dx = Math.cos(a) * R
      const dy = Math.sin(a) * R
      // 机臂指向 a 方向：圆柱轴 +Y 绕 Z 旋转 (a - 90°)
      const arm = new THREE.Mesh(armGeo, bodyMat)
      arm.rotation.z = a - Math.PI / 2
      arm.position.set(dx * 0.5, dy * 0.5, 0)
      g.add(arm)

      const hub = new THREE.Mesh(hubGeo, bodyMat)
      hub.rotation.x = Math.PI / 2
      hub.position.set(dx, dy, 0.06)
      g.add(hub)

      // 旋翼装在独立 spinner 组内，绕世界 Z 自转（避免欧拉次序耦合）
      const spinner = new THREE.Group()
      spinner.position.set(dx, dy, 0.13)
      const blade = new THREE.Mesh(rotorGeo, rotorMat)
      blade.rotation.x = Math.PI / 2
      spinner.add(blade)
      g.add(spinner)
      ctx.rotors.push({ obj: spinner, dir: i % 2 === 0 ? 1 : -1 })
    })

    // 起落架
    const skidGeo = new THREE.BoxGeometry(0.7, 0.04, 0.04)
    const skidY = [-0.18, 0.18]
    skidY.forEach((y) => {
      const skid = new THREE.Mesh(skidGeo, bodyMat)
      skid.position.set(0, y, -0.24)
      g.add(skid)
    })
    return g
  }

  function buildFixedWing() {
    const g = new THREE.Group()
    const skinMat = new THREE.MeshStandardMaterial({ color: COLOR.skin, roughness: 0.5, metalness: 0.1 })
    const accentMat = new THREE.MeshStandardMaterial({ color: COLOR.accent, roughness: 0.4 })

    // 机身（圆柱轴 +Y 绕 Z 转 90° 指向 X）
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 1.5, 16), skinMat)
    fuselage.rotation.z = Math.PI / 2
    g.add(fuselage)

    // 主翼（展向沿 Y，垂直于机头方向）
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.9, 0.035), skinMat)
    wing.position.set(0.05, 0, 0.02)
    g.add(wing)

    // 平尾 + 垂尾
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.03), skinMat)
    tail.position.set(-0.66, 0, 0.02)
    g.add(tail)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.3), skinMat)
    fin.position.set(-0.64, 0, 0.17)
    g.add(fin)

    // 机腹扫描吊舱
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 16), accentMat)
    pod.rotation.x = Math.PI / 2
    pod.position.set(0.1, 0, -0.14)
    g.add(pod)
    return g
  }

  // 平台显示尺寸：按航迹尺度与航高取醒目的示意尺寸（真实比例下几乎不可见）
  function platformSize() {
    const base = Math.max(ctx.length * 0.02, ctx.altitude * 0.06, 1.5)
    return base * (ctx.platformScale || 1)
  }

  // ---------------------------- 扫描器示意 ----------------------------

  function buildScanner(altitude, scanAngle) {
    if (!ctx.group) return
    const alt = Math.max(1, Number(altitude) || 0)
    const half = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(scanAngle) || 0, 1, 85))
    const radius = Math.max(0.5, alt * Math.tan(half))
    const key = `${alt.toFixed(3)}|${radius.toFixed(3)}`
    if (key === ctx.coneKey) return
    ctx.coneKey = key
    ctx.altitude = alt
    ctx.beamRadius = radius

    // 光束锥：ConeGeometry 轴 +Y、顶点在上；转到 Z 轴后平移，使顶点落在平台处、开口落到地面
    removeMesh(ctx.cone)
    const coneGeo = new THREE.ConeGeometry(radius, alt, 48, 1, true)
    coneGeo.rotateX(Math.PI / 2)
    coneGeo.translate(0, 0, -alt / 2)
    ctx.cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: COLOR.cone, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, depthWrite: false,
      })
    )
    ctx.group.add(ctx.cone)

    // 地面足迹（Ring/Circle 默认即 XY 平面，法向 +Z，无需旋转）
    removeMesh(ctx.footprint)
    ctx.footprint = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.985, radius, 64),
      new THREE.MeshBasicMaterial({
        color: COLOR.footprint, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false,
      })
    )
    ctx.group.add(ctx.footprint)

    removeMesh(ctx.footprintDisc)
    ctx.footprintDisc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 64),
      new THREE.MeshBasicMaterial({
        color: COLOR.footprint, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, depthWrite: false,
      })
    )
    ctx.group.add(ctx.footprintDisc)

    // 旋转扫描线（平台 → 地面瞬时光束示意）
    removeLine(ctx.beam)
    const beamGeo = new THREE.BufferGeometry()
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    ctx.beam = new THREE.Line(
      beamGeo,
      new THREE.LineBasicMaterial({ color: COLOR.beam, transparent: true, opacity: 0.85 })
    )
    ctx.beam.frustumCulled = false
    ctx.group.add(ctx.beam)
  }

  function updateBeam(p, visible) {
    if (!ctx.beam) return
    ctx.beam.visible = visible
    if (!visible) return
    const r = ctx.beamRadius
    const attr = ctx.beam.geometry.getAttribute('position')
    attr.setXYZ(0, p.pos.x, p.pos.y, p.pos.z)
    attr.setXYZ(1, p.pos.x + Math.cos(ctx.beamAngle) * r, p.pos.y + Math.sin(ctx.beamAngle) * r, 0)
    attr.needsUpdate = true
  }

  // ---------------------------- 每帧更新 ----------------------------

  function frame(rawDt) {
    if (!ctx.mounted || !ctx.group || !ctx.getPlayback) return
    const pb = ctx.getPlayback()
    if (!pb) return
    const dt = Math.min(Math.max(rawDt || 0, 0), MAX_DT)

    syncOptions(pb)

    // 进度真源：播放时由本驱动器推进；暂停或外部拖动进度条时以外部状态为准
    if (pb.progress !== ctx.lastEmitted) ctx.progress = pb.progress

    const speed = Number(pb.speed) > 0 ? Number(pb.speed) : 1
    let finished = false
    if (pb.playing) {
      const dur = Math.max(0.05, Number(pb.duration) || 0)
      let t = ctx.progress + (dt * speed) / dur
      if (t >= 1) {
        if (pb.loop) t -= Math.floor(t)
        else {
          t = 1
          finished = true
        }
      }
      ctx.progress = t
      spin(dt * speed)
    }

    const moved = ctx.progress !== ctx.lastEmitted
    const info = apply(pb)
    if (pb.playing || moved || info.revealed !== ctx.lastReveal) emit(info, finished)
  }

  function syncOptions(pb) {
    if (pb.platformType !== ctx.platformKind) buildPlatform(pb.platformType)
    ctx.platformScale = Number(pb.platformScale) > 0 ? Number(pb.platformScale) : 1
    buildScanner(pb.altitude, pb.scanAngle) // 内部按 key 判断是否需要重建
  }

  function spin(dtScaled) {
    ctx.rotors.forEach((r) => {
      r.obj.rotation.z += r.dir * dtScaled * 26
    })
    ctx.beamAngle = (ctx.beamAngle + dtScaled * BEAM_VISUAL_HZ * Math.PI * 2) % (Math.PI * 2)
  }

  function apply(pb) {
    const total = Number(pb.pointCount) || 0
    if (ctx.course.length === 0) {
      // 无航迹：隐藏动画对象，且不遮挡点云
      ctx.group.visible = false
      reveal(total, total)
      return { revealed: total, total }
    }
    ctx.group.visible = true

    const p = sampleAt(ctx.progress)
    if (ctx.platform) {
      ctx.platform.visible = !!pb.showPlatform
      ctx.platform.position.copy(p.pos)
      if (p.dir && p.dir.lengthSq() > 1e-9) {
        ctx.platform.rotation.z = Math.atan2(p.dir.y, p.dir.x)
      }
      const s = platformSize()
      if (Math.abs(ctx.platform.scale.x - s) > 1e-6) ctx.platform.scale.setScalar(s)
    }
    if (ctx.cone) {
      ctx.cone.visible = !!pb.showScanner
      ctx.cone.position.copy(p.pos)
    }
    const showFoot = !!pb.showFootprint
    if (ctx.footprint) {
      ctx.footprint.visible = showFoot
      ctx.footprint.position.set(p.pos.x, p.pos.y, 0.05) // 略高于地面，避免与网格 z-fighting
    }
    if (ctx.footprintDisc) {
      ctx.footprintDisc.visible = showFoot
      ctx.footprintDisc.position.set(p.pos.x, p.pos.y, 0.04)
    }
    updateBeam(p, showFoot)
    if (ctx.trailLine) {
      ctx.trailLine.visible = !!pb.showTrail
      updateTrail(p)
    }
    if (ctx.pathLine) ctx.pathLine.visible = !!pb.showTrail
    if (pb.followCamera && three.controls) three.controls.target.lerp(p.pos, 0.12)

    const n = revealCount(ctx.progress, pb.revealMode, ctx.course.length - 1, total)
    reveal(n, total)
    return { revealed: n, total }
  }

  function updateTrail(p) {
    if (!ctx.trailAttr) return
    const k = p.segIndex // 前 k+1 个航点已飞过，第 k+1 号顶点写当前插值位置
    const c = ctx.course[k]
    ctx.trailAttr.setXYZ(k, c.x, c.y, c.z) // 消除上一帧插值残留
    ctx.trailAttr.setXYZ(k + 1, p.pos.x, p.pos.y, p.pos.z)
    ctx.trailAttr.needsUpdate = true
    ctx.trailLine.geometry.setDrawRange(0, k + 2)
  }

  // 逐点：按弧长比例连续揭示；逐条带：按航段离散揭示（一航段 ≈ 一条扫描条带）
  function revealCount(t, mode, segments, total) {
    if (total <= 0) return 0
    const c = THREE.MathUtils.clamp(t, 0, 1)
    if (mode === 'strip' && segments > 0) {
      const k = Math.ceil(c * segments - 1e-9)
      return Math.round((k / segments) * total)
    }
    return Math.round(c * total)
  }

  function reveal(n, total) {
    if (total <= 0) {
      ctx.lastReveal = -1
      return
    }
    if (n === ctx.lastReveal) return
    ctx.lastReveal = n
    three.revealPointCloud(n)
  }

  function emit(info, finished) {
    ctx.lastEmitted = ctx.progress
    if (ctx.onProgress) ctx.onProgress(ctx.progress, { ...info, finished })
  }

  // ---------------------------- 资源释放 ----------------------------

  function removeLine(line) {
    if (!line) return
    if (line.parent) line.parent.remove(line)
    if (line.geometry) line.geometry.dispose()
    if (line.material) line.material.dispose()
  }

  function removeMesh(mesh) {
    if (!mesh) return
    if (mesh.parent) mesh.parent.remove(mesh)
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) mesh.material.dispose()
  }

  function disposeChildren(root) {
    if (!root) return
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
        else o.material.dispose()
      }
    })
  }

  return {
    mount,
    unmount,
    setCourse,
    get progress() {
      return ctx.progress
    },
    get length() {
      return ctx.length
    },
  }
}