import { apertureContains, DEG, rayPlaneIntersection } from './geometry'
import { angleAtTimeDeg, reportedTimestamp } from './timing'
import { sensorFovDeg } from './optics'
import type { PlacedSensor, SampleFrame, SensorDefinition, TargetConfig } from './types'
import { APERTURE, BACKGROUND, MATERIAL } from './types'

const TAU = 2 * Math.PI

export const channelElevationsDeg = (sensor: SensorDefinition): number[] => {
  const count = Math.max(1, Math.round(sensor.channelCount ?? 1))
  const vertical = sensorFovDeg(sensor).verticalDeg
  return Array.from({ length: count }, (_, index) => count === 1 ? 0 : -vertical / 2 + vertical * index / (count - 1))
}

const scanSpanS = (sensor: SensorDefinition): number => {
  if (sensor.architecture === 'micro-mirror') return Math.max(1, sensor.scanLinesPerFrame ?? 200) / (2 * Math.max(1, sensor.mirrorEigenfrequencyHz ?? 1000))
  if (sensor.architecture === 'rotating-head' || sensor.architecture === 'rotating-mirror' || sensor.architecture === 'single-plane') return 1 / (sensor.headRateHz ?? 10)
  if (sensor.architecture === 'camera' && sensor.shutter === 'rolling') return sensor.readoutTimeS
  return sensor.integrationTimeS
}

interface CameraCrop { minColumn: number, columns: number, minRow: number, rows: number }

const cameraCrop = (sensor: SensorDefinition, target: TargetConfig): CameraCrop => {
  const [width, height] = sensor.resolution ?? [1, 1]
  const pitchMm = (sensor.pixelPitchUm ?? 1) / 1000
  const focalMm = sensor.focalLengthMm ?? 1
  const projectedRadiusPixels = (target.outerDiameterMm / 2000) / sensor.standOffM * focalMm / pitchMm
  const centreColumn = (width - 1) / 2
  const centreRow = (height - 1) / 2
  const minColumn = Math.max(0, Math.floor(centreColumn - projectedRadiusPixels - 1))
  const maxColumn = Math.min(width - 1, Math.ceil(centreColumn + projectedRadiusPixels + 1))
  const minRow = Math.max(0, Math.floor(centreRow - projectedRadiusPixels - 1))
  const maxRow = Math.min(height - 1, Math.ceil(centreRow + projectedRadiusPixels + 1))
  return { minColumn, columns: maxColumn - minColumn + 1, minRow, rows: maxRow - minRow + 1 }
}

export const generatedRayCount = (sensor: SensorDefinition, target: TargetConfig): number => {
  if (sensor.architecture === 'rotating-head') return Math.ceil(360 / (sensor.horizontalResolutionDeg ?? 0.2)) * Math.max(1, Math.round(sensor.channelCount ?? 1))
  if (sensor.architecture === 'single-plane') return Math.ceil((sensor.horizontalFovDeg ?? 0) / (sensor.horizontalResolutionDeg ?? 0.1)) + 1
  if (sensor.architecture === 'electronic-array') return Math.max(1, Math.round(sensor.gridColumns ?? 1)) * Math.max(1, Math.round(sensor.gridRows ?? 1))
  if (sensor.architecture === 'camera') { const crop = cameraCrop(sensor, target); return crop.columns * crop.rows }
  return Math.max(1, Math.round((sensor.sampleRateHz ?? 1) * scanSpanS(sensor)))
}

export const samplesAcrossTarget = (sensor: SensorDefinition, target: TargetConfig): number => {
  const angularDiameterDeg = 2 * Math.atan((target.outerDiameterMm / 2000) / sensor.standOffM) / DEG
  if (sensor.architecture === 'camera') return target.outerDiameterMm / 1000 / sensor.standOffM * ((sensor.focalLengthMm ?? 1) / 1000) / ((sensor.pixelPitchUm ?? 1) * 1e-6)
  if (sensor.architecture === 'electronic-array') return angularDiameterDeg / ((sensor.horizontalFovDeg ?? 1) / Math.max(1, (sensor.gridColumns ?? 2) - 1))
  return angularDiameterDeg / (sensor.horizontalResolutionDeg ?? (sensor.horizontalFovDeg ?? 1) / Math.sqrt(generatedRayCount(sensor, target)))
}

export const rotatingHeadBandRingCount = (sensor: SensorDefinition, target: TargetConfig): number => {
  return rotatingHeadBandElevationsDeg(sensor, target).length
}

export const rotatingHeadBandElevationsDeg = (sensor: SensorDefinition, target: TargetConfig): number[] => {
  const outer = target.outerDiameterMm / 2000
  return channelElevationsDeg(sensor).filter((elevation) => Math.abs(sensor.standOffM * Math.tan(elevation * DEG)) < outer)
}

