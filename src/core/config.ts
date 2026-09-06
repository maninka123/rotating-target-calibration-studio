import { overlappingAperturePair } from './geometry'
import type { Aperture, Architecture, PlacedSensor, SensorDefinition, SimulationConfig, TargetConfig, TimestampConvention } from './types'
import { customSensorErrors } from '../sensors/library'

const architectures: Architecture[] = ['rotating-head', 'prism', 'micro-mirror', 'electronic-array', 'rotating-mirror', 'single-plane', 'camera']
const conventions: TimestampConvention[] = ['instantaneous', 'window-start', 'exposure-midpoint', 'rolling-readout']
const finite = (value: unknown, field: string, minimum?: number, maximum?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) throw new Error(`${field} is invalid`)
  return value
}
const integer = (value: unknown, field: string, minimum = 1): number => {
  const result = finite(value, field, minimum, 1_000_000)
  if (!Number.isInteger(result)) throw new Error(`${field} must be an integer`)
  return result
}
const boolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${field} must be true or false`)
  return value
}

export const validateTarget = (value: unknown): TargetConfig => {
  if (!value || typeof value !== 'object') throw new Error('Target is missing')
  const target = value as Partial<TargetConfig>
  const outerDiameterMm = finite(target.outerDiameterMm, 'Target outer diameter', 1)
  const outerRadius = outerDiameterMm / 2
  const hubRadiusMm = finite(target.hubRadiusMm, 'Hub radius', 0, outerRadius)
  if (hubRadiusMm >= outerRadius) throw new Error('Hub radius must be smaller than the outer radius')
  const thicknessMm = finite(target.thicknessMm, 'Plate thickness', 0.01)
  const backgroundDistanceM = finite(target.backgroundDistanceM, 'Background distance', 0)
  if (!Array.isArray(target.apertures)) throw new Error('Apertures must be an array')
  const apertures = target.apertures.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Aperture ${index + 1} is invalid`)
    const aperture = item as Partial<Aperture>
    return {
      id: typeof aperture.id === 'string' && aperture.id ? aperture.id : `aperture-${index + 1}`,
      widthDeg: finite(aperture.widthDeg, `Aperture ${index + 1} width`, 0.001, 179),
      centreDeg: finite(aperture.centreDeg, `Aperture ${index + 1} centre`, -3600, 3600),
      innerRadiusMm: finite(aperture.innerRadiusMm, `Aperture ${index + 1} inner radius`, hubRadiusMm, outerRadius),
    }
  })
  const overlap = overlappingAperturePair(apertures)
  if (overlap) throw new Error(`Apertures ${overlap[0] + 1} and ${overlap[1] + 1} overlap`)
  if (new Set(apertures.map((a) => a.id)).size !== apertures.length) throw new Error('Aperture ids must be unique')
  return { name: typeof target.name === 'string' ? target.name : 'Imported target', outerDiameterMm, hubRadiusMm, thicknessMm, backgroundDistanceM, apertures }
}

