import type { SensorDefinition } from './types'

export const TIMESTAMP_DESCRIPTIONS = {
  instantaneous: 'Reported at the first sample observation instant.',
  'window-start': 'Reported at the accumulation-window or frame start.',
  'exposure-midpoint': 'Reported midway between the first and last sample observations.',
  'rolling-readout': 'Reported at the start of the first row exposure.',
} as const

export const angleAtTimeDeg = (initialAngleDeg: number, rpm: number, elapsedS: number): number =>
  ((initialAngleDeg + 6 * rpm * elapsedS) % 360 + 360) % 360

export const reportedTimestamp = (
  sensor: SensorDefinition,
  acquisitionStartS: number,
  firstSampleS: number,
  lastSampleS: number,
): number => {
  switch (sensor.timestampConvention) {
    case 'instantaneous': return firstSampleS
    case 'window-start': return acquisitionStartS
    case 'exposure-midpoint': return (firstSampleS + lastSampleS) / 2
    case 'rolling-readout': return acquisitionStartS
  }
}

export const timingEquivalentS = (errorDeg: number, rpm: number): number | null =>
  rpm === 0 ? null : errorDeg / (6 * rpm)
