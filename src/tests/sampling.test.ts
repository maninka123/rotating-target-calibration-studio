import { describe, expect, it } from 'vitest'
import { apertureContains, DEG, minimumStandOffM } from '../core/geometry'
import { DUAL_APERTURE } from '../core/presets'
import { channelElevationsDeg, classCounts, generateFrame, rotatingHeadBandRingCount, samplesAcrossTarget } from '../core/sampling'
import type { Architecture, PlacedSensor } from '../core/types'
import { APERTURE, BACKGROUND } from '../core/types'
import { byId, SENSOR_LIBRARY } from '../sensors/library'

const placed = (id: string, patch: Partial<PlacedSensor> = {}): PlacedSensor => ({ ...byId(id), instanceId: id, ...patch })
const representatives: Record<Architecture, string> = {
  'rotating-head': 'puck-hires', prism: 'livox-avia', 'micro-mirror': 'blickfeld-cube1',
  'electronic-array': 'hesai-ft120', 'rotating-mirror': 'livox-mid360', 'single-plane': 'single-plane', camera: 'flir-global',
}

describe('scan geometry', () => {
  it.each(Object.entries(representatives))('%s generates and classifies rays', (architecture, id) => {
    const frame = generateFrame(placed(id), DUAL_APERTURE, 5, 12, 0, 1)
    expect(frame.architecture).toBe(architecture)
    expect(frame.classes.length).toBeGreaterThan(0)
    expect(classCounts(frame).band).toBeGreaterThan(0)
  })

  it.each(SENSOR_LIBRARY.map((sensor) => [sensor.id] as const))('%s loads, fits at default stand-off, and produces a frame', (id) => {
    const sensor = placed(id)
    expect(sensor.standOffM + 0.005).toBeGreaterThanOrEqual(minimumStandOffM(210, sensor.horizontalFovDeg, sensor.verticalFovDeg))
    expect(generateFrame(sensor, DUAL_APERTURE, 0, 0, 0).classes.length).toBeGreaterThan(0)
  })

  it.each(Object.values(representatives))('%s angular target extent halves when stand-off doubles', (id) => {
    const sensor = placed(id)
    const doubled = { ...sensor, standOffM: sensor.standOffM * 2 }
    expect(samplesAcrossTarget(sensor, DUAL_APERTURE) / samplesAcrossTarget(doubled, DUAL_APERTURE)).toBeCloseTo(2, 1)
  })

  it.each(Object.values(representatives).filter((id) => id !== 'single-plane'))('%s loses approximately area-proportional band coverage at double stand-off', (id) => {
    const sensor = placed(id)
    const near = classCounts(generateFrame(sensor, DUAL_APERTURE, 0, 0, 0)).band
    const far = classCounts(generateFrame({ ...sensor, standOffM: sensor.standOffM * 2 }, DUAL_APERTURE, 0, 0, 0)).band
    expect(near / far).toBeGreaterThan(1.8)
    expect(near / far).toBeLessThan(5.5)
  })

  it('single-plane coverage follows length rather than area scaling', () => {
    const sensor = placed('single-plane')
    const near = classCounts(generateFrame(sensor, DUAL_APERTURE, 0, 0, 0)).band
    const far = classCounts(generateFrame({ ...sensor, standOffM: 2 }, DUAL_APERTURE, 0, 0, 0)).band
    expect(near / far).toBeCloseTo(2, 1)
  })

  it.each([4, 16, 32])('directly enumerates working-band rings for %i channels', (channelCount) => {
    const sensor = placed('puck-hires', { channelCount })
    const direct = channelElevationsDeg(sensor).filter((angle) => Math.abs(sensor.standOffM * Math.tan(angle * DEG)) <= DUAL_APERTURE.outerDiameterMm / 2000).length
    expect(rotatingHeadBandRingCount(sensor, DUAL_APERTURE)).toBe(direct)
    expect(generateFrame(sensor, DUAL_APERTURE, 0, 0, 0).ringCount).toBe(direct)
  })

  it('camera ray counting falls by approximately four after 2x downsampling', () => {
    const full = placed('flir-global', { resolution: [640, 480] })
    const half = placed('flir-global', { resolution: [320, 240], pixelPitchUm: full.pixelPitchUm! * 2 })
    const fullCount = classCounts(generateFrame(full, DUAL_APERTURE, 0, 0, 0)).band
    const halfCount = classCounts(generateFrame(half, DUAL_APERTURE, 0, 0, 0)).band
    expect(fullCount / halfCount).toBeCloseTo(4, 1)
  })

  it('reports camera samples across target in pixel rather than millimetre units', () => {
    expect(samplesAcrossTarget(placed('flir-global'), DUAL_APERTURE)).toBeCloseTo(373.33, 1)
    const thermalFraction = samplesAcrossTarget(placed('thermal-640'), DUAL_APERTURE) / 512
    const nirFraction = samplesAcrossTarget(placed('nir-905'), DUAL_APERTURE) / 1024
    expect(thermalFraction).toBeCloseTo(0.51, 2)
    expect(nirFraction).toBeCloseTo(thermalFraction, 3)
  })

  it('classifies aperture rays against geometry at each observation time', () => {
    const frame = generateFrame(placed('livox-avia'), DUAL_APERTURE, 8, 27, 2, 3)
    for (let index = 0; index < frame.classes.length; index += 1) if (frame.classes[index] === APERTURE) {
      const rotation = (27 + 6 * 8 * (frame.observationTimeS[index] - 2)) * DEG
      expect(apertureContains(DUAL_APERTURE, frame.radiusMm[index], frame.phiRad[index], rotation)).toBe(true)
    }
  })

  it('classifies background rays only when they miss the disc', () => {
    const frame = generateFrame(placed('hesai-ft120'), DUAL_APERTURE, 5, 0, 0)
    for (let index = 0; index < frame.classes.length; index += 1) if (frame.classes[index] === BACKGROUND) expect(frame.radiusMm[index]).toBeGreaterThan(DUAL_APERTURE.outerDiameterMm / 2)
  })

  it('apertures change classes but not ray or band counts', () => {
    const sensor = placed('thermal-640')
    const solid = { ...DUAL_APERTURE, apertures: [] }
    const openFrame = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0)
    const solidFrame = generateFrame(sensor, solid, 0, 0, 0)
    expect(openFrame.classes.length).toBe(solidFrame.classes.length)
    expect(classCounts(openFrame).band).toBe(classCounts(solidFrame).band)
    expect(classCounts(solidFrame).aperture).toBe(0)
  })

  it('prism acquisitions start at different rosette phases', () => {
    const sensor = placed('livox-avia')
    const first = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 0)
    const second = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 1)
    expect(second.xMm[0]).not.toBe(first.xMm[0])
    expect(second.yMm[0]).not.toBe(first.yMm[0])
  })

  it('Livox Avia produces a dense multi-lobed non-repeating trajectory', () => {
    const frame = generateFrame(placed('livox-avia'), DUAL_APERTURE, 0, 0, 0, 0)
    let verticalCrossings = 0
    for (let index = 1; index < frame.yMm.length; index += 1) {
      if ((frame.yMm[index - 1] < 0) !== (frame.yMm[index] < 0)) verticalCrossings += 1
    }
    const occupied = new Set<string>()
    for (let index = 0; index < frame.xMm.length; index += 8) {
      const column = Math.floor((frame.xMm[index] + 900) / 30)
      const row = Math.floor((frame.yMm[index] + 900) / 30)
      occupied.add(`${column}:${row}`)
    }
    expect(verticalCrossings).toBeGreaterThan(35)
    expect(occupied.size).toBeGreaterThan(500)
  })

  it('solid-state acquisitions have identical fixed positions', () => {
    const sensor = placed('hesai-ft120')
    const first = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 0)
    const second = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 1)
    expect(second.xMm).toEqual(first.xMm)
    expect(second.yMm).toEqual(first.yMm)
  })

  it('gives every generated ray an explicit observation time', () => {
    const frame = generateFrame(placed('livox-avia'), DUAL_APERTURE, 5, 10, 3, 2)
    expect(frame.observationTimeS).toHaveLength(frame.classes.length)
    expect(frame.observationTimeS[0]).toBe(3)
    expect(frame.observationTimeS.at(-1)).toBeCloseTo(3.1, 6)
  })
})
