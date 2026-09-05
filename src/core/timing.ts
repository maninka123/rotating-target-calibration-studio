import type { SensorDefinition } from './types'

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
