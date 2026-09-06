import type { TargetConfig } from './types'

const base = { outerDiameterMm: 420, hubRadiusMm: 50, thicknessMm: 3, backgroundDistanceM: 1 }

export const SINGLE_APERTURE: TargetConfig = {
  ...base,
  name: 'Single aperture',
  apertures: [{ id: 'a1', widthDeg: 60, centreDeg: 0, innerRadiusMm: 50 }],
}

export const DUAL_APERTURE: TargetConfig = {
  ...base,
  name: 'Dual aperture',
  apertures: [
    { id: 'a1', widthDeg: 60, centreDeg: 0, innerRadiusMm: 50 },
    { id: 'a2', widthDeg: 25, centreDeg: 180, innerRadiusMm: 100 },
  ],
}

export const TRIPLE_APERTURE: TargetConfig = {
  ...base,
  name: 'Triple aperture',
  apertures: [
    { id: 'a1', widthDeg: 60, centreDeg: 0, innerRadiusMm: 50 },
    { id: 'a2', widthDeg: 25, centreDeg: 180, innerRadiusMm: 100 },
    { id: 'a3', widthDeg: 25, centreDeg: 270, innerRadiusMm: 100 },
  ],
}

export const TARGET_PRESETS = { SINGLE_APERTURE, DUAL_APERTURE, TRIPLE_APERTURE } as const

export const matchesTargetPreset = (target: TargetConfig, preset: TargetConfig): boolean =>
  target.outerDiameterMm === preset.outerDiameterMm
  && target.hubRadiusMm === preset.hubRadiusMm
  && target.thicknessMm === preset.thicknessMm
  && target.backgroundDistanceM === preset.backgroundDistanceM
  && target.apertures.length === preset.apertures.length
  && target.apertures.every((aperture, index) => {
    const expected = preset.apertures[index]
    return aperture.widthDeg === expected.widthDeg
      && aperture.centreDeg === expected.centreDeg
      && aperture.innerRadiusMm === expected.innerRadiusMm
  })
