import type { Aperture, TargetConfig } from './types'

export const DEG = Math.PI / 180
export const wrapRad = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value))
export const wrapDeg = (value: number): number => ((value + 180) % 360 + 360) % 360 - 180

export const angularSensitivity = (target: TargetConfig): number => {
  const radius = target.outerDiameterMm / 2
  return target.apertures.reduce(
    (sum, aperture) => sum + (2 * (radius ** 3 - aperture.innerRadiusMm ** 3)) / 3,
    0,
  )
}

export const apertureArea = (target: TargetConfig): number => {
  const radius = target.outerDiameterMm / 2
  return target.apertures.reduce(
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
  for (const aperture of target.apertures) {
    const area = 0.5 * aperture.widthDeg * DEG * (radius ** 2 - aperture.innerRadiusMm ** 2)
    const centroidRadius = sectorCentroidRadius(radius, aperture)
    mx += area * centroidRadius * Math.cos(aperture.centreDeg * DEG)
    my += area * centroidRadius * Math.sin(aperture.centreDeg * DEG)
    removed += area
  }
  const remainingArea = Math.PI * radius ** 2 - removed
  return Math.hypot(mx, my) / remainingArea
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

export const removedAreaRelativeTo = (target: TargetConfig, reference: TargetConfig): number =>
  apertureArea(target) - apertureArea(reference)
