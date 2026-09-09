// HELIOS++ 平台与扫描器参数规格
// 数据来源：3rd/helios/python/pyhelios/data/{scanners_als,scanners_tls,platforms}.xml
// 独立选择：平台与扫描器解耦，各平台/扫描器定义自身的参数有效范围

export const PLATFORMS = [
  {
    id: 'copter_linearpath',
    label: 'Quadrocopter UAV',
    type: 'linearpath',
    description: '四旋翼无人机（运动学模型）',
    params: {
      speed: { label: '飞行速度', unit: 'm/s', min: 0.5, max: 50, step: 0.5, default: 5.0 },
      altitude: { label: '飞行高度', unit: 'm', min: 3, max: 500, step: 1, default: 100.0 },
    },
  },
  {
    id: 'vehicle_linearpath',
    label: 'Vehicle',
    type: 'linearpath',
    description: '地面车载平台（运动学模型）',
    params: {
      speed: { label: '行驶速度', unit: 'm/s', min: 0.5, max: 30, step: 0.5, default: 5.0 },
      altitude: { label: '传感器高度', unit: 'm', min: 0.5, max: 5, step: 0.1, default: 2.4 },
    },
  },
  {
    id: 'tripod',
    label: 'TLS Tripod (static)',
    type: 'static',
    description: '地面三脚架（静态扫描）',
    params: {
      altitude: { label: '架设高度', unit: 'm', min: 0.5, max: 10, step: 0.1, default: 1.5 },
    },
  },
]

export const SCANNERS = [
  {
    id: 'riegl_vux-1uav',
    heliosFile: 'scanners_als.xml',
    label: 'RIEGL VUX-1UAV',
    optics: 'rotating',
    description: '无人机 ALS 旋转镜扫描仪，±165° 宽视场',
    params: {
      scan_freq: { label: '扫描频率', unit: 'Hz', min: 10, max: 200, step: 1, default: 10.0 },
      scan_angle: { label: '扫描角度', unit: '±deg', min: 1, max: 165, step: 1, default: 30.0 },
      pulse_freq: { label: '脉冲频率', unit: 'kHz', min: 50, max: 550, step: 10, default: 50.0, note: '50,100,200,300,380,550kHz' },
      beamDivergence: { label: '光束发散角', unit: 'mrad', default: 0.5, readonly: true },
      rangeMin: { label: '最小测程', unit: 'm', default: 3, readonly: true },
      rangeMax: { label: '最大测程', unit: 'm', default: null, readonly: true, note: 'HELIOS++ 未声明，视为无上限' },
    },
  },
  {
    id: 'riegl_vq_780i',
    heliosFile: 'scanners_als.xml',
    label: 'RIEGL VQ 780i',
    optics: 'rotating',
    description: '高性能 ALS 旋转镜扫描仪，最大脉冲 1 MHz',
    params: {
      scan_freq: { label: '扫描频率', unit: 'Hz', min: 20, max: 300, step: 1, default: 20.0 },
      scan_angle: { label: '扫描角度', unit: '±deg', min: 1, max: 30, step: 1, default: 30.0 },
      pulse_freq: { label: '脉冲频率', unit: 'kHz', min: 150, max: 1000, step: 50, default: 150.0, note: '150,250,350,500,700,1000kHz' },
      beamDivergence: { label: '光束发散角', unit: 'mrad', default: 0.25, readonly: true },
      rangeMin: { label: '最小测程', unit: 'm', default: 100, readonly: true },
      rangeMax: { label: '最大测程', unit: 'm', default: null, readonly: true, note: 'HELIOS++ 未声明，视为无上限' },
    },
  },
  {
    id: 'vlp16',
    heliosFile: 'scanners_tls.xml',
    label: 'Velodyne VLP-16',
    optics: 'rotating (16ch)',
    description: '16 通道旋转式激光雷达，垂直 FOV 30°',
    params: {
      scan_freq: { label: '扫描频率', unit: 'Hz', default: null, readonly: true, note: '由转头转速决定（最高 7200°/s）' },
      scan_angle: { label: '扫描角度', unit: '±deg', default: null, readonly: true, note: '多通道固定 ±15° 垂直视场' },
      pulse_freq: { label: '脉冲频率', unit: 'kHz', min: 18.75, max: 18.75, step: 1, default: 18.75, readonly: true },
      beamDivergence: { label: '光束发散角', unit: 'mrad', default: 0.7, readonly: true },
      rangeMin: { label: '最小测程', unit: 'm', default: 0.1, readonly: true },
      rangeMax: { label: '最大测程', unit: 'm', default: 100, readonly: true },
    },
  },
  {
    id: 'livox-avia-non-repetitive',
    heliosFile: 'scanners_tls.xml',
    label: 'Livox Avia (non-rep.)',
    optics: 'risley',
    description: '固态棱镜式非重复扫描 LiDAR，FOV 70.4°',
    params: {
      scan_freq: { label: '扫描频率', unit: 'Hz', default: null, readonly: true, note: '棱镜旋转式，非传统线扫描' },
      scan_angle: { label: '扫描角度', unit: '±deg', default: null, readonly: true, note: '棱镜决定扫描模式，不支持半角配置' },
      pulse_freq: { label: '脉冲频率', unit: 'kHz', min: 40, max: 40, step: 1, default: 40.0, readonly: true },
      beamDivergence: { label: '光束发散角', unit: 'mrad', default: 0.89, readonly: true },
      rangeMin: { label: '最小测程', unit: 'm', default: 1, readonly: true },
      rangeMax: { label: '最大测程', unit: 'm', default: null, readonly: true, note: 'HELIOS++ 未声明，视为无上限' },
    },
  },
]

export function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[0]
}

export function getScanner(id) {
  return SCANNERS.find((s) => s.id === id) || SCANNERS[0]
}