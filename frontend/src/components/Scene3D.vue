<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useThreeScene } from '../composables/useThreeScene'
import { useWaypoints } from '../composables/useWaypoints'
import { useSimAnimation } from '../composables/useSimAnimation'
import { useSceneStore } from '../stores/scene'
import { useWaypointStore } from '../stores/waypoints'
import { useSimulationStore } from '../stores/simulation'
import { useAnimationStore } from '../stores/animation'
import PlaybackBar from './PlaybackBar.vue'

const three = useThreeScene()
const waypoints = useWaypoints()
const anim = useSimAnimation()
const sceneStore = useSceneStore()
const waypointStore = useWaypointStore()
const simStore = useSimulationStore()
const animStore = useAnimationStore()

const container = ref(null)
const loadedIds = new Set()

// ---------------------------- 仿真动画接线 ----------------------------

// 播放状态快照：动画驱动器每帧读取，天然与 store 保持同步（无需逐项 watch）
function playbackSnapshot() {
  return {
    playing: animStore.playing,
    progress: animStore.progress,
    speed: animStore.speed,
    loop: animStore.loop,
    duration: animStore.stats.duration,
    revealMode: animStore.revealMode,
    showPlatform: animStore.showPlatform,
    showTrail: animStore.showTrail,
    followCamera: animStore.followCamera,
    platformScale: animStore.platformScale,
    platformType: simStore.params.platform_id,
    altitude: simStore.params.altitude,
    pointCount: three.getPointCloudCount(),
  }
}

// 航点 + 航高 → 飞行航迹（与后端 .trj 生成规则一致：恒定航高，仅取航点 x、y）
function rebuildCourse() {
  const pts = waypointStore.points
  const altitude = Number(simStore.params.altitude) || 0
  const speed = Number(simStore.params.speed) > 0 ? Number(simStore.params.speed) : 1
  const { length, segments } = anim.setCourse(pts, altitude)
  animStore.ready = pts.length > 0
  animStore.setStats({
    pathLength: length,
    segments,
    duration: length / speed, // 单倍速播放时长 = 航迹长度 / 飞行速度
    altitude,
    total: three.getPointCloudCount(),
  })
  if (!animStore.ready) animStore.reset()
}

onMounted(() => {
  three.init(container.value)

  waypoints.setCallbacks({
    onAdd: (p) => waypointStore.add(p),
    onMove: (index, p) => waypointStore.update(index, p),
    onRemove: (index) => waypointStore.remove(index),
  })
  waypoints.renderWaypoints(waypointStore.points)

  anim.mount({
    getPlayback: playbackSnapshot,
    onProgress: (progress, info) =>
      animStore.updateProgress(progress, info.revealed, info.total, info.finished),
  })
  rebuildCourse()
})

onBeforeUnmount(() => {
  anim.unmount()
  three.dispose()
})

// store 航点变化 → 重建三维表示
watch(
  () => waypointStore.points,
  (points) => waypoints.renderWaypoints(points),
  { deep: true }
)

// 航点/航高/速度变化 → 重建飞行航迹与动画统计
watch(
  () => [
    waypointStore.points,
    simStore.params.altitude,
    simStore.params.speed,
  ],
  () => rebuildCourse(),
  { deep: true }
)

// 模型变化 → 加载到场景，或从场景移除
watch(
  () => sceneStore.models.map((m) => m.id),
  (ids) => {
    // 移除已加载但 store 中不再存在的模型
    for (const id of loadedIds) {
      if (!ids.includes(id)) {
        three.removeModel(id)
        loadedIds.delete(id)
      }
    }
    // 加载新模型
    sceneStore.models.forEach((m) => {
      if (loadedIds.has(m.id)) return
      loadedIds.add(m.id)
      sceneStore.setLoading(true)
      three
        .loadModel(m.url, m.name, m.up, m.id)
        .then(({ size }) => {
          sceneStore.setLoading(false)
          sceneStore.setModelBbox(m.id, { size })
        })
        .catch((err) => {
          sceneStore.setLoading(false)
          simStore.addLog('ERROR', `模型加载失败（${m.name}）：${err.message || err}`)
        })
    })
  },
  { deep: true }
)

// 模型可见性
watch(
  () => sceneStore.models.map((m) => ({ id: m.id, visible: m.visible })),
  (vals) => vals.forEach((v) => three.setModelVisible(v.id, v.visible)),
  { deep: true }
)

// 模型 bbox
watch(
  () => sceneStore.models.map((m) => ({ id: m.id, showBbox: m.showBbox })),
  (vals) => vals.forEach((v) => three.setModelBbox(v.id, v.showBbox)),
  { deep: true }
)

// 仿真结果 → 点云渲染 + 动画回放
watch(
  () => simStore.result,
  (result) => {
    if (!result) return
    three.setPointCloud(result.points, result.intensity, sceneStore.pointOptions)
    animStore.setStats({ total: three.getPointCloudCount() })
    // 自动播放开启时从头演示点云生成过程；否则直接呈现完整点云（进度置 100%）
    if (animStore.ready && animStore.autoPlay) {
      animStore.restart()
    } else {
      animStore.seek(1)
      three.revealPointCloud(Infinity)
    }
  }
)

// 点云渲染参数 → 实时更新（drawRange 不受影响，动画进度保持不变）
watch(
  () => sceneStore.pointOptions,
  (opts) => three.updatePointCloud(opts),
  { deep: true }
)

// 渲染选项变化 → 应用到 Three.js 场景
watch(
  () => sceneStore.renderOptions,
  (opts) => {
    three.setAxesVisible(opts.showAxes)
    three.setWaypointColor(opts.waypointColor)
    three.setTrajectoryColor(opts.trajectoryColor)
    three.setArrowColor(opts.arrowColor)
    three.setArrowsVisible(opts.showArrows)
  },
  { deep: true, immediate: true }
)
</script>

<template>
  <div class="scene3d">
    <div ref="container" class="scene-container"></div>

    <PlaybackBar />

    <div v-if="sceneStore.loading" class="loading-overlay">
      <div class="spinner"></div>
      <span>模型加载中...</span>
    </div>
  </div>
</template>