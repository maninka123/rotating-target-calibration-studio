import type { TargetConfig } from './types'

export const targetGeometrySignature = (target: TargetConfig): string => JSON.stringify([
  target.outerDiameterMm, target.hubRadiusMm, target.thicknessMm,
  target.apertures.map((item) => [item.widthDeg, item.centreDeg, item.innerRadiusMm]),
])

export const hubRadiusTargetMm = (target: TargetConfig): number => target.hubRadiusMm
export const hubRadiusSceneM = (target: TargetConfig): number => hubRadiusTargetMm(target) / 1000
export const hubRadiusPreviewUnits = (target: TargetConfig, outerPreviewRadius: number): number => hubRadiusTargetMm(target) / (target.outerDiameterMm / 2) * outerPreviewRadius
export const hubRadiusSensorPixels = (target: TargetConfig, pixelsPerMm: number): number => hubRadiusTargetMm(target) * pixelsPerMm
