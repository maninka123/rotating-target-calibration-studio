import { describe, expect, it } from 'vitest'
import { apertureContains, asymmetricCoverage, DEG, minimumStandOffM, targetFitsElevationLimits } from '../core/geometry'
import { sensorFovDeg } from '../core/optics'
import { DUAL_APERTURE } from '../core/presets'
import { channelElevationsDeg, classCounts, generateFrame, rotatingHeadBandElevationsDeg, rotatingHeadBandRingCount, rotatingHeadRingSampleCounts, samplesAcrossTarget } from '../core/sampling'
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

  it.each(SENSOR_LIBRARY.map((sensor) => [sensor.id] as const))('%s loads, has the expected FOV status, and produces a frame', (id) => {
    const sensor = placed(id)
    if (sensor.id === 'livox-mid360') expect(targetFitsElevationLimits(DUAL_APERTURE, sensor.standOffM, sensor.elevationLowerDeg!, sensor.elevationUpperDeg!)).toBe(false)
    else { const fov = sensorFovDeg(sensor); expect(sensor.standOffM + 0.005).toBeGreaterThanOrEqual(minimumStandOffM(210, fov.horizontalDeg, fov.verticalDeg)) }
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

  it.each([
    ['ls-c4', 2], ['ls-c8', 6], ['puck-hires', 12], ['hdl-32e', 18], ['os1-64', 34], ['os1-128', 66],
  ] as const)('%s has exactly %i rings crossing the target band', (id, expected) => {
    const sensor = placed(id)
    const direct = channelElevationsDeg(sensor).filter((angle) => Math.abs(sensor.standOffM * Math.tan(angle * DEG)) < DUAL_APERTURE.outerDiameterMm / 2000).length
    expect(direct).toBe(expected)
    expect(rotatingHeadBandRingCount(sensor, DUAL_APERTURE)).toBe(expected)
    expect(rotatingHeadBandElevationsDeg(sensor, DUAL_APERTURE)).toHaveLength(expected)
    expect(generateFrame(sensor, DUAL_APERTURE, 0, 0, 0).ringCount).toBe(expected)
  })

  it('rotating-head chord counts equal the number of generated rays in the working band', () => {
    const sensor = placed('hdl-32e')
    const frame = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0)
    expect(classCounts(frame).band).toBe(rotatingHeadRingSampleCounts(sensor, DUAL_APERTURE).reduce((sum, count) => sum + count, 0))
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

  it('derives every camera field of view from optics without stored FOV values', () => {
    for (const sensor of SENSOR_LIBRARY.filter((item) => item.architecture === 'camera')) {
      expect(sensor.horizontalFovDeg).toBeUndefined()
      expect(sensor.verticalFovDeg).toBeUndefined()
      const fov = sensorFovDeg(sensor)
      expect(fov.horizontalDeg).toBeGreaterThan(0)
      expect(fov.verticalDeg).toBeGreaterThan(0)
    }
    const thermal = sensorFovDeg(byId('thermal-640'))
    expect(thermal.horizontalDeg).toBeCloseTo(54.5, 1)
    expect(thermal.verticalDeg).toBeCloseTo(44.8, 1)
  })

  it('camera timestamp metadata does not depend on the target crop', () => {
    const sensor = placed('flir-rolling')
    const small = generateFrame(sensor, { ...DUAL_APERTURE, outerDiameterMm: 200 }, 0, 0, 10)
    const large = generateFrame(sensor, { ...DUAL_APERTURE, outerDiameterMm: 600 }, 0, 0, 10)
    expect(small.reportedTimeS).toBe(large.reportedTimeS)
  })

  it('mean observation time averages only working-band samples', () => {
    const frame = generateFrame(placed('flir-rolling'), DUAL_APERTURE, 0, 0, 10)
    let sum = 0; let count = 0
    for (let index = 0; index < frame.inWorkingBand.length; index += 1) if (frame.inWorkingBand[index]) { sum += frame.observationTimeS[index]; count += 1 }
    expect(frame.meanObservationTimeS).toBeCloseTo(sum / count, 10)
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
    let minimumRadius = Number.POSITIVE_INFINITY
    for (const radius of frame.radiusMm) minimumRadius = Math.min(minimumRadius, radius)
    expect(minimumRadius).toBeLessThan(DUAL_APERTURE.hubRadiusMm)
  })

  it('prism coverage fills progressively with integration time', () => {
    const occupied = (duration: number) => {
      const sensor = placed('livox-avia', { integrationTimeS: duration })
      const frame = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 0)
      const bins = new Set<string>()
      for (let index = 0; index < frame.xMm.length; index += 1) {
        const xAngle = Math.atan(frame.xMm[index] / (sensor.standOffM * 1000)) / DEG
        const yAngle = Math.atan(frame.yMm[index] / (sensor.standOffM * 1000)) / DEG
        bins.add(`${Math.floor(xAngle + sensor.horizontalFovDeg! / 2)}:${Math.floor(yAngle + sensor.verticalFovDeg! / 2)}`)
      }
      return bins.size
    }
    expect(occupied(0.1)).toBeGreaterThan(occupied(0.02))
  })

  it('micro-mirror forms an eye with lower density at vertical extremes than the midline', () => {
    const sensor = placed('blickfeld-cube1')
    const frame = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0)
    let midline = 0
    let extremes = 0
    let corner = 0
    for (let index = 0; index < frame.xMm.length; index += 1) {
      const horizontal = Math.abs(Math.atan(frame.xMm[index] / 1000) / DEG) / (sensor.horizontalFovDeg! / 2)
      const vertical = Math.abs(Math.atan(frame.yMm[index] / 1000) / DEG) / (sensor.verticalFovDeg! / 2)
      if (vertical < 0.1) midline += 1
      if (vertical > 0.8) extremes += 1
      if (horizontal > 0.98 && vertical > 0.98) corner += 1
    }
    expect(midline).toBeGreaterThan(extremes * 2)
    expect(corner).toBe(0)
  })

  it('Mid-360 respects its -7 to +52 degree elevation limits and clips the target', () => {
    const sensor = placed('livox-mid360')
    const frame = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0)
    let minimumElevation = Number.POSITIVE_INFINITY
    let lowestTargetHit = Number.POSITIVE_INFINITY
    for (let index = 0; index < frame.yMm.length; index += 1) {
      if (!Number.isFinite(frame.yMm[index])) continue
      minimumElevation = Math.min(minimumElevation, Math.atan(frame.yMm[index] / (sensor.standOffM * 1000)) / DEG)
      if (frame.radiusMm[index] <= DUAL_APERTURE.outerDiameterMm / 2) lowestTargetHit = Math.min(lowestTargetHit, frame.yMm[index])
    }
    expect(minimumElevation).toBeGreaterThanOrEqual(-7 - 1e-9)
    expect(lowestTargetHit).toBeGreaterThan(-DUAL_APERTURE.outerDiameterMm / 2)
    expect(classCounts(frame).band).toBeGreaterThan(0)
  })

  it('Mid-360 consecutive frames use different non-repeating positions', () => {
    const sensor = placed('livox-mid360')
    const first = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 0)
    const second = generateFrame(sensor, DUAL_APERTURE, 0, 0, 0, 1)
    const changed = first.yMm.some((value, index) => Number.isFinite(value) && Number.isFinite(second.yMm[index]) && Math.abs(value - second.yMm[index]) > 1e-6)
    expect(changed).toBe(true)
  })

  it('Mid-360 pitch centres asymmetric coverage on the target', () => {
    const level = placed('livox-mid360', { pitchDeg: 0 })
    const centred = placed('livox-mid360', { pitchDeg: -22.5 })
    const levelCoverage = asymmetricCoverage(DUAL_APERTURE, 1, -7, 52, 0)
    const centredCoverage = asymmetricCoverage(DUAL_APERTURE, 1, -7, 52, -22.5)
    expect(levelCoverage.full).toBe(false)
    expect(levelCoverage.clippedFraction).toBeCloseTo(0.205, 1)
    expect(levelCoverage.lowerHalfClippedFraction).toBeCloseTo(0.41, 1)
    expect(levelCoverage.minimumStandOffM).toBeCloseTo(1.881, 2)
    expect(centredCoverage.full).toBe(true)
    expect(centredCoverage.lowerDeg).toBe(-29.5)
    expect(centredCoverage.upperDeg).toBe(29.5)
    expect(centredCoverage.minimumStandOffM).toBeCloseTo(0.408, 2)
    const levelFrame = generateFrame(level, DUAL_APERTURE, 0, 0, 0)
    const centredFrame = generateFrame(centred, DUAL_APERTURE, 0, 0, 0)
    expect(Math.min(...levelFrame.yMm.filter(Number.isFinite))).toBeGreaterThanOrEqual(1000 * Math.tan(-7 * DEG) - 1e-6)
    expect(Math.min(...centredFrame.yMm.filter((value, index) => Number.isFinite(value) && centredFrame.radiusMm[index] <= 210))).toBeLessThan(-190)
    expect(Math.max(...centredFrame.yMm.filter((value, index) => Number.isFinite(value) && centredFrame.radiusMm[index] <= 210))).toBeGreaterThan(190)
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
