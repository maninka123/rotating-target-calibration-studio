import type { TargetConfig } from './types'

const base = { outerDiameterMm: 420, hubRadiusMm: 50, thicknessMm: 3, backgroundDistanceM: 1 }

export const C7: TargetConfig = {
  ...base,
  name: 'C7 — one aperture',
  apertures: [{ id: 'a1', widthDeg: 60, centreDeg: 0, innerRadiusMm: 50 }],
}

export const C10: TargetConfig = {
  ...base,
  name: 'C10 — proposed',
  apertures: [
    { id: 'a1', widthDeg: 60, centreDeg: 0, innerRadiusMm: 50 },
    { id: 'a2', widthDeg: 25, centreDeg: 180, innerRadiusMm: 100 },
  ],
}

export const C11: TargetConfig = {
  ...base,
  name: 'C11 — three apertures',
  apertures: [
    { id: 'a1', widthDeg: 60, centreDeg: 0, innerRadiusMm: 50 },
    { id: 'a2', widthDeg: 25, centreDeg: 180, innerRadiusMm: 100 },
    { id: 'a3', widthDeg: 25, centreDeg: 270, innerRadiusMm: 100 },
  ],
}

export const TARGET_PRESETS = { C7, C10, C11 } as const
