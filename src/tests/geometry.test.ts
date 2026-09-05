import { describe, expect, it } from 'vitest'
import { apertureArea, angularSensitivity, bendingStressMpa, centreOfMassEccentricity, minimumPlateThicknessMm, minimumStandOffM, predictedDispersionRatio } from '../core/geometry'
import { C7, C10, C11 } from '../core/presets'

describe('target geometry validation', () => {
  it.each([
    ['C7', C7, 6.09e6],
    ['C10', C10, 11.60e6],
    ['C11', C11, 17.11e6],
  ])('computes Lambda for %s', (_, target, expected) => {
    expect(angularSensitivity(target)).toBeCloseTo(expected, -4)
  })

  it.each([
    ['C7', C7, 21782],
    ['C10', C10, 29221],
    ['C11', C11, 36661],
  ])('computes aperture area for %s', (_, target, expected) => {
    expect(apertureArea(target)).toBeCloseTo(expected, 0)
  })

  it('computes predicted dispersion reductions', () => {
    expect(1 - predictedDispersionRatio(C7, C10)).toBeCloseTo(0.28, 2)
    expect(1 - predictedDispersionRatio(C7, C11)).toBeCloseTo(0.40, 2)
    expect(1 - predictedDispersionRatio(C10, C11)).toBeCloseTo(0.18, 2)
  })

  it('computes mechanical checks', () => {
    expect(centreOfMassEccentricity(C11)).toBeCloseTo(20.4, 1)
    expect(minimumPlateThicknessMm(C10)).toBeCloseTo(2.73, 2)
    expect(bendingStressMpa(160, 3)).toBeCloseTo(0.68, 2)
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
