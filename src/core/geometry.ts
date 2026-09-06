import type { Aperture, TargetConfig } from './types'

export const DEG = Math.PI / 180
export const wrapRad = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value))
export const wrapDeg = (value: number): number => ((value + 180) % 360 + 360) % 360 - 180

// Piecewise radial extent of remaining material, including the circular seam.
const radialProfile = (target: TargetConfig) => {
  const radius = target.outerDiameterMm / 2
  const positive = (angle: number) => ((angle % 360) + 360) % 360
  const boundaries = [...new Set([0, 360, ...target.apertures.flatMap((a) => [positive(a.centreDeg - a.widthDeg / 2), positive(a.centreDeg + a.widthDeg / 2)])])].sort((a, b) => a - b)
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]
    const active = target.apertures.filter((a) => a.innerRadiusMm < radius && Math.abs(wrapDeg((start + end) / 2 - a.centreDeg)) < a.widthDeg / 2)
    return { start, end, radius: Math.min(radius, ...active.map((a) => a.innerRadiusMm)) }
  })
}

export const apertureRegions = (target: TargetConfig): Aperture[] => {
  const pieces: ReturnType<typeof radialProfile> = []
  for (const piece of radialProfile(target)) {
    const previous = pieces.at(-1)
    if (previous && Math.abs(previous.radius - piece.radius) < 1e-9) previous.end = piece.end
    else pieces.push({ ...piece })
  }
  if (pieces.length > 1 && Math.abs(pieces[0].radius - pieces.at(-1)!.radius) < 1e-9) {
    pieces[0].start = pieces.pop()!.start - 360
  }
  return pieces.filter((piece) => piece.radius < target.outerDiameterMm / 2).map((piece, index) => ({ id: `region-${index}`, widthDeg: piece.end - piece.start, centreDeg: ((piece.start + piece.end) / 2 + 360) % 360, innerRadiusMm: piece.radius }))
}

export const angularSensitivity = (target: TargetConfig): number => {
  const profile = radialProfile(target)
  return profile.reduce((sum, piece, index) => sum + Math.abs(piece.radius ** 3 - profile[(index + profile.length - 1) % profile.length].radius ** 3) / 3, 0)
}

export const apertureArea = (target: TargetConfig): number => {
  const radius = target.outerDiameterMm / 2
  return apertureRegions(target).reduce(
    (sum, aperture) => sum + 0.5 * aperture.widthDeg * DEG
      * (radius ** 2 - aperture.innerRadiusMm ** 2),
    0,
  )
}

const sectorCentroidRadius = (radius: number, aperture: Aperture): number => {
  const half = aperture.widthDeg * DEG / 2
  const angularFactor = Math.abs(half) < 1e-12 ? 1 : Math.sin(half) / half
  return (2 / 3) * (radius ** 3 - aperture.innerRadiusMm ** 3)
    / (radius ** 2 - aperture.innerRadiusMm ** 2) * angularFactor
}

export const centreOfMassEccentricity = (target: TargetConfig): number => {
  const radius = target.outerDiameterMm / 2
  let mx = 0
  let my = 0
  let removed = 0
  for (const aperture of apertureRegions(target)) {
    const area = 0.5 * aperture.widthDeg * DEG * (radius ** 2 - aperture.innerRadiusMm ** 2)
    if (area <= 0) continue
    const centroidRadius = sectorCentroidRadius(radius, aperture)
    mx += area * centroidRadius * Math.cos(aperture.centreDeg * DEG)
    my += area * centroidRadius * Math.sin(aperture.centreDeg * DEG)
    removed += area
  }
  const remainingArea = Math.PI * radius ** 2 - removed
  const magnitude = Math.hypot(mx, my)
  return magnitude < Math.max(1, removed) * 1e-12 ? 0 : magnitude / remainingArea
}

export const overlappingAperturePair = (apertures: Aperture[]): [number, number] | null => {
  for (let first = 0; first < apertures.length; first += 1) for (let second = first + 1; second < apertures.length; second += 1) {
    if (Math.abs(wrapDeg(apertures[first].centreDeg - apertures[second].centreDeg)) < (apertures[first].widthDeg + apertures[second].widthDeg) / 2 - 1e-9) return [first, second]
  }
  return null
}

