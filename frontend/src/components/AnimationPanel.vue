<script setup>
import { computed } from 'vue'
import { useAnimationStore } from '../stores/animation'
import { useSimulationStore } from '../stores/simulation'
import { getPlatform } from '../composables/scannerSpecs'

// 仿真动画面板：播放控制、点云揭示方式、显示选项与航迹统计。
// 所有控件直接双向绑定 animation store，Scene3D.vue 每帧读取该 store 驱动三维动画。
const anim = useAnimationStore()
const sim = useSimulationStore()

// 高度参数含义随平台而变：航高 / 传感器高度 / 架设高度
const altitudeLabel = computed(
  () => getPlatform(sim.params.platform_id).params.altitude?.label || '航高'
)

const SPEEDS = [0.5, 1, 2, 4, 8]

const fmt = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d))
const fmtInt = (v) => Number(v || 0).toLocaleString('en-US')

const revealHint = computed(() =>
  anim.revealMode === 'strip'
    ? `按航段离散揭示，共 ${anim.stats.segments} 段`
    : '按弧长比例连续揭示，最接近真实出点节奏'
)

const cloudHint = computed(() =>
  anim.stats.total > 0
    ? '点云按 HELIOS++ 出点顺序逐步显示，可拖动场景底部播放条定位到任意时刻。'
    : '尚无点云结果：当前仅回放平台飞行轨迹；执行仿真后动画将同步演示点云生成过程。'
)
</script>

<template>
  <section class="panel animation-panel">
    <h3 class="panel-title">仿真动画</h3>

    <div v-if="!anim.ready" class="pc-empty">
      暂无可用航迹：请先在场景中点击添加航点（至少 1 个）
    </div>

    <template v-else>
      <div class="section-divider">播放</div>
      <div class="anim-btn-row">
        <button class="btn btn-sm" @click="anim.toggle()">{{ anim.playing ? '暂停' : '播放' }}</button>
        <button class="btn btn-sm" @click="anim.restart()">从头播放</button>
        <button class="btn btn-sm" @click="anim.reset()">停止</button>
      </div>

      <div class="field">
        <label>倍速</label>
        <select v-model.number="anim.speed">
          <option v-for="s in SPEEDS" :key="s" :value="s">{{ s }}×</option>
        </select>
      </div>

      <label class="anim-check">
        <input v-model="anim.loop" type="checkbox" />
        <span>循环播放</span>
      </label>
      <label class="anim-check">
        <input v-model="anim.autoPlay" type="checkbox" />
        <span>仿真完成后自动播放</span>
      </label>

      <div class="section-divider">点云生成</div>
      <div class="field">
        <label>揭示方式</label>
        <select v-model="anim.revealMode">
          <option value="point">逐点（连续）</option>
          <option value="strip">逐条带（按航段）</option>
        </select>
        <span class="field-range">{{ revealHint }}</span>
      </div>
      <p class="anim-hint">{{ cloudHint }}</p>

      <div class="section-divider">显示</div>
      <label class="anim-check">
        <input v-model="anim.showPlatform" type="checkbox" />
        <span>平台模型</span>
      </label>
      <label class="anim-check">
        <input v-model="anim.showTrail" type="checkbox" />
        <span>航迹</span>
      </label>
      <label class="anim-check">
        <input v-model="anim.followCamera" type="checkbox" />
        <span>视角跟随平台</span>
      </label>

      <div class="field">
        <label>平台大小（示意倍率）：{{ fmt(anim.platformScale, 1) }}×</label>
        <input v-model.number="anim.platformScale" type="range" min="0.5" max="4" step="0.1" />
      </div>

      <div class="section-divider">航迹与进度</div>
      <div class="stat-list">
        <div class="stat-item">
          <span class="stat-label">航迹长度</span>
          <span class="stat-value">{{ fmt(anim.stats.pathLength) }} m</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">航段数</span>
          <span class="stat-value">{{ anim.stats.segments }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">播放时长（1×）</span>
          <span class="stat-value">{{ fmt(anim.stats.duration) }} s</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{ altitudeLabel }}</span>
          <span class="stat-value">{{ fmt(anim.stats.altitude) }} m</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">当前进度</span>
          <span class="stat-value">{{ anim.percent.toFixed(1) }}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已生成点数</span>
          <span class="stat-value">{{ fmtInt(anim.stats.revealed) }} / {{ fmtInt(anim.stats.total) }}</span>
        </div>
      </div>
    </template>
  </section>
</template>