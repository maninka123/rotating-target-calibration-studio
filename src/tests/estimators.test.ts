import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estimatorInputFromFrame, evaluateEstimate } from '../core/estimation'
import { contourEstimate, geometricEstimate } from '../core/estimators'
import { wrapDeg } from '../core/geometry'
import { DUAL_APERTURE } from '../core/presets'
import { generateFrame } from '../core/sampling'
import { runSweep } from '../core/sweep'
import { timingEquivalentS } from '../core/timing'
import type { PlacedSensor, SampleFrame, TargetConfig } from '../core/types'
import { byId } from '../sensors/library'

const placed = (id: string, patch: Partial<PlacedSensor> = {}): PlacedSensor => ({ ...byId(id), instanceId: id, ...patch })
const input = (frame: SampleFrame, target: TargetConfig = DUAL_APERTURE, resolution = 1) => estimatorInputFromFrame(frame, target, resolution)
const assessed = (frame: SampleFrame, kind: 'contour' | 'geometric', resolution = 1) => evaluateEstimate(
  kind === 'contour' ? contourEstimate(input(frame, DUAL_APERTURE, resolution)) : geometricEstimate(input(frame, DUAL_APERTURE, resolution)),
  frame.trueAngleAtReportedDeg, 5,
)

describe('estimator isolation and behaviour', () => {
  it('estimator implementation cannot reference frame truth or acquisition identity', () => {
    const source = readFileSync(new URL('../core/estimators.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/trueAngle|acquisitionIndex|SampleFrame|geometricEstimate\(input\).*contour/s)
  })

  it('contour matching rejects a two-ring scan from computed coverage', () => {
    const frame = generateFrame(placed('ls-c4'), DUAL_APERTURE, 5, 37, 0, 0)
    expect(contourEstimate(input(frame))).toMatchObject({ accepted: false, reason: 'insufficient boundary support' })
  })

  it('contour matching independently resolves a dense image', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [320, 240], pixelPitchUm: 12 })
    const result = assessed(generateFrame(sensor, DUAL_APERTURE, 5, 37.4, 0, 0), 'contour')
    expect(result.accepted).toBe(true)
    expect(Math.abs(result.signedErrorDeg!)).toBeLessThan(1)
  })

  it('geometric fit accepts a sparse rotating head and rejects a planar scan', () => {
    expect(geometricEstimate(input(generateFrame(placed('ls-c4'), DUAL_APERTURE, 5, 81.2, 0, 0))).accepted).toBe(true)
    expect(geometricEstimate(input(generateFrame(placed('single-plane'), DUAL_APERTURE, 5, 20, 0))).reason).toBe('insufficient two-dimensional boundary coverage')
  })

  it('instantaneous dense sampling tracks wrapped angles across the seam', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [240, 180], pixelPitchUm: 16 })
    for (const angle of [0.2, 93.4, 219.3, 359.8]) {
      const result = assessed(generateFrame(sensor, DUAL_APERTURE, 5, angle, 0), 'geometric', 0.5)
      expect(result.accepted).toBe(true)
      expect(Math.abs(result.signedErrorDeg!)).toBeLessThan(1)
    }
  })

  it('reduces estimation error when camera ray density increases', () => {
    const sparse = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [160, 121], pixelPitchUm: 40 })
    const dense = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [240, 180], pixelPitchUm: 16 })
    const angles = [13.17, 46.43, 73.37, 128.81, 201.29, 317.63]
    const mean = (sensor: PlacedSensor) => angles.reduce((sum, angle) => sum + Math.abs(assessed(generateFrame(sensor, DUAL_APERTURE, 0, angle, 0), 'geometric').signedErrorDeg!), 0) / angles.length
    expect(mean(dense)).toBeLessThan(mean(sparse))
  })

  it('rejects rotationally symmetric layouts as ambiguous', () => {
    const sensor = placed('flir-global', { timestampConvention: 'instantaneous', resolution: [240, 180], pixelPitchUm: 16 })
    for (const target of [
      { ...DUAL_APERTURE, apertures: [{ id: 'a', widthDeg: 30, centreDeg: 0, innerRadiusMm: 90 }, { id: 'b', widthDeg: 30, centreDeg: 180, innerRadiusMm: 90 }] },
      { ...DUAL_APERTURE, apertures: [0, 120, 240].map((centreDeg, index) => ({ id: String(index), widthDeg: 25, centreDeg, innerRadiusMm: 90 })) },
    ]) {
      const frame = generateFrame(sensor, target, 0, 17, 0)
      const result = geometricEstimate(input(frame, target, 0.5))
      expect(result.reason).toBe('orientation ambiguous')
      expect(result.ambiguityOrder).toBeGreaterThan(1)
    }
  })

  it('sweep truth spans one revolution without a large angular gap', () => {
    const acquisitions = 180
    const { records } = runSweep(DUAL_APERTURE, [placed('hesai-ft120', { gridColumns: 20, gridRows: 16 })], 0, acquisitions, ['geometric'], 2)
    const angles = records.map((row) => row.trueAngleDeg).sort((a, b) => a - b)
    const gaps = angles.map((angle, index) => index ? angle - angles[index - 1] : angle + 360 - angles.at(-1)!)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2 * 360 / acquisitions)
  })

  it('reports every sensor pair independently', () => {
    const sensors = ['one', 'two', 'three'].map((instanceId, index) => placed('hesai-ft120', { instanceId, gridColumns: 16 + index, gridRows: 14 + index }))
    const result = runSweep(DUAL_APERTURE, sensors, 5, 8, ['geometric'], 5)
    expect(result.pairwiseOffsets.map((row) => `${row.fromSensor}->${row.toSensor}`)).toEqual(['one->two', 'one->three', 'two->three'])
  })

  it('rolling shutter changes angle more at higher rpm', () => {
    const sensor = placed('flir-rolling', { resolution: [160, 121], pixelPitchUm: 18 })
    const error = (rpm: number) => {
      const frame = generateFrame(sensor, DUAL_APERTURE, rpm, 30, 0, 5)
      return Math.abs(evaluateEstimate(geometricEstimate(input(frame)), frame.trueAngleAtReportedDeg, rpm).signedErrorDeg!)
    }
    expect(error(15)).toBeGreaterThan(error(2))
  })

  it('all derived angular comparisons wrap', () => {
    expect(wrapDeg(1 - 359)).toBe(2)
    expect(Math.abs(timingEquivalentS(2, 10)!)).toBeLessThan(Math.abs(timingEquivalentS(2, 5)!))
  })
})
