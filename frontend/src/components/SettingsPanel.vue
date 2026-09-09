<script setup>
import { onMounted, ref } from 'vue'
import { useHeliosAPI } from '../composables/useHeliosAPI'
import { useScreenshotStore } from '../stores/screenshot'

const api = useHeliosAPI()
const cacheData = ref(null)
const envData = ref(null)
const loading = ref(false)
const envLoading = ref(false)
const screenshotStore = useScreenshotStore()
const screenshotSettings = ref({ ...screenshotStore.settings })

// 截图设置
const showParamOptions = [
  { value: true, label: '显示参数' },
  { value: false, label: '隐藏参数' },
]
const overlayPositionOptions = [
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下' },
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
]

async function loadCache() {
  loading.value = true
  try {
    const res = await api.listCache()
    cacheData.value = res.cache
  } catch (e) {
    console.error(e)
  }
  loading.value = false
}

async function clearCache(type) {
  try {
    await api.clearCache(type)
    await loadCache()
  } catch (e) {
    console.error(e)
  }
}

async function loadEnvDiag() {
  envLoading.value = true
  try {
    envData.value = await api.diagnoseEnv()
  } catch (e) {
    console.error(e)
  }
  envLoading.value = false
}

function fmtSize(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

// 截图设置相关函数
function updateScreenshotSetting(key, value) {
  screenshotSettings.value[key] = value
  if (key === 'customDimensions' && !value) {
    screenshotSettings.value.width = 1920
    screenshotSettings.value.height = 1080
  }
}

function applyScreenshotSettings() {
  screenshotStore.updateSettings(screenshotSettings.value)
  // 保存到本地存储
  localStorage.setItem('fehals_screenshot_settings', JSON.stringify(screenshotSettings.value))
}

function resetScreenshotSettings() {
  screenshotSettings.value = { ...screenshotStore.settings.resetSettings() }
  applyScreenshotSettings()
}

onMounted(() => {
  // 加载保存的设置
  const saved = localStorage.getItem('fehals_screenshot_settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      screenshotSettings.value = { ...screenshotStore.settings, ...parsed }
    } catch (e) {
      console.error('Failed to load screenshot settings:', e)
    }
  }
  loadEnvDiag()
  loadCache()
})

// 用于模板的类型声明
const statusText = { ok: '正常', warning: '警告', error: '错误' }
const statusIcon = { ok: '✓', warning: '!', error: '✗' }
</script>

