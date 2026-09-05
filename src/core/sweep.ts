import { contourEstimate, geometricEstimate } from './estimators'
import { generateFrame } from './sampling'
import type { PlacedSensor, SweepRecord, TargetConfig } from './types'

export type SweepEstimator = 'contour' | 'geometric'

export interface SweepSummary {
  sensor: string
  estimator: SweepEstimator
  acquisitions: number
  accepted: number
  rejectionRate: number
  maeDeg: number | null
  medianAbsDeg: number | null
  sdDeg: number | null
  p95Deg: number | null
  recoveredOffsetMs: number | null
  recoveredOffsetSdMs: number | null
}

const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return Number.NaN
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export const summariseSweep = (records: SweepRecord[], sensor: string, estimator: SweepEstimator): SweepSummary => {
  const selected = records.filter((row) => row.sensor === sensor && row.estimator === estimator)
  const errors = selected.flatMap((row) => row.errorDeg === null ? [] : [row.errorDeg])
  const absolute = errors.map(Math.abs)
  const mean = errors.reduce((sum, value) => sum + value, 0) / Math.max(1, errors.length)
  const variance = errors.length > 1
    ? errors.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (errors.length - 1)
    : Number.NaN
  return {
    sensor,
    estimator,
    acquisitions: selected.length,
    accepted: errors.length,
    rejectionRate: selected.length ? 1 - errors.length / selected.length : 0,
    maeDeg: errors.length ? absolute.reduce((sum, value) => sum + value, 0) / errors.length : null,
    medianAbsDeg: errors.length ? percentile(absolute, 0.5) : null,
    sdDeg: errors.length > 1 ? Math.sqrt(variance) : null,
    p95Deg: errors.length ? percentile(absolute, 0.95) : null,
    recoveredOffsetMs: null,
    recoveredOffsetSdMs: null,
  }
}

export const runSweep = (
  target: TargetConfig,
  sensors: PlacedSensor[],
  rpm: number,
  acquisitions: number,
  estimators: SweepEstimator[],
  onProgress?: (fraction: number) => void,
): { records: SweepRecord[], summaries: SweepSummary[] } => {
  const records: SweepRecord[] = []
  for (let acquisition = 0; acquisition < acquisitions; acquisition += 1) {
    const start = acquisition * (rpm > 0 ? 60 / rpm / acquisitions : 0.03)
    for (const sensor of sensors) {
      const frame = generateFrame(sensor, target, rpm, 0, start, acquisition)
      for (const estimator of estimators) {
        const result = estimator === 'geometric'
          ? geometricEstimate(frame, target, rpm)
          : contourEstimate(frame, target, sensor, rpm)
        records.push({
          acquisition,
          sensor: sensor.instanceId,
          trueAngleDeg: frame.trueAngleAtReportedDeg,
          reportedTimeS: frame.reportedTimeS,
          meanObservationTimeS: frame.meanObservationTimeS,
          estimator,
          accepted: result.accepted,
          errorDeg: result.signedErrorDeg ?? null,
          timingErrorS: result.timingErrorS ?? null,
          reason: result.reason ?? '',
        })
      }
    }
    onProgress?.((acquisition + 1) / acquisitions)
  }
  const summaries = sensors.flatMap((sensor) => estimators.map((estimator) =>
    summariseSweep(records, sensor.instanceId, estimator)))

  if (sensors.length >= 2) {
    const [first, second] = sensors
    for (const estimator of estimators) {
      const firstRows = records.filter((row) => row.sensor === first.instanceId && row.estimator === estimator && row.accepted)
      const secondRows = records.filter((row) => row.sensor === second.instanceId && row.estimator === estimator && row.accepted)
      const offsets: number[] = []
      for (const row of firstRows) {
        const paired = secondRows.find((candidate) => candidate.acquisition === row.acquisition)
        if (paired && row.errorDeg !== null && paired.errorDeg !== null && rpm !== 0) {
          offsets.push((row.errorDeg - paired.errorDeg) / (6 * rpm) * 1000)
        }
      }
      const mean = offsets.reduce((sum, value) => sum + value, 0) / Math.max(1, offsets.length)
      const sd = offsets.length > 1
        ? Math.sqrt(offsets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (offsets.length - 1))
        : 0
      summaries.filter((summary) => summary.estimator === estimator).forEach((summary) => {
        summary.recoveredOffsetMs = offsets.length ? mean : null
        summary.recoveredOffsetSdMs = offsets.length ? sd : null
      })
    }
  }
  return { records, summaries }
}