export const validateSensor = (value: unknown, custom = false): SensorDefinition | PlacedSensor => {
  if (!value || typeof value !== 'object') throw new Error('Sensor is invalid')
  const sensor = value as Partial<PlacedSensor>
  if (!architectures.includes(sensor.architecture as Architecture)) throw new Error('Sensor architecture is invalid')
  if (!conventions.includes(sensor.timestampConvention as TimestampConvention)) throw new Error('Timestamp convention is invalid')
  const result = { ...sensor } as SensorDefinition
  if (typeof result.id !== 'string' || !result.id || typeof result.name !== 'string' || !result.name) throw new Error('Sensor id and name are required')
  finite(result.standOffM, 'Sensor stand-off', 0.001)
  finite(result.integrationTimeS, 'Integration time', 0, 10)
  finite(result.readoutTimeS, 'Readout time', 0, 10)
  if (result.architecture !== 'camera') {
    finite(result.horizontalFovDeg, 'Horizontal FOV', 0.001, 360)
    finite(result.verticalFovDeg, 'Vertical FOV', 0.001, 179.999)
  } else {
    delete result.horizontalFovDeg
    delete result.verticalFovDeg
    if (!Array.isArray(result.resolution) || result.resolution.length !== 2) throw new Error('Camera resolution is invalid')
    result.resolution = [integer(result.resolution[0], 'Camera width', 1), integer(result.resolution[1], 'Camera height', 1)]
    finite(result.focalLengthMm, 'Focal length', 0.001)
    finite(result.pixelPitchUm, 'Pixel pitch', 0.001)
    if (result.shutter !== 'global' && result.shutter !== 'rolling') throw new Error('Camera shutter is invalid')
  }
  if (result.architecture === 'rotating-head') { integer(result.channelCount, 'Channel count'); finite(result.horizontalResolutionDeg, 'Horizontal resolution', 0.0001); finite(result.headRateHz, 'Head rate', 0.001) }
  if (result.architecture === 'prism') { finite(result.sampleRateHz, 'Sample rate', 1); finite(result.prismRateAHz, 'Prism A rate'); finite(result.prismRateBHz, 'Prism B rate'); finite(result.wedgeADeg, 'Prism A wedge', 0); finite(result.wedgeBDeg, 'Prism B wedge', 0) }
  if (result.architecture === 'prism' && (!(result.wedgeADeg! + result.wedgeBDeg! > 0) || result.wedgeADeg! >= 89 || result.wedgeBDeg! >= 89)) throw new Error('Prism wedges must be below 89 degrees and cannot both be zero')
  if (result.architecture === 'micro-mirror') { finite(result.sampleRateHz, 'Sample rate', 1); integer(result.scanLinesPerFrame, 'Scan lines'); finite(result.mirrorEigenfrequencyHz, 'Mirror eigenfrequency', 0.001) }
  if (result.architecture === 'electronic-array') { integer(result.gridColumns, 'Grid columns'); integer(result.gridRows, 'Grid rows') }
  if (result.elevationLowerDeg !== undefined || result.elevationUpperDeg !== undefined) { const lower = finite(result.elevationLowerDeg, 'Lower elevation', -89, 89); const upper = finite(result.elevationUpperDeg, 'Upper elevation', -89, 89); if (lower >= upper) throw new Error('Lower elevation must be below upper elevation'); finite(result.pitchDeg ?? 0, 'Sensor pitch', -89, 89); result.pitchDeg ??= 0 }
  if (result.architecture === 'rotating-mirror') { finite(result.sampleRateHz, 'Sample rate', 1); integer(result.emitterCount, 'Emitter count'); finite(result.headRateHz, 'Head rate', 0.001) }
  if (result.architecture === 'single-plane') { finite(result.horizontalResolutionDeg, 'Horizontal resolution', 0.0001); finite(result.headRateHz, 'Head rate', 0.001) }
  if (result.pitchDeg !== undefined) finite(result.pitchDeg, 'Sensor pitch', -89, 89)
  if (result.elevationLowerDeg !== undefined && result.elevationUpperDeg !== undefined) {
    if (Math.abs(result.elevationLowerDeg + result.elevationUpperDeg) < 1e-9 && (result.pitchDeg ?? 0) !== 0) throw new Error('Pitch is only supported for asymmetric elevation coverage')
    if (result.elevationLowerDeg + (result.pitchDeg ?? 0) <= -90 || result.elevationUpperDeg + (result.pitchDeg ?? 0) >= 90) throw new Error('Pitched elevation limits must stay between -90 and 90 degrees')
  }
  const rayBudget = result.architecture === 'camera' ? result.resolution![0] * result.resolution![1]
    : result.architecture === 'rotating-head' ? Math.ceil(360 / result.horizontalResolutionDeg!) * result.channelCount!
    : result.architecture === 'electronic-array' ? result.gridRows! * result.gridColumns!
    : result.architecture === 'single-plane' ? Math.ceil(result.horizontalFovDeg! / result.horizontalResolutionDeg!) + 1
    : result.sampleRateHz! * (result.architecture === 'micro-mirror' ? result.scanLinesPerFrame! / (2 * result.mirrorEigenfrequencyHz!) : result.architecture === 'rotating-mirror' ? 1 / result.headRateHz! : result.integrationTimeS)
  if (!Number.isFinite(rayBudget) || rayBudget > 4_000_000) throw new Error('Sensor exceeds the browser limit of 4,000,000 rays per acquisition')
  if (custom) {
    const errors = customSensorErrors(result)
    if (errors.length) throw new Error(errors.join('; '))
  }
  if ('instanceId' in sensor) {
    if (typeof sensor.instanceId !== 'string' || !sensor.instanceId) throw new Error('Sensor instance id is invalid')
    return { ...result, instanceId: sensor.instanceId }
  }
  return result
}

export const serialiseConfiguration = (config: SimulationConfig): string => JSON.stringify(config, null, 2)

export const parseConfiguration = (text: string): SimulationConfig => {
  const value = JSON.parse(text) as Partial<SimulationConfig>
  if (!value || typeof value !== 'object' || !Array.isArray(value.sensors) || value.sensors.length < 1 || value.sensors.length > 3) throw new Error('Configuration must contain one to three sensors')
  const sensors = value.sensors.map((sensor) => {
    const validated = validateSensor(sensor)
    if (!('instanceId' in validated)) throw new Error('Placed sensor instance id is required')
    return validated
  })
  if (new Set(sensors.map((sensor) => sensor.instanceId)).size !== sensors.length) throw new Error('Sensor instance ids must be unique')
  return {
    target: validateTarget(value.target),
    sensors,
    rpm: finite(value.rpm, 'RPM', 0, 20),
    angleDeg: finite(value.angleDeg, 'Orientation', -3600, 3600),
    playing: boolean(value.playing, 'Playing'),
    showRays: boolean(value.showRays, 'Show coverage edges'),
    searchResolutionDeg: finite(value.searchResolutionDeg, 'Search resolution', 0.05, 10),
  }
}

export const serialiseCustomSensors = (sensors: SensorDefinition[]): string => JSON.stringify(sensors)
export const parseCustomSensors = (text: string): SensorDefinition[] => {
  const value = JSON.parse(text) as unknown
  if (!Array.isArray(value)) throw new Error('Custom sensors must be an array')
  return value.map((sensor) => validateSensor(sensor, true) as SensorDefinition)
}
