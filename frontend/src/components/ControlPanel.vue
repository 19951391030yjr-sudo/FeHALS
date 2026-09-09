<script setup>
import { computed, ref, watch } from 'vue'
import { useSimulationStore } from '../stores/simulation'
import { useSceneStore } from '../stores/scene'
import { useHeliosAPI } from '../composables/useHeliosAPI'
import { getPlatform, getScanner, PLATFORMS, SCANNERS } from '../composables/scannerSpecs'
import { useThreeScene } from '../composables/useThreeScene'

const simStore = useSimulationStore()
const sceneStore = useSceneStore()
const api = useHeliosAPI()
const three = useThreeScene()

const sceneMaxZ = ref(null)
const SAFETY_MARGIN = 20

const currentPlatform = computed(() => getPlatform(simStore.params.platform_id))
const currentScanner = computed(() => getScanner(simStore.params.scanner_id))

const platformParams = computed(() => currentPlatform.value.params)
const scannerParams = computed(() => currentScanner.value.params)

// 静态平台（如 tripod）不需要速度
const isStaticPlatform = computed(() => currentPlatform.value.type === 'static')

// 部分扫描器的 scan_freq / scan_angle 不适用（多通道 / risley 棱镜）
const scanFreqEnabled = computed(() => {
  const spec = currentScanner.value.params.scan_freq
  return spec && !spec.readonly && spec.default !== null
})
const scanAngleEnabled = computed(() => {
  const spec = currentScanner.value.params.scan_angle
  return spec && !spec.readonly && spec.default !== null
})

// 模型集合变化时清空建议航高缓存
watch(
  () => sceneStore.models.map((m) => m.id),
  () => {
    if (sceneMaxZ.value !== null) {
      const def = currentPlatform.value.params.altitude?.default
      if (def != null) simStore.params.altitude = def
    }
    sceneMaxZ.value = null
  },
)

const altWarning = computed(() => {
  const min = currentScanner.value.params.rangeMin?.default
  if (min == null) return ''
  const alt = simStore.params.altitude
  if (alt < min) return `航高低于扫描器最小测程 ${min} m`

  const altMax = currentPlatform.value.params.altitude?.max
  const rangeMax = currentScanner.value.params.rangeMax?.default
  let ceiling
  if (rangeMax != null && altMax != null) {
    ceiling = Math.min(altMax, rangeMax)
  } else {
    ceiling = altMax ?? rangeMax
  }
  if (ceiling != null && alt > ceiling) {
    return `航高超过最大允许值 ${ceiling} m`
  }
  return ''
})

function onPlatformChange() {
  const p = currentPlatform.value
  for (const [key, spec] of Object.entries(p.params)) {
    const curVal = simStore.params[key]
    if (curVal === undefined || curVal === null || curVal < spec.min || curVal > spec.max) {
      simStore.params[key] = spec.default
    }
  }
  // 若原 scanner 参数超出新平台兼容范围，也复位（仅速度/高度联动）
  const s = currentScanner.value
  for (const [key, spec] of Object.entries(s.params)) {
    if (!spec.readonly && key !== 'altitude') continue // 仅复位高度
    if (!spec.readonly && key === 'altitude') {
      if (simStore.params[key] < spec.min || simStore.params[key] > spec.max) {
        simStore.params[key] = spec.default
      }
    }
  }
}

function onScannerChange() {
  const s = currentScanner.value
  for (const [key, spec] of Object.entries(s.params)) {
    if (spec.readonly) continue
    const curVal = simStore.params[key]
    if (curVal === undefined || curVal === null || curVal < spec.min || curVal > spec.max) {
      simStore.params[key] = spec.default
    }
  }
  // 扫描器变更可能影响航高验证，但不自动修改航高
}

