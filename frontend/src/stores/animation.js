import { defineStore } from 'pinia'

// 仿真动画状态：播放控制、进度、显示选项与航迹统计。
// 三维对象与每帧更新由 composables/useSimAnimation.js 实现，
// 本 store 是其响应式控制面，二者由 Scene3D.vue 桥接（组合式函数不直接依赖 store）。
export const useAnimationStore = defineStore('animation', {
  state: () => ({
    ready: false, // 航迹是否可用（至少 1 个航点）
    playing: false,
    progress: 0, // 0 ~ 1，沿航迹的归一化弧长
    speed: 1, // 播放倍速
    loop: true, // 播放到末尾后循环
    autoPlay: true, // 新点云结果载入后自动重播
    revealMode: 'point', // point 逐点连续 | strip 逐条带（按航段离散揭示）
    // 显示选项
    showPlatform: true, // 平台代理模型（旋翼 / 固定翼 / 车载 / TLS 三脚架）
    showTrail: true, // 规划航迹与已行进轨迹
    followCamera: false, // 视角跟随平台
    platformScale: 1, // 平台模型显示倍率（示意尺寸，非真实比例）
    // 统计（由动画驱动器写回，供面板与播放条展示）
    stats: {
      pathLength: 0, // 航迹长度 (m)
      segments: 0, // 航段数
      duration: 0, // 单倍速播放时长 (s)
      altitude: 0, // 平台高度参数 (m)：航高 / 传感器高度 / 架设高度
      revealed: 0, // 已生成点数
      total: 0, // 点云总点数
    },
  }),
  getters: {
    percent: (s) => Math.round(s.progress * 1000) / 10,
    elapsed: (s) => s.stats.duration * s.progress,
  },
  actions: {
    play() {
      if (this.ready) this.playing = true
    },
    pause() {
      this.playing = false
    },
    toggle() {
      if (this.playing) this.pause()
      else this.play()
    },
    restart() {
      this.progress = 0
      this.play()
    },
    seek(v) {
      const n = Number(v)
      this.progress = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
    },
    setStats(patch) {
      Object.assign(this.stats, patch)
    },
    // 每帧由动画驱动器写回：进度、已生成点数、是否播放结束
    updateProgress(progress, revealed, total, finished) {
      this.progress = progress
      this.stats.revealed = revealed
      this.stats.total = total
      if (finished) this.playing = false
    },
    reset() {
      this.playing = false
      this.progress = 0
    },
  },
})