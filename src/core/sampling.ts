import { apertureContains, DEG, rayPlaneIntersection } from './geometry'
import { angleAtTimeDeg, reportedTimestamp } from './timing'
import type { PlacedSensor, SampleFrame, SensorDefinition, TargetConfig } from './types'
import { APERTURE, BACKGROUND, MATERIAL } from './types'
import { SENSOR_LIBRARY, sensorSampleSummary } from '../sensors/library'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const fractional = (value: number): number => value - Math.floor(value)

const acquisitionSpan = (sensor: SensorDefinition): number => {
  if (sensor.timestampConvention === 'instantaneous') return 0
  if (sensor.timestampConvention === 'rolling-readout') return sensor.readoutTimeS
  return sensor.integrationTimeS
}

const referenceSensor = (sensor: SensorDefinition): SensorDefinition | undefined =>
  SENSOR_LIBRARY.find((item) => item.id === sensor.id)

export const expectedBandSampleCount = (sensor: SensorDefinition, target: TargetConfig): number => {
  const reference = referenceSensor(sensor)
  const baseCount = sensor.nominalBandSamples ?? sensorSampleSummary(sensor).sampleCount
  const referenceStandOff = reference?.standOffM ?? sensor.standOffM
  const radius = target.outerDiameterMm / 2
  const baseBandArea = 210 ** 2 - 50 ** 2
  const targetBandArea = Math.max(1, radius ** 2 - target.hubRadiusMm ** 2)
  let scale = targetBandArea / baseBandArea * (referenceStandOff / sensor.standOffM) ** 2
  if (sensor.architecture === 'camera' && sensor.resolution && reference?.resolution) {
    scale *= (sensor.resolution[0] * sensor.resolution[1])
      / (reference.resolution[0] * reference.resolution[1])
  }
  return Math.max(0, Math.round(baseCount * scale))
}

export const samplesAcrossTarget = (sensor: SensorDefinition, target: TargetConfig): number => {
  if (sensor.architecture === 'camera' && sensor.resolution) {
    const reference = referenceSensor(sensor)
    const baseFraction = sensor.targetFrameHeightFraction ?? 0.25
    const standScale = (reference?.standOffM ?? sensor.standOffM) / sensor.standOffM
    return sensor.resolution[1] * baseFraction * standScale * target.outerDiameterMm / 420
  }
  const angularDiameter = 2 * Math.atan((target.outerDiameterMm / 2000) / sensor.standOffM) / DEG
  const step = sensor.horizontalResolutionDeg ?? Math.min(sensor.horizontalFovDeg, sensor.verticalFovDeg) / Math.sqrt(sensor.nominalBandSamples ?? 500)
  return angularDiameter / step
}

const pointFor = (
  sensor: SensorDefinition,
  target: TargetConfig,
  index: number,
  count: number,
  acquisitionIndex: number,
): [number, number] => {
  const outer = target.outerDiameterMm / 2
  const inner = target.hubRadiusMm
  const phase = acquisitionIndex * 0.731
  if (sensor.architecture === 'rotating-head') {
    const rings = Math.max(1, sensor.nominalRings ?? sensor.channelCount ?? 4)
    const ring = index % rings
    const y = rings === 1 ? 0 : -outer * 0.92 + 1.84 * outer * ring / (rings - 1)
    const extent = Math.sqrt(Math.max(0, outer ** 2 - y ** 2))
    const along = Math.floor(index / rings)
    const perRing = Math.ceil(count / rings)
    const x = -extent + 2 * extent * ((along + 0.5) / perRing)
    if (Math.hypot(x, y) < inner) return [Math.sign(x || 1) * inner * 1.02, y]
    return [x, y]
  }
  if (sensor.architecture === 'prism') {
    const theta = 2 * Math.PI * fractional(index * 0.61803398875 + phase)
    const radialWave = 0.15 + 0.85 * Math.abs(Math.sin(index * 0.0137 + phase) * Math.cos(index * 0.0091 - phase))
    const radius = Math.sqrt(inner ** 2 + radialWave * (outer ** 2 - inner ** 2))
    return [radius * Math.cos(theta), radius * Math.sin(theta)]
  }
  if (sensor.architecture === 'micro-mirror') {
    const u = fractional(index * 0.754877666 + phase)
    const v = fractional(index * 0.569840296 + phase * 0.37)
    const x = (2 * u - 1) * outer
    const y = Math.sin((2 * v - 1) * Math.PI / 2) * outer
    const radius = Math.hypot(x, y)
    if (radius > outer || radius < inner) {
      const theta = index * GOLDEN_ANGLE + phase
      const r = inner + (outer - inner) * fractional(index * 0.4142)
      return [r * Math.cos(theta), r * Math.sin(theta)]
    }
    return [x, y]
  }
  if (sensor.architecture === 'rotating-mirror') {
    const theta = index * GOLDEN_ANGLE + phase
    const radius = Math.sqrt(inner ** 2 + fractional(index * 0.367879 + phase) * (outer ** 2 - inner ** 2))
    const stripe = 0.82 + 0.18 * Math.sin(index * 0.071 + phase)
    return [radius * Math.cos(theta) * stripe, radius * Math.sin(theta)]
  }
  const theta = index * GOLDEN_ANGLE + phase * 0.05
  const radius = Math.sqrt(inner ** 2 + ((index + 0.5) / count) * (outer ** 2 - inner ** 2))
  return [radius * Math.cos(theta), radius * Math.sin(theta)]
}