function autoAltitude() {
  const maxZ = three.getSceneMaxZ()
  if (maxZ === null) {
    simStore.addLog('WARNING', '未加载模型，无法自动计算航高')
    return
  }
  sceneMaxZ.value = maxZ

  const spec = currentPlatform.value.params.altitude
  const rangeMax = currentScanner.value.params.rangeMax?.default
  const maxAllowed = rangeMax != null ? Math.min(spec.max, rangeMax) : spec.max
  let recommended = Math.ceil((maxZ + SAFETY_MARGIN) * 10) / 10
  if (recommended < spec.min) recommended = spec.min
  if (recommended > maxAllowed) {
    simStore.addLog('WARNING', `建议航高 ${recommended} m 超过最大允许值 ${maxAllowed} m，已按上限设置`)
    recommended = maxAllowed
  }
  simStore.params.altitude = recommended
  simStore.addLog(
    'INFO',
    `自动计算航高：模型最高点 ${maxZ.toFixed(2)} m + 安全余量 ${SAFETY_MARGIN} m = ${recommended} m`
  )
}

async function generateConfig() {
  try {
    const res = await api.generateConfig(simStore.params)
    simStore.configId = res.config_id
    simStore.addLog('INFO', `配置文件已生成：${res.config_id}`)
  } catch (err) {
    simStore.addLog('ERROR', '配置生成失败：' + (err.response?.data?.detail || err.message))
  }
}
</script>

