import { apertureContains, apertureRegions, angularSensitivity, DEG, wrapDeg, wrapRad } from './geometry'
import type { EstimatorInput, EstimatorOutput } from './types'
import { APERTURE, MATERIAL } from './types'

const COST_LIMIT = 0.22

const eligibleIndices = (input: EstimatorInput): Uint32Array => {
  const output = new Uint32Array(input.inWorkingBand.reduce((sum, value) => sum + value, 0))
  let cursor = 0
  for (let index = 0; index < input.inWorkingBand.length; index += 1) if (input.inWorkingBand[index]) output[cursor++] = index
  return output
}

const boundaryMarginWeight = (input: EstimatorInput, radius: number, phi: number, trialRad: number): number => {
  let distance = Math.PI
  for (const aperture of input.target.apertures) {
    const local = Math.abs(wrapRad(phi - trialRad - aperture.centreDeg * DEG))
    distance = Math.min(distance, Math.abs(local - aperture.widthDeg * DEG / 2))
    distance = Math.min(distance, Math.abs(radius - aperture.innerRadiusMm) / Math.max(1, radius))
  }
  return Math.min(1, distance / (1.25 * DEG))
}

const classCost = (input: EstimatorInput, indices: Uint32Array, trialDeg: number): number => {
  const trial = trialDeg * DEG
  let cost = 0
  for (const index of indices) {
    const predicted = apertureContains(input.target, input.radiusMm[index], input.phiRad[index], trial) ? APERTURE : MATERIAL
    if (predicted !== input.classes[index]) cost += boundaryMarginWeight(input, input.radiusMm[index], input.phiRad[index], trial)
  }
  return cost / Math.max(1, indices.length)
}

const goldenRefine = (fn: (angle: number) => number, lower: number, upper: number): { angle: number, cost: number } => {
  const ratio = (Math.sqrt(5) - 1) / 2
  let a = lower; let b = upper
  let c = b - ratio * (b - a); let d = a + ratio * (b - a)
  let fc = fn(c); let fd = fn(d)
  for (let iteration = 0; iteration < 32; iteration += 1) {
    if (fc <= fd) { b = d; d = c; fd = fc; c = b - ratio * (b - a); fc = fn(c) }
    else { a = c; c = d; fc = fd; d = a + ratio * (b - a); fd = fn(d) }
  }
  const angle = (a + b) / 2
  return { angle: (angle % 360 + 360) % 360, cost: fn(angle) }
}

export const hasTwoDimensionalSupport = (input: EstimatorInput): boolean => {
  let count = 0; let meanX = 0; let meanY = 0; let xx = 0; let yy = 0; let xy = 0
  for (let index = 0; index < input.xMm.length; index += 1) {
    if (!input.inWorkingBand[index]) continue
    const x = input.xMm[index]; const y = input.yMm[index]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    count += 1
    const dx = x - meanX; const dy = y - meanY
    meanX += dx / count; meanY += dy / count
    xx += dx * (x - meanX); yy += dy * (y - meanY); xy += dx * (y - meanY)
  }
  const trace = xx + yy
  // A scale-independent covariance-rank test rejects points and single lines.
  return count >= 3 && trace > 1e-12 && (xx * yy - xy * xy) / trace ** 2 > 1e-6
}

const targetSymmetryOrder = (input: EstimatorInput): number => {
  const apertures = apertureRegions(input.target)
  for (let order = apertures.length; order >= 2; order -= 1) {
    if (apertures.length % order) continue
    const step = 360 / order
    const symmetric = apertures.every((aperture) => {
      const expectedCentre = (aperture.centreDeg + step) % 360
      return apertures.some((candidate) => Math.abs(wrapDeg(candidate.centreDeg - expectedCentre)) < 1e-6 && Math.abs(candidate.widthDeg - aperture.widthDeg) < 1e-6 && Math.abs(candidate.innerRadiusMm - aperture.innerRadiusMm) < 1e-6)
    })
    if (symmetric) return order
  }
  return 1
}

