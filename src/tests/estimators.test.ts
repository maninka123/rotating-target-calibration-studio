import { describe, expect, it } from 'vitest'
import { contourEstimate, geometricEstimate } from '../core/estimators'
import { C10 } from '../core/presets'
import { generateFrame } from '../core/sampling'
import { timingEquivalentS } from '../core/timing'
import type { PlacedSensor } from '../core/types'
import { byId } from '../sensors/library'

const placed = (id: string, patch: Partial<PlacedSensor> = {}): PlacedSensor => ({ ...byId(id), instanceId: id, ...patch })

describe('estimator behaviour', () => {
  it('contour estimator rejects LSLiDAR C4', () => {
    const sensor = placed('ls-c4')
    const result = contourEstimate(generateFrame(sensor, C10, 5, 37, 0, 0), C10, sensor, 5)
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('insufficient boundary support')
  })

  it('contour estimator resolves a dense FLIR frame within 0.1 degree', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [400, 300] })
    const result = contourEstimate(generateFrame(sensor, C10, 5, 37.4, 0, 0), C10, sensor, 5)
    expect(result.accepted).toBe(true)
    expect(Math.abs(result.signedErrorDeg!)).toBeLessThan(0.1)
  })

  it('geometric estimator accepts LSLiDAR C4', () => {
    const sensor = placed('ls-c4', { timestampConvention: 'instantaneous' })
    const result = geometricEstimate(generateFrame(sensor, C10, 5, 81.2, 0, 0), C10, 5)
    expect(result.accepted).toBe(true)
  })

  it('Blickfeld has a non-zero rejection rate over 300 acquisitions', () => {
    const sensor = placed('blickfeld-cube1', { timestampConvention: 'instantaneous' })
    let rejected = 0
    for (let index = 0; index < 300; index += 1) {
      const result = geometricEstimate(generateFrame(sensor, C10, 5, index * 1.2, 0, index), C10, 5)
      if (!result.accepted) rejected += 1
    }
    expect(rejected).toBeGreaterThan(0)
    expect(rejected).toBeLessThan(300)
  }, 30_000)

  it('dense instantaneous sampling tracks a full revolution under 1 degree', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [320, 242] })
    for (const angle of [0.2, 41.7, 93.4, 151.8, 219.3, 288.6, 347.1]) {
      const result = geometricEstimate(generateFrame(sensor, C10, 5, angle, 0, Math.round(angle)), C10, 5)
      expect(result.accepted).toBe(true)
      expect(Math.abs(result.signedErrorDeg!)).toBeLessThan(1)
    }
  })

  it('error approaches zero as instantaneous sample density increases', () => {
    const sparse = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [160, 121] })
    const dense = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [480, 363] })
    const sparseError = Math.abs(geometricEstimate(generateFrame(sparse, C10, 5, 73.37, 0, 1), C10, 5).signedErrorDeg!)
    const denseError = Math.abs(geometricEstimate(generateFrame(dense, C10, 5, 73.37, 0, 1), C10, 5).signedErrorDeg!)
    expect(denseError).toBeLessThanOrEqual(sparseError + 0.05)
    expect(denseError).toBeLessThan(0.2)
  })

  it('rolling-shutter angular error increases with rpm', () => {
    const sensor = placed('flir-rolling', { resolution: [320, 242] })
    const low = geometricEstimate(generateFrame(sensor, C10, 2, 30, 0, 5), C10, 2)
    const high = geometricEstimate(generateFrame(sensor, C10, 15, 30, 0, 5), C10, 15)
    expect(Math.abs(high.signedErrorDeg!)).toBeGreaterThan(Math.abs(low.signedErrorDeg!))
  })

  it('fixed angular error has a falling time equivalent as rpm rises', () => {
    expect(Math.abs(timingEquivalentS(2, 10)!)).toBeLessThan(Math.abs(timingEquivalentS(2, 5)!))
  })

  it('window-start versus exposure-midpoint recovers about 50 ms', () => {
    const avia = placed('livox-avia', { timestampConvention: 'window-start', integrationTimeS: 0.1 })
    const camera = placed('flir-global', { timestampConvention: 'exposure-midpoint', integrationTimeS: 0, resolution: [320, 242] })
    const aviaResult = geometricEstimate(generateFrame(avia, C10, 5, 20, 0, 3), C10, 5)
    const cameraResult = geometricEstimate(generateFrame(camera, C10, 5, 20, 0, 3), C10, 5)
    const recoveredMs = (aviaResult.signedErrorDeg! - cameraResult.signedErrorDeg!) / (6 * 5) * 1000
    expect(recoveredMs).toBeGreaterThan(35)
    expect(recoveredMs).toBeLessThan(65)
  })
})