<template>
  <section class="panel control-panel">
    <h3 class="panel-title">仿真参数配置</h3>

    <div class="field">
      <label>平台</label>
      <select v-model="simStore.params.platform_id" @change="onPlatformChange">
        <option v-for="p in PLATFORMS" :key="p.id" :value="p.id">
          {{ p.label }}
        </option>
      </select>
      <span class="field-range">{{ currentPlatform.description }}</span>
    </div>

    <div class="field">
      <label>扫描器</label>
      <select v-model="simStore.params.scanner_id" @change="onScannerChange">
        <option v-for="s in SCANNERS" :key="s.id" :value="s.id">
          {{ s.label }}
        </option>
      </select>
      <span class="field-range">{{ currentScanner.description }}（{{ currentScanner.optics }}）</span>
    </div>

    <div class="section-divider">载体参数 — {{ currentPlatform.label }}</div>

    <!-- 速度：静态平台隐藏 -->
    <template v-if="!isStaticPlatform">
      <div class="field" v-for="(spec, key) in platformParams" :key="key">
        <template v-if="key === 'speed'">
          <label>{{ spec.label }} ({{ spec.unit }})</label>
          <div class="field-input-area">
            <input
              v-model.number="simStore.params[key]"
              type="number"
              :min="spec.min"
              :max="spec.max"
              :step="spec.step"
            />
            <span class="field-range">有效范围：{{ spec.min }} ~ {{ spec.max }}</span>
          </div>
        </template>
      </div>
    </template>
    <div v-if="isStaticPlatform" class="field-hint">静态平台，无需速度参数</div>

    <!-- 高度：所有平台均有 -->
    <div class="field" v-if="platformParams.altitude">
      <label>{{ platformParams.altitude.label }} ({{ platformParams.altitude.unit }})</label>
      <div class="field-input-area">
        <input
          v-model.number="simStore.params.altitude"
          type="number"
          :min="platformParams.altitude.min"
          :max="platformParams.altitude.max"
          :step="platformParams.altitude.step"
        />
        <span class="field-range">有效范围：{{ platformParams.altitude.min }} ~ {{ platformParams.altitude.max }}</span>
      </div>
    </div>
    <div class="field">
      <label>建议航高</label>
      <div class="field-input-area">
        <button class="btn btn-sm" @click="autoAltitude">自动计算航高</button>
        <span v-if="sceneMaxZ !== null" class="field-range">
          模型最高点 {{ sceneMaxZ.toFixed(2) }} m → 建议 {{ simStore.params.altitude }} m
        </span>
        <span v-else class="field-range">基于场景模型最高点推荐安全飞行高度</span>
      </div>
    </div>

    <div v-if="altWarning" class="field-hint warn">{{ altWarning }}</div>

    <div class="section-divider">传感器参数 — {{ currentScanner.label }}（{{ currentScanner.optics }}）</div>

    <!-- 扫描频率 -->
    <div class="field" v-if="scanFreqEnabled">
      <label>{{ scannerParams.scan_freq.label }} ({{ scannerParams.scan_freq.unit }})</label>
      <div class="field-input-area">
        <input
          v-model.number="simStore.params.scan_freq"
          type="number"
          :min="scannerParams.scan_freq.min"
          :max="scannerParams.scan_freq.max"
          :step="scannerParams.scan_freq.step"
        />
        <span class="field-range">有效范围：{{ scannerParams.scan_freq.min }} ~ {{ scannerParams.scan_freq.max }}</span>
      </div>
    </div>
    <div v-else-if="scannerParams.scan_freq?.note" class="field">
      <label>{{ scannerParams.scan_freq.label }}</label>
      <div class="field-input-area">
        <span class="field-range">{{ scannerParams.scan_freq.note }}</span>
      </div>
    </div>

    <!-- 扫描角度 -->
    <div class="field" v-if="scanAngleEnabled">
      <label>{{ scannerParams.scan_angle.label }} ({{ scannerParams.scan_angle.unit }})</label>
      <div class="field-input-area">
        <input
          v-model.number="simStore.params.scan_angle"
          type="number"
          :min="scannerParams.scan_angle.min"
          :max="scannerParams.scan_angle.max"
          :step="scannerParams.scan_angle.step"
        />
        <span class="field-range">有效范围：{{ scannerParams.scan_angle.min }} ~ {{ scannerParams.scan_angle.max }}</span>
      </div>
    </div>
    <div v-else-if="scannerParams.scan_angle?.note" class="field">
      <label>{{ scannerParams.scan_angle.label }}</label>
      <div class="field-input-area">
        <span class="field-range">{{ scannerParams.scan_angle.note }}</span>
      </div>
    </div>

    <!-- 脉冲频率 -->
    <div class="field">
      <label>{{ scannerParams.pulse_freq.label }} ({{ scannerParams.pulse_freq.unit }})</label>
      <div class="field-input-area">
        <input
          v-if="!scannerParams.pulse_freq.readonly"
          v-model.number="simStore.params.pulse_freq"
          type="number"
          :min="scannerParams.pulse_freq.min"
          :max="scannerParams.pulse_freq.max"
          :step="scannerParams.pulse_freq.step"
        />
        <input
          v-else-if="scannerParams.pulse_freq.default !== null"
          :value="scannerParams.pulse_freq.default"
          type="number"
          disabled
          class="input-readonly"
        />
        <span v-if="scannerParams.pulse_freq.readonly" class="field-range">固定值</span>
        <span v-else class="field-range">有效范围：{{ scannerParams.pulse_freq.min }} ~ {{ scannerParams.pulse_freq.max }}</span>
        <span v-if="scannerParams.pulse_freq.note" class="field-note">{{ scannerParams.pulse_freq.note }}</span>
      </div>
    </div>

    <!-- 只读属性 -->
    <div class="field" v-for="(spec, key) in scannerParams" :key="key" v-show="['beamDivergence', 'rangeMin', 'rangeMax'].includes(key)">
      <label>{{ spec.label }} ({{ spec.unit }})</label>
      <div class="field-input-area">
        <input
          v-if="spec.default !== null"
          :value="spec.default"
          type="number"
          disabled
          class="input-readonly"
        />
        <span v-else class="field-range">无上限</span>
        <span class="field-range">固定值</span>
        <span v-if="spec.note" class="field-note">{{ spec.note }}</span>
      </div>
    </div>

    <div class="field">
      <label>输出格式</label>
      <select v-model="simStore.params.output_format">
        <option value="LAS">LAS</option>
        <option value="LAZ">LAZ</option>
        <option value="XYZ">XYZ</option>
      </select>
    </div>

    <button class="btn" style="width: 100%" @click="generateConfig">生成配置</button>
  </section>
</template>