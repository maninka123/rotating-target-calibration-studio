import { describe, expect, it } from 'vitest'
import { C10 } from '../core/presets'
import { classCounts, expectedBandSampleCount, generateFrame, samplesAcrossTarget } from '../core/sampling'
import type { PlacedSensor } from '../core/types'
import { byId } from '../sensors/library'

const placed = (id: string): PlacedSensor => ({ ...byId(id), instanceId: id })

describe('sampling validation', () => {
  it.each([
    ['puck-hires', 862],
    ['livox-avia', 4107],
    ['hesai-ft120', 488],
    ['flir-global', 87264],
    ['thermal-640', 51188],
    ['nir-905', 204748],
  ])('%s is within 5 percent of its expected band count', (id, expected) => {
    const sensor = placed(id)
    const actual = classCounts(generateFrame(sensor, C10, 5, 0, 0, 0)).band
    expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(0.05)
  })

  it('reports 12 working-band rings for the Puck', () => {
    expect(generateFrame(placed('puck-hires'), C10, 5, 0, 0, 0).ringCount).toBe(12)
  })

  it('camera downsampling by two in each dimension reduces count by four', () => {
    const full = placed('flir-global')
    const half = { ...full, resolution: [968, 732] as [number, number] }
    expect(expectedBandSampleCount(full, C10) / expectedBandSampleCount(half, C10)).toBeCloseTo(4, 2)
  })

  it('thermal and NIR have equal target-height fractions and a fourfold count ratio', () => {
    const thermal = placed('thermal-640')
    const nir = placed('nir-905')
    const thermalFraction = samplesAcrossTarget(thermal, C10) / thermal.resolution![1]
    const nirFraction = samplesAcrossTarget(nir, C10) / nir.resolution![1]
    expect(thermalFraction).toBeCloseTo(0.51, 3)
    expect(nirFraction).toBeCloseTo(thermalFraction, 3)
    expect(expectedBandSampleCount(nir, C10) / expectedBandSampleCount(thermal, C10)).toBeCloseTo(4, 1)
  })

  it('gives every sample an explicit observation time', () => {
    const sensor = placed('livox-avia')
    const frame = generateFrame(sensor, C10, 5, 10, 3, 2)
    expect(frame.observationTimeS).toHaveLength(frame.classes.length)
    expect(frame.observationTimeS[0]).toBe(3)
    expect(frame.observationTimeS.at(-1)).toBeCloseTo(3.1, 6)
  })
})
