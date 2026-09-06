import { describe, expect, it } from 'vitest'
import { angularSensitivity, apertureArea, centreOfMassEccentricity, wrapDeg } from '../core/geometry'
import { parseConfiguration, validateSensor, validateTarget } from '../core/config'
import { DUAL_APERTURE, SINGLE_APERTURE } from '../core/presets'
import { scenarioConfiguration } from '../core/scenarios'
import { byId } from '../sensors/library'
import { generateFrame, classCounts } from '../core/sampling'
import { contourEstimate, geometricEstimate } from '../core/estimators'
import { estimatorInputFromFrame, estimateFrozenFrame } from '../core/estimation'
import { runSweep } from '../core/sweep'
import { hasAsymmetricElevation } from '../core/optics'
import { buildTargetGeometry } from '../scene/TargetMesh'
import type { PlacedSensor, SimulationConfig, TargetConfig } from '../core/types'

const place = (id: string, patch: Partial<PlacedSensor> = {}): PlacedSensor => ({ ...byId(id), instanceId: id, ...patch })
const camera = place('flir-global', { resolution: [240, 180], pixelPitchUm: 16 })

describe('geometry corrections', () => {
  it('keeps an asymmetric plate on its original XY axis and centres thickness only', () => {
    const target = { ...SINGLE_APERTURE, apertures: [{ ...SINGLE_APERTURE.apertures[0], widthDeg: 120 }] }
    const geometry = buildTargetGeometry(target)
    expect(geometry.boundingBox!.min.x).toBeCloseTo(-0.21, 5)
    expect(geometry.boundingBox!.max.x).toBeCloseTo(0.105, 4)
    expect(geometry.boundingBox!.min.z).toBeCloseTo(-0.0015, 7)
    expect(geometry.boundingBox!.max.z).toBeCloseTo(0.0015, 7)
    geometry.dispose()
  })
  it('zero-area apertures have finite zero moments', () => {
    const target = { ...DUAL_APERTURE, apertures: [{ id: 'zero', widthDeg: 20, centreDeg: 0, innerRadiusMm: 210 }] }
    expect(centreOfMassEccentricity(validateTarget(target))).toBe(0)
    expect(angularSensitivity(target)).toBe(0)
  })
  it.each([0, 330])('touching sectors at %s degrees equal their union', (centre) => {
    const split = { ...DUAL_APERTURE, apertures: [centre, centre + 30].map((centreDeg, index) => ({ id: String(index), widthDeg: 30, centreDeg, innerRadiusMm: 50 })) }
    const union = { ...DUAL_APERTURE, apertures: [{ id: 'joined', widthDeg: 60, centreDeg: centre + 15, innerRadiusMm: 50 }] }
    expect(angularSensitivity(split)).toBeCloseTo(angularSensitivity(union), 6)
    expect(apertureArea(split)).toBeCloseTo(apertureArea(union), 6)
    expect(centreOfMassEccentricity(split)).toBeCloseTo(centreOfMassEccentricity(union), 6)
  })
  it('a touching boundary with unequal radii contributes only its exposed segment', () => {
    const target = { ...DUAL_APERTURE, apertures: [{ id: 'a', widthDeg: 30, centreDeg: 0, innerRadiusMm: 50 }, { id: 'b', widthDeg: 30, centreDeg: 30, innerRadiusMm: 100 }] }
    expect(angularSensitivity(target)).toBeCloseTo(((210 ** 3 - 50 ** 3) + (100 ** 3 - 50 ** 3) + (210 ** 3 - 100 ** 3)) / 3, 6)
  })
  it('rejects hub and diameter edits that put apertures outside the working band', () => {
    expect(() => validateTarget({ ...DUAL_APERTURE, hubRadiusMm: 150 })).toThrow(/inner radius/)
    expect(() => validateTarget({ ...DUAL_APERTURE, outerDiameterMm: 150 })).toThrow(/inner radius/)
  })
})