<template>
  <!-- 环境诊断 -->
  <section class="panel settings-panel">
    <div class="panel-head">
      <h3 class="panel-title">环境诊断</h3>
      <button class="btn btn-sm" :disabled="envLoading" @click="loadEnvDiag">
        {{ envLoading ? '检测中...' : '重新检测' }}
      </button>
    </div>

    <div v-if="envLoading" class="settings-loading">正在检测 FeHALS 运行环境...</div>
    <div v-else-if="!envData" class="settings-loading">无法加载环境诊断信息</div>
    <template v-else>
      <!-- 整体状态 -->
      <div class="env-overall" :class="'env-overall-' + envData.overall">
        <span class="env-status-icon">{{ statusIcon[envData.overall] }}</span>
        <span class="env-status-text">{{ statusText[envData.overall] }}</span>
        <span class="env-summary">{{ envData.summary }}</span>
      </div>

      <!-- Python 后端环境 -->
      <div class="env-section">
        <div class="env-section-title">
          Python 后端环境
          <span class="env-badge" :class="'env-badge-' + envData.python_env.status">
            {{ statusIcon[envData.python_env.status] }}
            {{ statusText[envData.python_env.status] }}
          </span>
        </div>
        <div class="env-detail-row">
          <span class="env-detail-label">Python 版本</span>
          <span class="env-detail-value">{{ envData.python_env.python_version }}</span>
        </div>

        <!-- 关键依赖 -->
        <div class="env-sub-group">
          <div class="env-sub-title">关键依赖</div>
          <div class="env-check-list">
            <div
              v-for="dep in envData.python_env.critical_deps"
              :key="dep.name"
              class="env-check-item"
            >
              <span class="env-check-icon" :class="'env-icon-' + dep.status">{{ statusIcon[dep.status] }}</span>
              <span class="env-check-path">{{ dep.name }}</span>
              <span class="env-check-desc">
                {{ dep.installed ? (dep.version || '已安装') : dep.error }}
              </span>
            </div>
          </div>
        </div>

        <!-- 可选依赖 -->
        <div class="env-sub-group">
          <div class="env-sub-title">可选依赖</div>
          <div class="env-check-list">
            <div
              v-for="dep in envData.python_env.optional_deps"
              :key="dep.name"
              class="env-check-item"
            >
              <span class="env-check-icon" :class="'env-icon-' + dep.status">{{ statusIcon[dep.status] }}</span>
              <span class="env-check-path">{{ dep.name }}</span>
              <span class="env-check-desc">
                {{ dep.installed ? (dep.version || '已安装') : '未安装（部分功能受限）' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 静态工作目录 -->
      <div class="env-section">
        <div class="env-section-title">
          静态工作目录
          <span class="env-badge" :class="'env-badge-' + (envData.static_dirs.some(d => d.status === 'error') ? 'error' : 'ok')">
            {{ statusText[envData.static_dirs.some(d => d.status === 'error') ? 'error' : 'ok'] }}
          </span>
        </div>
        <div class="env-check-list">
          <div
            v-for="d in envData.static_dirs"
            :key="d.name"
            class="env-check-item"
          >
            <span class="env-check-icon" :class="'env-icon-' + d.status">{{ statusIcon[d.status] }}</span>
            <span class="env-check-path">{{ d.label }}</span>
            <span class="env-check-desc">{{ d.message }}</span>
          </div>
        </div>
      </div>

      <!-- HELIOS++ 可执行文件（外部引擎，附加信息） -->
      <div class="env-section">
        <div class="env-section-title">
          HELIOS++ 仿真引擎
          <span class="env-badge" :class="'env-badge-' + envData.helios_executable.status">
            {{ statusIcon[envData.helios_executable.status] }}
            {{ statusText[envData.helios_executable.status] }}
          </span>
        </div>
        <div class="env-detail-row">
          <span class="env-detail-label">配置路径</span>
          <span class="env-detail-value">{{ envData.helios_executable.path }}</span>
        </div>
        <div class="env-detail-row" v-if="envData.helios_executable.resolved_path">
          <span class="env-detail-label">实际路径</span>
          <span class="env-detail-value">{{ envData.helios_executable.resolved_path }}</span>
        </div>
        <div class="env-detail-row" v-if="envData.helios_executable.status !== 'ok'">
          <span class="env-detail-hint">{{ envData.helios_executable.message }}</span>
        </div>
        <div class="env-detail-row" v-if="envData.helios_executable.status === 'ok'">
          <span class="env-detail-hint env-text-ok">{{ envData.helios_executable.message }}</span>
        </div>
      </div>
    </template>
  </section>

  <!-- 缓存管理 -->
  <section class="panel settings-panel">
    <h3 class="panel-title">缓存管理</h3>
    <div v-if="loading" class="settings-loading">加载中...</div>
    <div v-else-if="!cacheData" class="settings-loading">无法加载缓存信息</div>
    <div v-else class="cache-list">
      <div v-for="(item, key) in cacheData" :key="key" class="cache-item">
        <span class="cache-label">{{ item.label }}</span>
        <span class="cache-info">{{ item.count }} 个文件 / {{ fmtSize(item.size) }}</span>
        <button class="btn btn-sm" @click="clearCache(key)">清理</button>
      </div>
    </div>
  </section>

  <!-- 截图设置 -->
  <section class="panel settings-panel">
    <h3 class="panel-title">截图设置</h3>

    <div class="settings-section">
      <h4 class="section-title">参数显示</h4>
      <div class="field">
        <label>参数叠加</label>
        <select v-model="screenshotSettings.showParameters" @change="updateScreenshotSetting('showParameters', $event.target.value)">
          <option v-for="opt in showParamOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="field">
        <label>叠加位置</label>
        <select v-model="screenshotSettings.overlayPosition" @change="updateScreenshotSetting('overlayPosition', $event.target.value)">
          <option v-for="opt in overlayPositionOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h4 class="section-title">图像质量</h4>
      <div class="field">
        <label>截图质量</label>
        <div class="slider-container">
          <input
            type="range"
            v-model="screenshotSettings.quality"
            min="0.1"
            max="1"
            step="0.1"
            @input="updateScreenshotSetting('quality', parseFloat($event.target.value))"
          />
          <span class="slider-value">{{ screenshotSettings.quality }}</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h4 class="section-title">图像尺寸</h4>
      <div class="field checkbox-field">
        <label>
          <input
            type="checkbox"
            v-model="screenshotSettings.customDimensions"
            @change="updateScreenshotSetting('customDimensions', $event.target.checked)"
          />
          <span>使用自定义尺寸</span>
        </label>
      </div>

      <div v-if="screenshotSettings.customDimensions" class="dimensions-fields">
        <div class="field">
          <label>宽度 (px)</label>
          <input
            type="number"
            v-model.number="screenshotSettings.width"
            min="1"
            @input="updateScreenshotSetting('width', parseInt($event.target.value) || 1920)"
          />
        </div>
        <div class="field">
          <label>高度 (px)</label>
          <input
            type="number"
            v-model.number="screenshotSettings.height"
            min="1"
            @input="updateScreenshotSetting('height', parseInt($event.target.value) || 1080)"
          />
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button class="btn btn-primary" @click="applyScreenshotSettings">应用设置</button>
      <button class="btn btn-secondary" @click="resetScreenshotSettings">重置默认</button>
    </div>
  </section>
</template>