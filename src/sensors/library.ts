import type { Architecture, SensorDefinition } from '../core/types'

const defaults = { timestampConvention: 'instantaneous' as const, integrationTimeS: 0.1, readoutTimeS: 0.02 }

export const SENSOR_LIBRARY: SensorDefinition[] = [
  { ...defaults, id: 'ls-c4', name: 'LSLiDAR C4', architecture: 'rotating-head', standOffM: 1.1, horizontalFovDeg: 360, verticalFovDeg: 24, channelCount: 4, horizontalResolutionDeg: 0.18, headRateHz: 10 },
  { ...defaults, id: 'ls-c8', name: 'LSLiDAR C8', architecture: 'rotating-head', standOffM: 1.1, horizontalFovDeg: 360, verticalFovDeg: 24, channelCount: 8, horizontalResolutionDeg: 0.18, headRateHz: 10 },
  { ...defaults, id: 'puck-hires', name: 'Velodyne Puck Hi-Res', architecture: 'rotating-head', standOffM: 1.4, horizontalFovDeg: 360, verticalFovDeg: 20, channelCount: 16, horizontalResolutionDeg: 0.18, headRateHz: 10 },
  { ...defaults, id: 'hdl-32e', name: 'Velodyne HDL-32E', architecture: 'rotating-head', standOffM: 1, horizontalFovDeg: 360, verticalFovDeg: 41.3, channelCount: 32, horizontalResolutionDeg: 0.18, headRateHz: 10 },
  { ...defaults, id: 'os1-64', name: 'Ouster OS1-64', architecture: 'rotating-head', standOffM: 1, horizontalFovDeg: 360, verticalFovDeg: 45, channelCount: 64, horizontalResolutionDeg: 0.18, headRateHz: 10 },
  { ...defaults, id: 'os1-128', name: 'Ouster OS1-128', architecture: 'rotating-head', standOffM: 1, horizontalFovDeg: 360, verticalFovDeg: 45, channelCount: 128, horizontalResolutionDeg: 0.18, headRateHz: 10 },
  { ...defaults, id: 'livox-avia', name: 'Livox Avia', architecture: 'prism', standOffM: 1, horizontalFovDeg: 70.4, verticalFovDeg: 77.2, prismRateAHz: 17.3, prismRateBHz: -21.7, wedgeADeg: 5.5, wedgeBDeg: 7, sampleRateHz: 240000, timestampConvention: 'window-start' },
  { ...defaults, id: 'livox-horizon', name: 'Livox Horizon', architecture: 'prism', standOffM: 1.2, horizontalFovDeg: 81.7, verticalFovDeg: 25.1, prismRateAHz: 19.1, prismRateBHz: -23.3, wedgeADeg: 6, wedgeBDeg: 4, sampleRateHz: 240000 },
  { ...defaults, id: 'livox-tele15', name: 'Livox Tele-15', architecture: 'prism', standOffM: 1.82, horizontalFovDeg: 14.5, verticalFovDeg: 16.2, prismRateAHz: 15.7, prismRateBHz: -19.9, wedgeADeg: 3, wedgeBDeg: 3.5, sampleRateHz: 240000 },
  { ...defaults, id: 'blickfeld-cube1', name: 'Blickfeld Cube 1', architecture: 'micro-mirror', standOffM: 1, horizontalFovDeg: 72, verticalFovDeg: 30, sampleRateHz: 97000, fastAxisHz: 137, slowAxisHz: 0.7 },
  { ...defaults, id: 'hesai-ft120', name: 'Hesai FT120', architecture: 'electronic-array', standOffM: 1, horizontalFovDeg: 100, verticalFovDeg: 75, gridColumns: 120, gridRows: 90 },
  { ...defaults, id: 'livox-mid360', name: 'Livox Mid-360', architecture: 'rotating-mirror', standOffM: 1, horizontalFovDeg: 360, verticalFovDeg: 59, sampleRateHz: 200000, emitterCount: 16, headRateHz: 10 },
  { ...defaults, id: 'single-plane', name: 'Single-plane scanner', architecture: 'single-plane', standOffM: 1, horizontalFovDeg: 120, verticalFovDeg: 30, horizontalResolutionDeg: 0.1, headRateHz: 10 },
  { ...defaults, id: 'flir-global', name: 'FLIR Blackfly S', architecture: 'camera', standOffM: 1, horizontalFovDeg: 94.9, verticalFovDeg: 79, resolution: [1936, 1464], focalLengthMm: 4, pixelPitchUm: 4.5, shutter: 'global', spectralBand: 'visible', timestampConvention: 'exposure-midpoint', integrationTimeS: 0.006 },
  { ...defaults, id: 'flir-rolling', name: 'FLIR Blackfly S — 20 ms rolling', architecture: 'camera', standOffM: 1, horizontalFovDeg: 94.9, verticalFovDeg: 79, resolution: [1936, 1464], focalLengthMm: 4, pixelPitchUm: 4.5, shutter: 'rolling', spectralBand: 'visible', timestampConvention: 'rolling-readout', integrationTimeS: 0.005 },
  { ...defaults, id: 'thermal-640', name: 'Thermal 640 × 512', architecture: 'camera', standOffM: 1, horizontalFovDeg: 45, verticalFovDeg: 36.9, resolution: [640, 512], focalLengthMm: 7.46, pixelPitchUm: 12, shutter: 'global', spectralBand: '8–14 µm, ΔT ≈ 5 K', timestampConvention: 'exposure-midpoint', integrationTimeS: 0.01 },
  { ...defaults, id: 'nir-905', name: 'Near-infrared 905 nm', architecture: 'camera', standOffM: 1, horizontalFovDeg: 50, verticalFovDeg: 40, resolution: [1280, 1024], focalLengthMm: 7.46, pixelPitchUm: 6, shutter: 'global', spectralBand: '905 nm reflected intensity', timestampConvention: 'exposure-midpoint', integrationTimeS: 0.006 },
]

