import { defineStore } from 'pinia'
import { getPlatform, getScanner } from '../composables/scannerSpecs'
import { useSimulationStore } from './simulation'

export const useScreenshotStore = defineStore('screenshot', {
  state: () => ({
    settings: {
      showParameters: true,
      overlayPosition: 'bottom-left', // bottom-left, bottom-right, top-left, top-right
      quality: 0.8,
      customDimensions: false,
      width: 1920,
      height: 1080,
    },
  }),
  actions: {
    updateSettings(newSettings) {
      this.settings = { ...this.settings, ...newSettings }
    },
    resetSettings() {
      this.settings = {
        showParameters: true,
        overlayPosition: 'bottom-left',
        quality: 0.8,
        customDimensions: false,
        width: 1920,
        height: 1080,
      }
    },
  },
  getters: {
    currentPlatform: () => {
      const simStore = useSimulationStore()
      return getPlatform(simStore.params.platform_id)
    },
    currentScanner: () => {
      const simStore = useSimulationStore()
      return getScanner(simStore.params.scanner_id)
    },
  },
})