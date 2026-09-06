import { describe, expect, it } from 'vitest'
import { parseConfiguration, parseCustomSensors, serialiseConfiguration, serialiseCustomSensors } from '../core/config'
import { contourEstimate, geometricEstimate } from '../core/estimators'
import { estimatorInputFromFrame } from '../core/estimation'
import { DUAL_APERTURE } from '../core/presets'
import { generateFrame } from '../core/sampling'
import { SCENARIO_NAMES, scenarioConfiguration } from '../core/scenarios'
import type { Architecture, PlacedSensor, SampleFrame, SensorDefinition, TargetConfig, TimestampConvention } from '../core/types'
import { APERTURE, MATERIAL } from '../core/types'
import { byId, COVERAGE_SHAPES, SENSOR_LIBRARY } from '../sensors/library'

const representatives: Record<Architecture, string> = {
  'rotating-head': 'puck-hires', prism: 'livox-avia', 'micro-mirror': 'blickfeld-cube1', 'electronic-array': 'hesai-ft120',
  'rotating-mirror': 'livox-mid360', 'single-plane': 'single-plane', camera: 'flir-global',
}
const placed = (id: string, patch: Partial<PlacedSensor> = {}): PlacedSensor => ({ ...byId(id), instanceId: id, ...patch })
const lightweight = (architecture: Architecture): PlacedSensor => {
  const sensor = placed(representatives[architecture])
  return { ...sensor, horizontalResolutionDeg: 3, channelCount: 4, sampleRateHz: 500, integrationTimeS: 0.02, gridColumns: 20, gridRows: 16, resolution: architecture === 'camera' ? [80, 60] : sensor.resolution, pixelPitchUm: architecture === 'camera' ? 30 : sensor.pixelPitchUm, emitterCount: 4 }
}

describe('cross-architecture operation', () => {
  it.each(Object.keys(representatives) as Architecture[])('both estimators run on %s without throwing', (architecture) => {
    const sensor = lightweight(architecture)
    const frame = generateFrame(sensor, DUAL_APERTURE, 5, 33, 0, 2)
    const input = estimatorInputFromFrame(frame, DUAL_APERTURE, 2)
    expect(() => contourEstimate(input)).not.toThrow()
    expect(() => geometricEstimate(input)).not.toThrow()
  })

  it('contains no stored nominal sample-count property', () => {
    for (const sensor of SENSOR_LIBRARY) expect(Object.keys(sensor)).not.toContain('nominalBandSamples')
  })

  it('assigns an architecture-specific coverage shape to every architecture', () => {
    expect(new Set(Object.values(COVERAGE_SHAPES)).size).toBeGreaterThan(4)
    for (const architecture of Object.keys(representatives) as Architecture[]) expect(COVERAGE_SHAPES[architecture]).toBeTruthy()
  })
})

describe('timestamps and persistence', () => {
  it('timestamp conventions report their explicitly defined instants', () => {
    const base = placed('flir-rolling', { resolution: [200, 160], pixelPitchUm: 20 })
    const conventions: TimestampConvention[] = ['instantaneous', 'window-start', 'exposure-midpoint', 'rolling-readout']
    const values = conventions.map((timestampConvention) => generateFrame({ ...base, timestampConvention }, DUAL_APERTURE, 0, 0, 10).reportedTimeS)
    expect(values[0]).toBeCloseTo(10.0025, 8)
    expect(values[1]).toBe(10)
    expect(values[2]).toBeCloseTo(10.0125, 8)
    expect(values[3]).toBe(10)
  })

  it('custom sensor serialisation restores identical ray output', () => {
    const custom: SensorDefinition = { ...byId('hesai-ft120'), id: 'custom-array', name: 'Custom array', gridColumns: 31, gridRows: 23 }
    const restored = parseCustomSensors(serialiseCustomSensors([custom]))[0]
    const first = generateFrame({ ...custom, instanceId: 'custom' }, DUAL_APERTURE, 0, 0, 0)
    const second = generateFrame({ ...restored, instanceId: 'custom' }, DUAL_APERTURE, 0, 0, 0)
    expect(second.xMm).toEqual(first.xMm)
    expect(second.classes).toEqual(first.classes)
  })

  it('configuration JSON round-trip restores identical state', () => {
    const config = scenarioConfiguration('Rolling shutter at rate')
    expect(parseConfiguration(serialiseConfiguration(config))).toEqual(config)
  })

  it('round-trips asymmetric sensor pitch through configuration JSON', () => {
    const config = scenarioConfiguration('Dense camera')
    config.sensors = [placed('livox-mid360', { pitchDeg: -22.5 })]
    expect(parseConfiguration(serialiseConfiguration(config)).sensors[0].pitchDeg).toBe(-22.5)
  })

  it.each([
    ['rpm', (config: ReturnType<typeof scenarioConfiguration>) => { config.rpm = 21 }],
    ['stand-off', (config: ReturnType<typeof scenarioConfiguration>) => { config.sensors[0].standOffM = 0 }],
    ['aperture width', (config: ReturnType<typeof scenarioConfiguration>) => { config.target.apertures[0].widthDeg = 180 }],
    ['camera focal length', (config: ReturnType<typeof scenarioConfiguration>) => { config.sensors = [placed('flir-global', { focalLengthMm: 0 })] }],
    ['timestamp convention', (config: ReturnType<typeof scenarioConfiguration>) => { config.sensors[0].timestampConvention = 'bad' as TimestampConvention }],
  ])('rejects invalid imported %s', (_, mutate) => {
    const config = scenarioConfiguration('Dense camera')
    mutate(config)
    expect(() => parseConfiguration(JSON.stringify(config))).toThrow()
  })

  it('rejects overlapping apertures on import', () => {
    const config = scenarioConfiguration('Dense camera')
    config.target.apertures[1].centreDeg = 10
    expect(() => parseConfiguration(JSON.stringify(config))).toThrow(/overlap/)
  })
})