describe('estimator correctness', () => {
  it.each([0, 13.17, 37.4, 90, 180, 270, 359.8])('dense contour has no half-bin bias at %s degrees', (angle) => {
    const frame = generateFrame(place('flir-global'), DUAL_APERTURE, 0, angle, 0)
    const result = contourEstimate(estimatorInputFromFrame(frame, DUAL_APERTURE, 1))
    expect(result.accepted).toBe(true)
    expect(Math.abs(wrapDeg(result.angleDeg! - angle))).toBeLessThan(0.1)
  })
  it.each([contourEstimate, geometricEstimate])('rejects a solid unobservable target', (estimate) => {
    const target = { ...DUAL_APERTURE, apertures: [] }
    expect(estimate(estimatorInputFromFrame(generateFrame(camera, target, 0, 73, 0), target, 1)).reason).toBe('orientation unobservable')
  })
  it.each([2, 3])('rejects order %s symmetry at every selectable coarse grid family', (order) => {
    const target: TargetConfig = { ...DUAL_APERTURE, apertures: Array.from({ length: order }, (_, index) => ({ id: String(index), widthDeg: 25, centreDeg: index * 360 / order, innerRadiusMm: 90 })) }
    const frame = generateFrame(camera, target, 0, 17.3, 0)
    for (const step of [0.05, 0.5, 1, 7, 8, 10]) for (const estimate of [contourEstimate, geometricEstimate]) {
      expect(estimate(estimatorInputFromFrame(frame, target, step))).toMatchObject({ accepted: false, reason: 'orientation ambiguous', ambiguityOrder: order })
    }
  })
  it.each(['point', 'line'])('rejects a coincident %s cloud regardless of architecture', (kind) => {
    const frame = generateFrame(place('hesai-ft120'), DUAL_APERTURE, 0, 10, 0)
    const input = estimatorInputFromFrame(frame, DUAL_APERTURE, 1)
    input.xMm.fill(100); input.yMm.fill(0)
    if (kind === 'line') input.xMm.forEach((_, index) => { input.xMm[index] = index })
    expect(geometricEstimate(input).reason).toBe('insufficient two-dimensional boundary coverage')
  })
  it('estimates exactly the supplied frozen prism frame without changing sample arrays', () => {
    const sensor = place('livox-avia')
    const frame = generateFrame(sensor, DUAL_APERTURE, 5, 21, 2, 7)
    const before = structuredClone(frame)
    const result = estimateFrozenFrame(frame, DUAL_APERTURE, 5, ['contour', 'geometric'], 2)
    expect(frame).toEqual(before)
    expect(result.map((row) => row.trueAngleDeg)).toEqual([frame.trueAngleAtReportedDeg, frame.trueAngleAtReportedDeg])
    expect(result[0].angleDeg).toBe(contourEstimate(estimatorInputFromFrame(frame, DUAL_APERTURE, 2)).angleDeg)
    expect(generateFrame(sensor, DUAL_APERTURE, 5, 21, 2, 8).xMm).not.toEqual(frame.xMm)
  })
})

describe('sweep and sensor validation', () => {
  it('resolution threshold reduces counted camera samples about sixteenfold', () => {
    const full = classCounts(generateFrame(place('flir-global'), DUAL_APERTURE, 0, 0, 0)).band
    const low = classCounts(generateFrame(scenarioConfiguration('Resolution threshold').sensors[0], DUAL_APERTURE, 0, 0, 0)).band
    expect(full / low).toBeGreaterThan(15.5)
    expect(full / low).toBeLessThan(16.5)
  })
  it('zero RPM holds the selected orientation throughout every acquisition', () => {
    const checkpoints: number[] = []
    const visualAcquisitions: number[] = []
    const result = runSweep(DUAL_APERTURE, [place('hesai-ft120')], 0, 20, ['contour'], 1, (_, rows, visuals) => {
      checkpoints.push(...rows.map((row) => row.acquisition))
      visualAcquisitions.push(...visuals.map((visual) => visual.acquisition))
      expect(visuals.every((visual) => visual.sensorName === 'Hesai FT120' && visual.frame.classes.length <= 20_000 && visual.results.length === 1)).toBe(true)
    }, 2, 73, true)
    expect(new Set(result.records.map((row) => row.trueAngleDeg))).toEqual(new Set([73]))
    expect(result.records.every((row) => row.timingErrorS === null)).toBe(true)
    expect(checkpoints).toEqual(Array.from({ length: 20 }, (_, index) => index))
    expect(visualAcquisitions).toEqual(Array.from({ length: 20 }, (_, index) => index))
    expect(new Set(result.records.map((row) => row.sensorName))).toEqual(new Set(['Hesai FT120']))
  })
  it.each([0, -1, 1.5, Infinity])('rejects invalid acquisition count %s', (count) => {
    expect(() => runSweep(DUAL_APERTURE, [camera], 5, count, ['contour'])).toThrow(/acquisitions/)
  })
  it('pitch control eligibility requires actual asymmetry', () => {
    expect(hasAsymmetricElevation(place('livox-mid360'))).toBe(true)
    expect(hasAsymmetricElevation(place('livox-mid360', { elevationLowerDeg: -30, elevationUpperDeg: 30 }))).toBe(false)
    expect(hasAsymmetricElevation(camera)).toBe(false)
  })
  it.each([
    ['missing instance id', (c: SimulationConfig) => { delete (c.sensors[0] as Partial<PlacedSensor>).instanceId }],
    ['duplicate instance id', (c: SimulationConfig) => { c.sensors.push({ ...c.sensors[0] }) }],
    ['string playing', (c: SimulationConfig) => { Object.assign(c, { playing: 'false' }) }],
    ['string rays', (c: SimulationConfig) => { Object.assign(c, { showRays: 'false' }) }],
    ['excessive resolution', (c: SimulationConfig) => { c.sensors[0].resolution = [100000, 100000] }],
    ['invalid search step', (c: SimulationConfig) => { c.searchResolutionDeg = 0 }],
  ] as const)('rejects %s in configuration JSON', (_, mutate) => {
    const config = scenarioConfiguration('Dense camera'); mutate(config)
    expect(() => parseConfiguration(JSON.stringify(config))).toThrow()
  })
  it('rejects two zero wedges before generating rays', () => {
    expect(() => validateSensor(place('livox-avia', { wedgeADeg: 0, wedgeBDeg: 0 }))).toThrow(/wedges/)
  })
})
