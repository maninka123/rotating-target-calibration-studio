import { contourEstimate, geometricEstimate } from './estimators'
import { estimatorInputFromFrame, evaluateEstimate } from './estimation'
import { wrapDeg } from './geometry'
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
}

export interface PairwiseOffset {
  fromSensor: string
  toSensor: string
  estimator: SweepEstimator
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
  }
}

export const runSweep = (
  target: TargetConfig,
  sensors: PlacedSensor[],
  rpm: number,
  acquisitions: number,
  estimators: SweepEstimator[],
  searchResolutionDeg = 1,
  onProgress?: (fraction: number) => void,
  rotations = 1,
): { records: SweepRecord[], summaries: SweepSummary[], pairwiseOffsets: PairwiseOffset[] } => {
  const records: SweepRecord[] = []
  for (let acquisition = 0; acquisition < acquisitions; acquisition += 1) {
    const start = acquisition * (rpm > 0 ? rotations * 60 / rpm / acquisitions : 0.03)
    for (const sensor of sensors) {
      const frame = generateFrame(sensor, target, rpm, 360 * rotations * acquisition / acquisitions, start, acquisition)
      const input = estimatorInputFromFrame(frame, target, searchResolutionDeg)
      for (const estimator of estimators) {
        const result = evaluateEstimate(estimator === 'geometric' ? geometricEstimate(input) : contourEstimate(input), frame.trueAngleAtReportedDeg, rpm)
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

  const pairwiseOffsets: PairwiseOffset[] = []
  if (sensors.length >= 2) {
    for (let firstIndex = 0; firstIndex < sensors.length - 1; firstIndex += 1) for (let secondIndex = firstIndex + 1; secondIndex < sensors.length; secondIndex += 1) {
      const first = sensors[firstIndex]
      const second = sensors[secondIndex]
    for (const estimator of estimators) {
      const firstRows = records.filter((row) => row.sensor === first.instanceId && row.estimator === estimator && row.accepted)
      const secondRows = records.filter((row) => row.sensor === second.instanceId && row.estimator === estimator && row.accepted)
      const offsets: number[] = []
      for (const row of firstRows) {
        const paired = secondRows.find((candidate) => candidate.acquisition === row.acquisition)
        if (paired && row.errorDeg !== null && paired.errorDeg !== null && rpm !== 0) {
          offsets.push(wrapDeg(row.errorDeg - paired.errorDeg) / (6 * rpm) * 1000)
        }
      }
      const mean = offsets.reduce((sum, value) => sum + value, 0) / Math.max(1, offsets.length)
      const sd = offsets.length > 1
        ? Math.sqrt(offsets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (offsets.length - 1))
        : 0
      pairwiseOffsets.push({ fromSensor: first.instanceId, toSensor: second.instanceId, estimator, recoveredOffsetMs: offsets.length ? mean : null, recoveredOffsetSdMs: offsets.length ? sd : null })
    }
    }
  }
  return { records, summaries, pairwiseOffsets }
}
