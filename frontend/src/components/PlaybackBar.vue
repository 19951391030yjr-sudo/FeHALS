<script setup>
import { computed } from 'vue'
import { useAnimationStore } from '../stores/animation'

// 场景底部播放条：播放/暂停、重播、进度拖动、倍速与已生成点数。
// 进度以 animation store 为唯一真源，拖动时动画驱动器会在下一帧采纳新进度。
const anim = useAnimationStore()

const SPEEDS = [0.5, 1, 2, 4, 8]
const hasCloud = computed(() => anim.stats.total > 0)

function fmtTime(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function fmtInt(v) {
  return Number(v || 0).toLocaleString('en-US')
}

function onScrub(e) {
  anim.seek(e.target.value)
}
</script>

<template>
  <div v-if="anim.enabled && anim.ready" class="playback-bar">
    <button class="pb-icon" :title="anim.playing ? '暂停' : '播放'" @click="anim.toggle()">
      <svg v-if="anim.playing" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>

    <button class="pb-icon" title="从头播放" @click="anim.restart()">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
      </svg>
    </button>

    <span class="pb-time">{{ fmtTime(anim.elapsed) }} / {{ fmtTime(anim.stats.duration) }}</span>

    <input
      class="pb-scrub"
      type="range"
      min="0"
      max="1"
      step="0.001"
      :value="anim.progress"
      title="播放进度"
      @input="onScrub"
    />

    <span class="pb-pct">{{ anim.percent.toFixed(1) }}%</span>

    <select class="pb-speed" v-model.number="anim.speed" title="播放倍速">
      <option v-for="s in SPEEDS" :key="s" :value="s">{{ s }}×</option>
    </select>

    <span v-if="hasCloud" class="pb-count" title="已生成点数 / 点云总点数">
      {{ fmtInt(anim.stats.revealed) }} / {{ fmtInt(anim.stats.total) }} 点
    </span>
  </div>
</template>