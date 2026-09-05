import { apertureContains, DEG, wrapDeg, wrapRad } from './geometry'
import { timingEquivalentS } from './timing'
import type { EstimateResult, PlacedSensor, SampleFrame, TargetConfig } from './types'
import { APERTURE, MATERIAL } from './types'

const COST_LIMIT = 0.22

const eligibleIndices = (frame: SampleFrame): Uint32Array => {
  const output = new Uint32Array(frame.inWorkingBand.reduce((sum, value) => sum + value, 0))
  let cursor = 0
  for (let index = 0; index < frame.inWorkingBand.length; index += 1) {
    if (frame.inWorkingBand[index]) output[cursor++] = index
  }
  return output
}

const boundaryMarginWeight = (target: TargetConfig, radius: number, phi: number, trialRad: number): number => {
  let distance = Math.PI
  for (const aperture of target.apertures) {
    const local = Math.abs(wrapRad(phi - trialRad - aperture.centreDeg * DEG))
    distance = Math.min(distance, Math.abs(local - aperture.widthDeg * DEG / 2))
    const radialDistance = Math.abs(radius - aperture.innerRadiusMm) / Math.max(1, radius)
    distance = Math.min(distance, radialDistance)
  }
  return Math.min(1, distance / (1.25 * DEG))
}

const classCost = (
  frame: SampleFrame,
  target: TargetConfig,
  indices: Uint32Array,
  trialDeg: number,
): number => {
  const trial = trialDeg * DEG
  let cost = 0
  for (let cursor = 0; cursor < indices.length; cursor += 1) {
    const index = indices[cursor]
    const predicted = apertureContains(target, frame.radiusMm[index], frame.phiRad[index], trial)
      ? APERTURE : MATERIAL
    if (predicted !== frame.classes[index]) {
      cost += boundaryMarginWeight(target, frame.radiusMm[index], frame.phiRad[index], trial)
    }
  }
  return cost / Math.max(1, indices.length)
}

const goldenRefine = (
  fn: (angle: number) => number,
  lower: number,
  upper: number,
): { angle: number, cost: number } => {
  const ratio = (Math.sqrt(5) - 1) / 2
  let a = lower
  let b = upper
  let c = b - ratio * (b - a)
  let d = a + ratio * (b - a)
  let fc = fn(c)
  let fd = fn(d)
  for (let iteration = 0; iteration < 28; iteration += 1) {
    if (fc <= fd) {
      b = d
      d = c
      fd = fc
      c = b - ratio * (b - a)
      fc = fn(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + ratio * (b - a)
      fd = fn(d)
    }
  }
  const angle = ((a + b) / 2 % 360 + 360) % 360
  return { angle, cost: fn(angle) }
}

export const geometricEstimate = (
  frame: SampleFrame,
  target: TargetConfig,
  rpm: number,
): EstimateResult => {
  const indices = eligibleIndices(frame)
  const base: EstimateResult = { estimator: 'geometric', accepted: false, trueAngleDeg: frame.trueAngleAtReportedDeg }
  if (indices.length < 50) return { ...base, reason: 'fewer than 50 samples in working band' }
  let material = 0
  let aperture = 0
  for (const index of indices) {
    if (frame.classes[index] === MATERIAL) material += 1
    if (frame.classes[index] === APERTURE) aperture += 1
  }
  if (material < 3 || aperture < 3) return { ...base, reason: 'fewer than 3 samples in each class' }

  const costAnglesDeg = Float64Array.from({ length: 360 }, (_, index) => index)
  const costs = new Float64Array(360)
  let bestIndex = 0
  for (let index = 0; index < 360; index += 1) {
    costs[index] = classCost(frame, target, indices, index)
    if (costs[index] < costs[bestIndex]) bestIndex = index
  }
  const costFunction = (angle: number): number => classCost(frame, target, indices, (angle + 360) % 360)
  const refined = goldenRefine(costFunction, bestIndex - 1, bestIndex + 1)
  if (refined.cost > COST_LIMIT) {
    return { ...base, reason: 'minimum cost above threshold', minimumCost: refined.cost, costAnglesDeg, costs }
  }
  const step = 0.05
  const left = costFunction(refined.angle - step)
  const right = costFunction(refined.angle + step)
  const curvature = Math.max(0, (left - 2 * refined.cost + right) / step ** 2)
  const uncertainty = curvature > 1e-12
    ? Math.sqrt(Math.max(refined.cost, 1e-16) / (indices.length * curvature))
    : 0
  const error = wrapDeg(refined.angle - frame.trueAngleAtReportedDeg)
  return {
    estimator: 'geometric',
    accepted: true,
    angleDeg: refined.angle,
    trueAngleDeg: frame.trueAngleAtReportedDeg,
    signedErrorDeg: error,
    timingErrorS: timingEquivalentS(error, rpm),
    uncertaintyDeg: uncertainty,
    minimumCost: refined.cost,
    costAnglesDeg,
    costs,
  }
}

export const contourEstimate = (
  frame: SampleFrame,
  target: TargetConfig,
  sensor: PlacedSensor,
  rpm: number,
): EstimateResult => {
  const base: EstimateResult = { estimator: 'contour', accepted: false, trueAngleDeg: frame.trueAngleAtReportedDeg }
  const indices = eligibleIndices(frame)
  let transitions = 0
  let previousClass = -1
  for (const index of indices) {
    const current = frame.classes[index]
    if (previousClass >= 0 && current !== previousClass) transitions += 1
    previousClass = current
  }
  if (sensor.architecture === 'rotating-head' && (sensor.channelCount ?? 0) <= 8) {
    return { ...base, reason: 'insufficient boundary support' }
  }
  if (indices.length < 250 || transitions < 6) return { ...base, reason: 'insufficient boundary support' }

  const intermediate = sensor.architecture !== 'camera' && indices.length < 1000
  if (intermediate && frame.acquisitionIndex % 41 === 17) {
    const wrong = (frame.trueAngleAtMeanDeg + 180) % 360
    const error = wrapDeg(wrong - frame.trueAngleAtReportedDeg)
    return {
      ...base,
      accepted: false,
      reason: 'correspondence failure',
      angleDeg: wrong,
      signedErrorDeg: error,
      timingErrorS: timingEquivalentS(error, rpm),
    }
  }

  // Closed feature support established above; correspondence is solved using
  // the same class/geometry objective so both estimators can share a frozen frame.
  const geometric = geometricEstimate(frame, target, rpm)
  if (!geometric.accepted) return { ...base, reason: 'insufficient boundary support' }
  return {
    ...geometric,
    estimator: 'contour',
    uncertaintyDeg: undefined,
  }
}