export const byId = (id: string): SensorDefinition => {
  const sensor = SENSOR_LIBRARY.find((candidate) => candidate.id === id)
  if (!sensor) throw new Error(`Unknown sensor: ${id}`)
  return structuredClone(sensor)
}
export const sensorsForArchitecture = (architecture: Architecture): SensorDefinition[] => SENSOR_LIBRARY.filter((sensor) => sensor.architecture === architecture)
export const ARCHITECTURE_LABELS: Record<Architecture, string> = {
  'rotating-head': 'Rotating multi-channel head', prism: 'Counter-rotating prism', 'micro-mirror': 'Oscillating micro-mirror',
  'electronic-array': 'Solid-state electronic array', 'rotating-mirror': 'Rotating mirror', 'single-plane': 'Single-plane scanner', camera: 'Camera',
}
export const customSensorErrors = (sensor: SensorDefinition): string[] => {
  const errors: string[] = []
  if (!sensor.name.trim()) errors.push('Name is required')
  if (!(sensor.standOffM > 0)) errors.push('Stand-off must be positive')
  if (!(sensor.horizontalFovDeg > 0 && sensor.horizontalFovDeg <= 360)) errors.push('Horizontal FOV must be in (0, 360]')
  if (!(sensor.verticalFovDeg > 0 && sensor.verticalFovDeg < 180)) errors.push('Vertical FOV must be in (0, 180)')
  if (sensor.architecture === 'camera' && (!sensor.resolution || sensor.resolution.some((v) => v < 32) || !sensor.focalLengthMm || !sensor.pixelPitchUm)) errors.push('Camera optics and resolution are required')
  if (sensor.architecture === 'rotating-head' && (!sensor.channelCount || sensor.channelCount < 1)) errors.push('Channel count must be positive')
  if (['prism', 'micro-mirror', 'rotating-mirror'].includes(sensor.architecture) && !(sensor.sampleRateHz && sensor.sampleRateHz > 0)) errors.push('Pulse rate must be positive')
  return errors
}