export const generateFrame = (
  sensor: PlacedSensor,
  target: TargetConfig,
  rpm: number,
  initialAngleDeg: number,
  acquisitionStartS: number,
  acquisitionIndex = 0,
): SampleFrame => {
  let bandCount = expectedBandSampleCount(sensor, target)
  if (sensor.architecture === 'micro-mirror' && sensor.sparseFailureRate) {
    const draw = fractional(Math.sin((acquisitionIndex + 1) * 91.173) * 43758.5453)
    if (draw < sensor.sparseFailureRate) bandCount = 30
  }
  const backgroundCount = Math.min(1500, Math.max(24, Math.round(Math.sqrt(Math.max(1, bandCount)) * 3)))
  const total = bandCount + backgroundCount
  const xMm = new Float64Array(total)
  const yMm = new Float64Array(total)
  const radiusMm = new Float64Array(total)
  const phiRad = new Float64Array(total)
  const observationTimeS = new Float64Array(total)
  const classes = new Uint8Array(total)
  const inWorkingBand = new Uint8Array(total)
  const span = acquisitionSpan(sensor)
  const outer = target.outerDiameterMm / 2

  for (let index = 0; index < total; index += 1) {
    let intendedX: number
    let intendedY: number
    if (index < bandCount) {
      ;[intendedX, intendedY] = pointFor(sensor, target, index, bandCount, acquisitionIndex)
    } else {
      const theta = (index - bandCount) * GOLDEN_ANGLE
      const radius = outer * (1.03 + 0.35 * fractional(index * 0.41421356))
      intendedX = radius * Math.cos(theta)
      intendedY = radius * Math.sin(theta)
    }

    const directionX = intendedX / (sensor.standOffM * 1000)
    const directionY = intendedY / (sensor.standOffM * 1000)
    const hit = rayPlaneIntersection(directionX, directionY, 1, sensor.standOffM)
    if (!hit) continue
    const [x, y] = hit
    const radius = Math.hypot(x, y)
    const phi = Math.atan2(y, x)
    const sequenceFraction = sensor.timestampConvention === 'rolling-readout'
      ? Math.min(1, Math.max(0, (y / outer + 1) / 2))
      : total <= 1 ? 0 : index / (total - 1)
    const observation = acquisitionStartS + span * sequenceFraction
    const rotation = angleAtTimeDeg(initialAngleDeg, rpm, observation - acquisitionStartS) * DEG

    xMm[index] = x
    yMm[index] = y
    radiusMm[index] = radius
    phiRad[index] = phi
    observationTimeS[index] = observation
    inWorkingBand[index] = radius >= target.hubRadiusMm && radius <= outer ? 1 : 0
    classes[index] = radius > outer
      ? BACKGROUND
      : apertureContains(target, radius, phi, rotation) ? APERTURE : MATERIAL
  }

  const first = observationTimeS[0] ?? acquisitionStartS
  const last = observationTimeS[Math.max(0, total - 1)] ?? acquisitionStartS
  const mean = observationTimeS.reduce((sum, value) => sum + value, 0) / Math.max(1, total)
  const reported = reportedTimestamp(sensor, acquisitionStartS, first, last)
  return {
    sensorId: sensor.instanceId,
    acquisitionIndex,
    acquisitionStartS,
    reportedTimeS: reported,
    meanObservationTimeS: mean,
    trueAngleAtReportedDeg: angleAtTimeDeg(initialAngleDeg, rpm, reported - acquisitionStartS),
    trueAngleAtMeanDeg: angleAtTimeDeg(initialAngleDeg, rpm, mean - acquisitionStartS),
    xMm,
    yMm,
    radiusMm,
    phiRad,
    observationTimeS,
    classes,
    inWorkingBand,
    samplesAcrossTarget: samplesAcrossTarget(sensor, target),
    ringCount: sensor.architecture === 'rotating-head' ? sensor.nominalRings ?? sensor.channelCount ?? 0 : 0,
  }
}

export const classCounts = (frame: SampleFrame): { material: number, aperture: number, background: number, band: number } => {
  let material = 0
  let aperture = 0
  let background = 0
  let band = 0
  for (let i = 0; i < frame.classes.length; i += 1) {
    if (frame.classes[i] === MATERIAL) material += 1
    else if (frame.classes[i] === APERTURE) aperture += 1
    else background += 1
    band += frame.inWorkingBand[i]
  }
  return { material, aperture, background, band }
}