export const rotatingHeadRingSampleCounts = (sensor: SensorDefinition, target: TargetConfig): number[] => {
  const outerM = target.outerDiameterMm / 2000
  const hubM = target.hubRadiusMm / 1000
  const resolution = (sensor.horizontalResolutionDeg ?? 0.2) * DEG
  const chordCount = (radius: number, height: number): number => {
    if (Math.abs(height) >= radius) return 0
    const halfChord = Math.sqrt(radius ** 2 - height ** 2)
    return 2 * Math.floor(Math.atan(halfChord / sensor.standOffM) / resolution) + 1
  }
  return channelElevationsDeg(sensor).flatMap((elevation) => {
    const height = sensor.standOffM * Math.tan(elevation * DEG)
    if (Math.abs(height) >= outerM) return []
    return [chordCount(outerM, height) - chordCount(hubM, height)]
  })
}

export const generateFrame = (
  sensor: PlacedSensor,
  target: TargetConfig,
  rpm: number,
  initialAngleDeg: number,
  acquisitionStartS: number,
  acquisitionIndex = 0,
): SampleFrame => {
  const total = generatedRayCount(sensor, target)
  const xMm = new Float64Array(total)
  const yMm = new Float64Array(total)
  const radiusMm = new Float64Array(total)
  const phiRad = new Float64Array(total)
  const observationTimeS = new Float64Array(total)
  const classes = new Uint8Array(total)
  const inWorkingBand = new Uint8Array(total)
  const span = scanSpanS(sensor)
  const outerMm = target.outerDiameterMm / 2
  const direction = new Float64Array(3)
  const elevations = sensor.architecture === 'rotating-head' ? channelElevationsDeg(sensor) : []
  const crop = sensor.architecture === 'camera' ? cameraCrop(sensor, target) : null
  const [imageWidth, imageHeight] = sensor.resolution ?? [1, 1]

  for (let index = 0; index < total; index += 1) {
    let fraction = total <= 1 ? 0 : index / (total - 1)
    if (sensor.architecture === 'rotating-head') {
      const channels = elevations.length
      const azimuthSteps = total / channels
      const channel = index % channels
      const azimuthIndex = Math.floor(index / channels)
      const azimuth = (-180 + 360 * azimuthIndex / azimuthSteps) * DEG
      const elevation = elevations[channel] * DEG
      direction[0] = Math.sin(azimuth)
      direction[1] = Math.tan(elevation) * Math.cos(azimuth)
      direction[2] = Math.cos(azimuth)
      fraction = azimuthIndex / Math.max(1, azimuthSteps - 1)
    } else if (sensor.architecture === 'prism') {
      const time = fraction * span
      const phaseA = acquisitionIndex * Math.SQRT2
      const phaseB = acquisitionIndex * Math.sqrt(3)
      const angleA = TAU * (sensor.prismRateAHz ?? 1) * time + phaseA
      const angleB = TAU * (sensor.prismRateBHz ?? -1) * time + phaseB
      const deflectionA = Math.tan((sensor.wedgeADeg ?? 1) * DEG)
      const deflectionB = Math.tan((sensor.wedgeBDeg ?? 1) * DEG)
      const normalizer = deflectionA + deflectionB
      const rawX = deflectionA * Math.cos(angleA) + deflectionB * Math.cos(angleB)
      const rawY = deflectionA * Math.sin(angleA) + deflectionB * Math.sin(angleB)
      direction[0] = rawX / normalizer * Math.tan((sensor.horizontalFovDeg ?? 0) * DEG / 2)
      direction[1] = rawY / normalizer * Math.tan((sensor.verticalFovDeg ?? 0) * DEG / 2)
      direction[2] = 1
    } else if (sensor.architecture === 'micro-mirror') {
      const time = fraction * span
      const carrier = TAU * (sensor.mirrorEigenfrequencyHz ?? 1000) * time + acquisitionIndex * 0.37
      const ramp = 1 - Math.abs(2 * fraction - 1)
      const horizontal = (sensor.horizontalFovDeg ?? 0) * DEG / 2 * Math.sin(carrier)
      const vertical = ramp * (sensor.verticalFovDeg ?? 0) * DEG / 2 * Math.sin(carrier + Math.PI / 4)
      direction[0] = Math.tan(horizontal)
      direction[1] = Math.tan(vertical)
      direction[2] = 1
    } else if (sensor.architecture === 'electronic-array') {
      const columns = Math.max(1, Math.round(sensor.gridColumns ?? 1))
      const rows = Math.max(1, Math.round(sensor.gridRows ?? 1))
      const column = index % columns
      const row = Math.floor(index / columns)
      const ax = columns === 1 ? 0 : -(sensor.horizontalFovDeg ?? 0) / 2 + (sensor.horizontalFovDeg ?? 0) * column / (columns - 1)
      const ay = rows === 1 ? 0 : -(sensor.verticalFovDeg ?? 0) / 2 + (sensor.verticalFovDeg ?? 0) * row / (rows - 1)
      direction[0] = Math.tan(ax * DEG); direction[1] = Math.tan(ay * DEG); direction[2] = 1
      fraction = 0.5
    } else if (sensor.architecture === 'rotating-mirror') {
      const emitters = Math.max(1, Math.round(sensor.emitterCount ?? 16))
      const emitter = index % emitters
      const azimuthSteps = Math.ceil(total / emitters)
      const azimuthIndex = Math.floor(index / emitters)
      fraction = azimuthIndex / Math.max(1, azimuthSteps - 1)
      const pitch = sensor.pitchDeg ?? 0
      const lower = (sensor.elevationLowerDeg ?? -(sensor.verticalFovDeg ?? 0) / 2) + pitch
      const upper = (sensor.elevationUpperDeg ?? (sensor.verticalFovDeg ?? 0) / 2) + pitch
      const nonRepeatingPhase = acquisitionIndex * Math.SQRT2 + azimuthIndex * (Math.sqrt(5) - 2)
      const emitterPosition = (emitter + 0.5 + 0.45 * Math.sin(TAU * nonRepeatingPhase)) / emitters
      const elevation = lower + (upper - lower) * emitterPosition
      const azimuth = (-(sensor.horizontalFovDeg ?? 0) / 2 + (sensor.horizontalFovDeg ?? 0) * fraction) * DEG
      direction[0] = Math.sin(azimuth)
      direction[1] = Math.tan(elevation * DEG) * Math.cos(azimuth)
      direction[2] = Math.cos(azimuth)
    } else if (sensor.architecture === 'single-plane') {
      const azimuth = (-(sensor.horizontalFovDeg ?? 0) / 2 + (sensor.horizontalFovDeg ?? 0) * fraction) * DEG
      direction[0] = Math.sin(azimuth); direction[1] = 0; direction[2] = Math.cos(azimuth)
    } else {
      const column = crop!.minColumn + index % crop!.columns
      const row = crop!.minRow + Math.floor(index / crop!.columns)
      const pitchMm = (sensor.pixelPitchUm ?? 1) / 1000
      direction[0] = (column - (imageWidth - 1) / 2) * pitchMm / (sensor.focalLengthMm ?? 1)
      direction[1] = -((row - (imageHeight - 1) / 2) * pitchMm / (sensor.focalLengthMm ?? 1))
      direction[2] = 1
      fraction = imageHeight <= 1 ? 0 : row / (imageHeight - 1)
    }

    const observation = sensor.architecture === 'camera'
      ? acquisitionStartS + sensor.integrationTimeS / 2 + (sensor.shutter === 'rolling' ? sensor.readoutTimeS * fraction : 0)
      : acquisitionStartS + span * fraction
    observationTimeS[index] = observation
    const hit = rayPlaneIntersection(direction[0], direction[1], direction[2], sensor.standOffM)
    if (!hit) { xMm[index] = Number.NaN; yMm[index] = Number.NaN; radiusMm[index] = Number.POSITIVE_INFINITY; classes[index] = BACKGROUND; continue }
    const [x, y] = hit
    const radius = Math.hypot(x, y)
    const phi = Math.atan2(y, x)
    const rotation = angleAtTimeDeg(initialAngleDeg, rpm, observation - acquisitionStartS) * DEG
    xMm[index] = x; yMm[index] = y; radiusMm[index] = radius; phiRad[index] = phi
    inWorkingBand[index] = radius >= target.hubRadiusMm && radius <= outerMm ? 1 : 0
    classes[index] = radius > outerMm ? BACKGROUND : apertureContains(target, radius, phi, rotation) ? APERTURE : MATERIAL
  }

  const first = sensor.architecture === 'camera' ? acquisitionStartS + sensor.integrationTimeS / 2 : (observationTimeS[0] ?? acquisitionStartS)
  const last = sensor.architecture === 'camera'
    ? first + (sensor.shutter === 'rolling' ? sensor.readoutTimeS : 0)
    : (observationTimeS[Math.max(0, total - 1)] ?? acquisitionStartS)
  let meanSum = 0; let meanCount = 0
  for (let index = 0; index < total; index += 1) if (inWorkingBand[index]) { meanSum += observationTimeS[index]; meanCount += 1 }
  const mean = meanCount ? meanSum / meanCount : (first + last) / 2
  const reported = reportedTimestamp(sensor, acquisitionStartS, first, last)
  return {
    sensorId: sensor.instanceId, architecture: sensor.architecture, acquisitionIndex, acquisitionStartS,
    reportedTimeS: reported, meanObservationTimeS: mean,
    trueAngleAtReportedDeg: angleAtTimeDeg(initialAngleDeg, rpm, reported - acquisitionStartS),
    trueAngleAtMeanDeg: angleAtTimeDeg(initialAngleDeg, rpm, mean - acquisitionStartS),
    xMm, yMm, radiusMm, phiRad, observationTimeS, classes, inWorkingBand,
    samplesAcrossTarget: samplesAcrossTarget(sensor, target),
    ringCount: sensor.architecture === 'rotating-head' ? rotatingHeadBandRingCount(sensor, target) : 0,
  }
}

export const classCounts = (frame: SampleFrame): { material: number, aperture: number, background: number, band: number } => {
  let material = 0; let aperture = 0; let background = 0; let band = 0
  for (let index = 0; index < frame.classes.length; index += 1) {
    if (frame.classes[index] === MATERIAL) material += 1
    else if (frame.classes[index] === APERTURE) aperture += 1
    else background += 1
    band += frame.inWorkingBand[index]
  }
  return { material, aperture, background, band }
}