export const minimumPlateThicknessMm = (target: TargetConfig): number => {
  const unsupportedLengthM = (target.outerDiameterMm / 2 - target.hubRadiusMm) / 1000
  const value = 3 * 2700 * 9.81 * unsupportedLengthM ** 4 / (2 * 70e9 * 5e-5)
  return Math.sqrt(value) * 1000
}

export const bendingStressMpa = (unsupportedLengthMm: number, thicknessMm: number): number => {
  const lengthM = unsupportedLengthMm / 1000
  const thicknessM = thicknessMm / 1000
  return 3 * 2700 * 9.81 * lengthM ** 2 / thicknessM / 1e6
}

export const predictedDispersionRatio = (reference: TargetConfig, target: TargetConfig): number =>
  Math.sqrt(angularSensitivity(reference) / angularSensitivity(target))

export const apertureContains = (
  target: TargetConfig,
  radiusMm: number,
  phiRad: number,
  rotationRad: number,
): boolean => target.apertures.some((aperture) => {
  if (radiusMm < aperture.innerRadiusMm || radiusMm > target.outerDiameterMm / 2) return false
  return Math.abs(wrapRad(phiRad - rotationRad - aperture.centreDeg * DEG))
    <= aperture.widthDeg * DEG / 2
})

export const rayPlaneIntersection = (
  directionX: number,
  directionY: number,
  directionZ: number,
  planeDistanceM: number,
): [number, number, number] | null => {
  if (![directionX, directionY, directionZ, planeDistanceM].every(Number.isFinite)) return null
  if (Math.abs(directionZ) < Number.EPSILON) return null
  const scale = planeDistanceM / directionZ
  if (scale <= 0) return null
  return [directionX * scale * 1000, directionY * scale * 1000, planeDistanceM * 1000]
}

export const minimumStandOffM = (outerRadiusMm: number, horizontalFovDeg: number, verticalFovDeg: number): number => {
  const minimumFov = Math.min(horizontalFovDeg, verticalFovDeg) * DEG
  return (outerRadiusMm / 1000) / Math.tan(minimumFov / 2) * 1.1
}

export const targetFitsFov = (target: TargetConfig, horizontalFovDeg: number, verticalFovDeg: number, standOffM: number): boolean =>
  standOffM >= minimumStandOffM(target.outerDiameterMm / 2, horizontalFovDeg, verticalFovDeg)

export const targetFitsElevationLimits = (target: TargetConfig, standOffM: number, lowerDeg: number, upperDeg: number): boolean => {
  const angularRadius = Math.atan((target.outerDiameterMm / 2000) / standOffM) / DEG
  return lowerDeg <= -angularRadius && upperDeg >= angularRadius
}

export const asymmetricCoverage = (target: TargetConfig, standOffM: number, lowerDeg: number, upperDeg: number, pitchDeg = 0): { lowerDeg: number, upperDeg: number, full: boolean, clippedFraction: number, lowerHalfClippedFraction: number, minimumStandOffM: number } => {
  const lower = lowerDeg + pitchDeg
  const upper = upperDeg + pitchDeg
  const angularRadius = Math.atan((target.outerDiameterMm / 2000) / standOffM) / DEG
  const overlap = Math.max(0, Math.min(angularRadius, upper) - Math.max(-angularRadius, lower))
  const binding = Math.min(-lower, upper)
  return {
    lowerDeg: lower,
    upperDeg: upper,
    full: lower <= -angularRadius && upper >= angularRadius,
    clippedFraction: 1 - overlap / (2 * angularRadius),
    lowerHalfClippedFraction: Math.max(0, Math.min(1, (lower + angularRadius) / angularRadius)),
    minimumStandOffM: binding > 0 ? (target.outerDiameterMm / 2000) / Math.tan(binding * DEG) * 1.1 : Number.POSITIVE_INFINITY,
  }
}

export const removedAreaRelativeTo = (target: TargetConfig, reference: TargetConfig): number =>
  apertureArea(target) - apertureArea(reference)