describe('preset scenarios', () => {
  it.each(SCENARIO_NAMES)('%s loads and generates frames', (name) => {
    const config = scenarioConfiguration(name)
    expect(config.sensors.length).toBeGreaterThan(0)
    for (const sensor of config.sensors) expect(generateFrame(sensor, config.target, config.rpm, config.angleDeg, 0).classes.length).toBeGreaterThan(0)
  })
})

describe('target edge cases', () => {
  it.each([
    ['zero apertures', []],
    ['359 degree aperture', [{ id: 'wide', widthDeg: 359, centreDeg: 0, innerRadiusMm: 60 }]],
    ['inner radius at hub', [{ id: 'hub', widthDeg: 20, centreDeg: 0, innerRadiusMm: DUAL_APERTURE.hubRadiusMm }]],
    ['inner radius at outer edge', [{ id: 'edge', widthDeg: 20, centreDeg: 0, innerRadiusMm: DUAL_APERTURE.outerDiameterMm / 2 }]],
  ] as const)('%s classifies without error', (_, apertures) => {
    const target: TargetConfig = { ...DUAL_APERTURE, apertures: [...apertures] }
    const frame = generateFrame(lightweight('electronic-array'), target, 0, 0, 0)
    expect(frame.classes.length).toBeGreaterThan(0)
  })
})

const boundaryFrame = (count: number, apertureSamples: number): SampleFrame => {
  const radiusMm = new Float64Array(count).fill(150)
  const phiRad = new Float64Array(count)
  const classes = new Uint8Array(count).fill(MATERIAL)
  for (let index = 0; index < apertureSamples; index += 1) { classes[index] = APERTURE; phiRad[index] = 0 }
  for (let index = apertureSamples; index < count; index += 1) phiRad[index] = Math.PI / 2 + (index % 5) * 0.1
  return {
    sensorId: 'boundary', architecture: 'electronic-array', acquisitionIndex: 0, acquisitionStartS: 0, reportedTimeS: 0,
    meanObservationTimeS: 0, trueAngleAtReportedDeg: 0, trueAngleAtMeanDeg: 0,
    xMm: Float64Array.from(phiRad, (angle) => 150 * Math.cos(angle)), yMm: Float64Array.from(phiRad, (angle) => 150 * Math.sin(angle)),
    radiusMm, phiRad, observationTimeS: new Float64Array(count), classes, inWorkingBand: new Uint8Array(count).fill(1), samplesAcrossTarget: 10, ringCount: 0,
  }
}

describe('acceptance boundaries', () => {
  it('rejects 49 working-band samples but evaluates exactly 50', () => {
    expect(geometricEstimate(estimatorInputFromFrame(boundaryFrame(49, 3), DUAL_APERTURE, 1)).reason).toBe('fewer than 50 samples in working band')
    expect(geometricEstimate(estimatorInputFromFrame(boundaryFrame(50, 3), DUAL_APERTURE, 1)).reason).not.toBe('fewer than 50 samples in working band')
  })

  it('rejects two aperture samples but evaluates exactly three', () => {
    expect(geometricEstimate(estimatorInputFromFrame(boundaryFrame(50, 2), DUAL_APERTURE, 1)).reason).toBe('fewer than 3 samples in each class')
    expect(geometricEstimate(estimatorInputFromFrame(boundaryFrame(50, 3), DUAL_APERTURE, 1)).reason).not.toBe('fewer than 3 samples in each class')
  })
})
