import { describe, expect, it } from 'vitest'
import { contourEstimate, geometricEstimate } from '../core/estimators'
import { DUAL_APERTURE } from '../core/presets'
import { generateFrame } from '../core/sampling'
import { timingEquivalentS } from '../core/timing'
import type { PlacedSensor } from '../core/types'
import { byId } from '../sensors/library'

const placed = (id: string, patch: Partial<PlacedSensor> = {}): PlacedSensor => ({ ...byId(id), instanceId: id, ...patch })

describe('estimator behaviour', () => {
  it('contour estimator rejects LSLiDAR C4', () => {
    const sensor = placed('ls-c4')
    const result = contourEstimate(generateFrame(sensor, DUAL_APERTURE, 5, 37, 0, 0), DUAL_APERTURE, sensor, 5)
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('insufficient boundary support')
  })

  it('contour estimator resolves a dense FLIR frame within 0.1 degree', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [240, 180], pixelPitchUm: 12 })
    const result = contourEstimate(generateFrame(sensor, DUAL_APERTURE, 5, 37.4, 0, 0), DUAL_APERTURE, sensor, 5)
    expect(result.accepted).toBe(true)
    expect(Math.abs(result.signedErrorDeg!)).toBeLessThan(0.1)
  })

  it('geometric estimator accepts LSLiDAR C4', () => {
    const sensor = placed('ls-c4', { timestampConvention: 'instantaneous' })
    const result = geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 5, 81.2, 0, 0), DUAL_APERTURE, 5)
    expect(result.accepted).toBe(true)
  })

  it('geometric estimator rejects a single-plane scan with the specific coverage reason', () => {
    const sensor = placed('single-plane')
    const result = geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 5, 20, 0), DUAL_APERTURE, 5)
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('insufficient two-dimensional boundary coverage')
  })

  it('Blickfeld has a non-zero rejection rate over 300 acquisitions', () => {
    const sensor = placed('blickfeld-cube1', { timestampConvention: 'instantaneous' })
    let rejected = 0
    for (let index = 0; index < 300; index += 1) {
      const result = geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 5, index * 1.2, 0, index), DUAL_APERTURE, 5)
      if (!result.accepted) rejected += 1
    }
    expect(rejected).toBeGreaterThan(0)
    expect(rejected).toBeLessThan(300)
  }, 30_000)

  it('dense instantaneous sampling tracks a full revolution under 1 degree', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [160, 121], pixelPitchUm: 18 })
    for (const angle of [0.2, 41.7, 93.4, 151.8, 219.3, 288.6, 347.1]) {
      const result = geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 5, angle, 0, Math.round(angle)), DUAL_APERTURE, 5)
      expect(result.accepted).toBe(true)
      expect(Math.abs(result.signedErrorDeg!)).toBeLessThan(1)
    }
  })

  it('error approaches zero as instantaneous sample density increases', () => {
    const sparse = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [160, 121], pixelPitchUm: 40 })
    const dense = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [240, 180], pixelPitchUm: 16 })
    const angles = [13.17, 46.43, 73.37, 128.81, 201.29, 317.63]
    const meanError = (sensor: PlacedSensor) => angles.reduce((sum, angle, index) => sum + Math.abs(geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 5, angle, 0, index), DUAL_APERTURE, 5, 1).signedErrorDeg!), 0) / angles.length
    const sparseError = meanError(sparse)
    const denseError = meanError(dense)
    expect(denseError).toBeLessThan(sparseError)
    expect(denseError).toBeLessThan(0.15)
  })

  it('contour matching shows rare gross prism correspondence errors', () => {
    const sensor = placed('livox-avia', { timestampConvention: 'instantaneous' })
    const errors = Array.from({ length: 300 }, (_, index) => Math.abs(contourEstimate(generateFrame(sensor, DUAL_APERTURE, 5, index * 1.2, 0, index), DUAL_APERTURE, sensor, 5).signedErrorDeg!))
    const sorted = [...errors].sort((a, b) => a - b)
    const median = (sorted[149] + sorted[150]) / 2
    const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length
    expect(median).toBeLessThan(5)
    expect(mean).toBeGreaterThan(3 * median)
    expect(errors.some((value) => value > 90)).toBe(true)
  }, 30_000)

  it('rolling-shutter angular error increases with rpm', () => {
    const sensor = placed('flir-rolling', { resolution: [160, 121], pixelPitchUm: 18 })
    const low = geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 2, 30, 0, 5), DUAL_APERTURE, 2)
    const high = geometricEstimate(generateFrame(sensor, DUAL_APERTURE, 15, 30, 0, 5), DUAL_APERTURE, 15)
    expect(Math.abs(high.signedErrorDeg!)).toBeGreaterThan(Math.abs(low.signedErrorDeg!))
  })

  it('fixed angular error has a falling time equivalent as rpm rises', () => {
    expect(Math.abs(timingEquivalentS(2, 10)!)).toBeLessThan(Math.abs(timingEquivalentS(2, 5)!))
  })

  it('window-start versus exposure-midpoint recovers about 50 ms', () => {
    const avia = placed('livox-avia', { timestampConvention: 'window-start', integrationTimeS: 0.1 })
    const camera = placed('flir-global', { timestampConvention: 'exposure-midpoint', integrationTimeS: 0, resolution: [160, 121], pixelPitchUm: 18 })
    const aviaResult = geometricEstimate(generateFrame(avia, DUAL_APERTURE, 5, 20, 0, 3), DUAL_APERTURE, 5)
    const cameraResult = geometricEstimate(generateFrame(camera, DUAL_APERTURE, 5, 20, 0, 3), DUAL_APERTURE, 5)
    const recoveredMs = (aviaResult.signedErrorDeg! - cameraResult.signedErrorDeg!) / (6 * 5) * 1000
    expect(recoveredMs).toBeGreaterThan(35)
    expect(recoveredMs).toBeLessThan(65)
  })
})