export const geometricEstimate = (input: EstimatorInput): EstimatorOutput => {
  const base: EstimatorOutput = { estimator: 'geometric', accepted: false }
  if (angularSensitivity(input.target) === 0) return { ...base, reason: 'orientation unobservable' }
  const symmetryOrder = targetSymmetryOrder(input)
  if (symmetryOrder > 1) return { ...base, reason: 'orientation ambiguous', ambiguityOrder: symmetryOrder }
  const indices = eligibleIndices(input)
  if (!hasTwoDimensionalSupport(input)) return { ...base, reason: 'insufficient two-dimensional boundary coverage' }
  if (indices.length < 50) return { ...base, reason: 'fewer than 50 samples in working band' }
  let material = 0; let aperture = 0
  for (const index of indices) {
    if (input.classes[index] === MATERIAL) material += 1
    if (input.classes[index] === APERTURE) aperture += 1
  }
  if (material < 3 || aperture < 3) return { ...base, reason: 'fewer than 3 samples in each class' }

  const resolution = input.settings.searchResolutionDeg
  if (!Number.isFinite(resolution) || resolution < 0.05 || resolution > 10) throw new Error('Search resolution must be between 0.05 and 10 degrees')
  const steps = Math.ceil(360 / resolution)
  const costAnglesDeg = Float64Array.from({ length: steps }, (_, index) => index * 360 / steps)
  const costs = new Float64Array(steps)
  let bestIndex = 0
  for (let index = 0; index < steps; index += 1) {
    costs[index] = classCost(input, indices, costAnglesDeg[index])
    if (costs[index] < costs[bestIndex]) bestIndex = index
  }
  const costFunction = (angle: number): number => classCost(input, indices, (angle % 360 + 360) % 360)
  const coarseStep = 360 / steps
  const refined = goldenRefine(costFunction, costAnglesDeg[bestIndex] - coarseStep, costAnglesDeg[bestIndex] + coarseStep)
  if (refined.cost > COST_LIMIT) return { ...base, reason: 'minimum cost above threshold', minimumCost: refined.cost, costAnglesDeg, costs }
  const step = Math.max(0.01, resolution / 10)
  const curvature = Math.max(0, (costFunction(refined.angle - step) - 2 * refined.cost + costFunction(refined.angle + step)) / step ** 2)
  const proxy = curvature > 1e-12 ? Math.sqrt(Math.max(refined.cost, 1e-16) / (indices.length * curvature)) : 0
  return { estimator: 'geometric', accepted: true, angleDeg: refined.angle, localCurvatureProxy: proxy, minimumCost: refined.cost, costAnglesDeg, costs }
}

interface ObservedSector { centreDeg: number, widthDeg: number, innerRadiusMm: number, support: number, polygon: Float64Array }

