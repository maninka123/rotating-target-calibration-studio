import { describe, expect, it } from 'vitest'
import { apertureArea, angularSensitivity, bendingStressMpa, centreOfMassEccentricity, minimumPlateThicknessMm, minimumStandOffM, predictedDispersionRatio } from '../core/geometry'
import { SINGLE_APERTURE, DUAL_APERTURE, TRIPLE_APERTURE } from '../core/presets'

describe('target geometry validation', () => {
  it.each([
    ['SINGLE_APERTURE', SINGLE_APERTURE, 6.09e6],
    ['DUAL_APERTURE', DUAL_APERTURE, 11.60e6],
    ['TRIPLE_APERTURE', TRIPLE_APERTURE, 17.11e6],
  ])('computes Lambda for %s', (_, target, expected) => {
    expect(angularSensitivity(target)).toBeCloseTo(expected, -4)
  })

  it.each([
    ['SINGLE_APERTURE', SINGLE_APERTURE, 21782],
    ['DUAL_APERTURE', DUAL_APERTURE, 29221],
    ['TRIPLE_APERTURE', TRIPLE_APERTURE, 36661],
  ])('computes aperture area for %s', (_, target, expected) => {
    expect(apertureArea(target)).toBeCloseTo(expected, 0)
  })

  it('computes predicted dispersion reductions', () => {
    expect(1 - predictedDispersionRatio(SINGLE_APERTURE, DUAL_APERTURE)).toBeCloseTo(0.28, 2)
    expect(1 - predictedDispersionRatio(SINGLE_APERTURE, TRIPLE_APERTURE)).toBeCloseTo(0.40, 2)
    expect(1 - predictedDispersionRatio(DUAL_APERTURE, TRIPLE_APERTURE)).toBeCloseTo(0.18, 2)
  })

  it('computes mechanical checks', () => {
    expect(centreOfMassEccentricity(TRIPLE_APERTURE)).toBeCloseTo(21.63, 2)
    expect(minimumPlateThicknessMm(DUAL_APERTURE)).toBeCloseTo(2.73, 2)
    expect(bendingStressMpa(160, 3)).toBeCloseTo(0.68, 2)
  })

  it('returns exactly zero eccentricity for three equal 120 degree apertures', () => {
    const symmetric = { ...TRIPLE_APERTURE, apertures: [0, 120, 240].map((centreDeg, index) => ({ id: String(index), centreDeg, widthDeg: 25, innerRadiusMm: 100 })) }
    expect(centreOfMassEccentricity(symmetric)).toBe(0)
  })
})

describe('field of view validation', () => {
  it.each([
    [20.0, 1.31],
    [24.0, 1.09],
    [25.1, 1.04],
    [14.5, 1.82],
    [41.3, 0.61],
  ])('%s degree FOV gives minimum %s m', (fov, expected) => {
    expect(minimumStandOffM(210, fov, fov)).toBeCloseTo(expected, 2)
  })
})
