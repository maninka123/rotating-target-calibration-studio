import { DEG } from './geometry'
import type { SensorDefinition } from './types'

export interface SensorFov { horizontalDeg: number, verticalDeg: number }

export const cameraFovDeg = (sensor: Pick<SensorDefinition, 'resolution' | 'pixelPitchUm' | 'focalLengthMm'>): SensorFov => {
  if (!sensor.resolution || !sensor.pixelPitchUm || !sensor.focalLengthMm) throw new Error('Camera resolution, pixel pitch and focal length are required')
  const pitchMm = sensor.pixelPitchUm / 1000
  return {
    horizontalDeg: 2 * Math.atan(sensor.resolution[0] * pitchMm / (2 * sensor.focalLengthMm)) / DEG,
    verticalDeg: 2 * Math.atan(sensor.resolution[1] * pitchMm / (2 * sensor.focalLengthMm)) / DEG,
  }
}

export const sensorFovDeg = (sensor: SensorDefinition): SensorFov => sensor.architecture === 'camera'
  ? cameraFovDeg(sensor)
  : { horizontalDeg: sensor.horizontalFovDeg ?? 0, verticalDeg: sensor.verticalFovDeg ?? 0 }