const extractApertureSectors = (input: EstimatorInput, indices: Uint32Array): ObservedSector[] => {
  const bins = 720
  const counts = new Uint32Array(bins)
  const minimumRadius = new Float64Array(bins).fill(Number.POSITIVE_INFINITY)
  const maximumRadius = new Float64Array(bins)
  const minimumWithinBinDeg = new Float64Array(bins).fill(Number.POSITIVE_INFINITY)
  const maximumWithinBinDeg = new Float64Array(bins)
  for (const index of indices) if (input.classes[index] === APERTURE) {
    const degrees = (input.phiRad[index] / DEG % 360 + 360) % 360
    const bin = Math.floor(degrees / 360 * bins) % bins
    counts[bin] += 1
    const withinBin = degrees - bin * 360 / bins
    minimumWithinBinDeg[bin] = Math.min(minimumWithinBinDeg[bin], withinBin)
    maximumWithinBinDeg[bin] = Math.max(maximumWithinBinDeg[bin], withinBin)
    minimumRadius[bin] = Math.min(minimumRadius[bin], input.radiusMm[index])
    maximumRadius[bin] = Math.max(maximumRadius[bin], input.radiusMm[index])
  }
  const occupied = Array.from(counts, (count) => count > 0)
  for (let pass = 0; pass < 2; pass += 1) {
    const copy = [...occupied]
    for (let i = 0; i < bins; i += 1) if (!copy[i] && copy[(i - 1 + bins) % bins] && copy[(i + 1) % bins]) occupied[i] = true
  }
  if (!occupied.some(Boolean) || occupied.every(Boolean)) return []
  const start = occupied.findIndex((value, index) => !value && occupied[(index + 1) % bins])
  const sectors: ObservedSector[] = []
  let runStart = -1; let support = 0
  for (let offset = 1; offset <= bins; offset += 1) {
    const i = (start + offset) % bins
    if (occupied[i] && runStart < 0) { runStart = offset; support = 0 }
    if (occupied[i]) support += counts[i]
    const next = occupied[(i + 1) % bins]
    if (runStart >= 0 && (!next || offset === bins)) {
      const runEnd = offset
      // Use measured end angles within the bins rather than quantising the
      // orientation to bin edges or centres. End bins always contain samples.
      const firstAngle = (start + runStart) * 360 / bins + minimumWithinBinDeg[(start + runStart) % bins]
      const lastAngle = (start + runEnd) * 360 / bins + maximumWithinBinDeg[(start + runEnd) % bins]
      const widthDeg = lastAngle - firstAngle
      const centreDeg = (((firstAngle + lastAngle) / 2) % 360 + 360) % 360
      const activeBins: number[] = []
      for (let runOffset = runStart; runOffset <= runEnd; runOffset += 1) {
        const bin = (start + runOffset) % bins
        if (counts[bin]) activeBins.push(bin)
      }
      const polygonPoints: number[] = []
      for (const bin of activeBins) {
        const angle = (bin + 0.5) * 360 / bins * DEG
        polygonPoints.push(maximumRadius[bin] * Math.cos(angle), maximumRadius[bin] * Math.sin(angle))
      }
      for (const bin of [...activeBins].reverse()) {
        const angle = (bin + 0.5) * 360 / bins * DEG
        polygonPoints.push(minimumRadius[bin] * Math.cos(angle), minimumRadius[bin] * Math.sin(angle))
      }
      const innerRadiusMm = activeBins.reduce((sum, bin) => sum + minimumRadius[bin], 0) / Math.max(1, activeBins.length)
      sectors.push({ centreDeg, widthDeg, innerRadiusMm, support, polygon: Float64Array.from(polygonPoints) })
      runStart = -1
    }
  }
  return sectors.filter((sector) => sector.support >= 3 && sector.polygon.length >= 6)
}

export const contourEstimate = (input: EstimatorInput): EstimatorOutput => {
  const base: EstimatorOutput = { estimator: 'contour', accepted: false }
  if (angularSensitivity(input.target) === 0) return { ...base, reason: 'orientation unobservable' }
  const symmetryOrder = targetSymmetryOrder(input)
  if (symmetryOrder > 1) return { ...base, reason: 'orientation ambiguous', ambiguityOrder: symmetryOrder }
  if (!hasTwoDimensionalSupport(input)) return { ...base, reason: 'insufficient two-dimensional boundary coverage' }
  if (input.settings.ringCount > 0 && input.settings.ringCount < 3) return { ...base, reason: 'insufficient boundary support' }
  const indices = eligibleIndices(input)
  if (indices.length < 250) return { ...base, reason: 'insufficient boundary support' }
  const observed = extractApertureSectors(input, indices)
  const regions = apertureRegions(input.target)
  if (observed.length < regions.length) return { ...base, reason: 'insufficient boundary support' }

  const available = [...observed]
  const deltas: number[] = []
  for (const expected of [...regions].sort((a, b) => b.widthDeg - a.widthDeg)) {
    let best = -1; let mismatch = Number.POSITIVE_INFINITY
    for (let i = 0; i < available.length; i += 1) {
      const score = Math.abs(available[i].widthDeg - expected.widthDeg) + Math.abs(available[i].innerRadiusMm - expected.innerRadiusMm) / 20
      if (score < mismatch) { mismatch = score; best = i }
    }
    if (best < 0 || mismatch > Math.max(8, expected.widthDeg * 0.4)) return { ...base, reason: 'correspondence failure' }
    const match = available.splice(best, 1)[0]
    deltas.push(wrapDeg(match.centreDeg - expected.centreDeg))
  }
  const x = deltas.reduce((sum, angle) => sum + Math.cos(angle * DEG), 0)
  const y = deltas.reduce((sum, angle) => sum + Math.sin(angle * DEG), 0)
  if (Math.hypot(x, y) < deltas.length * 0.5) return { ...base, reason: 'correspondence failure' }
  return { estimator: 'contour', accepted: true, angleDeg: (Math.atan2(y, x) / DEG + 360) % 360 }
}
