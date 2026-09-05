import type { SensorDefinition, SimulationConfig } from './types'

export const serialiseConfiguration = (config: SimulationConfig): string => JSON.stringify(config, null, 2)

export const parseConfiguration = (text: string): SimulationConfig => {
  const value = JSON.parse(text) as Partial<SimulationConfig>
  if (!value.target || !Array.isArray(value.sensors) || value.sensors.length < 1 || value.sensors.length > 3) throw new Error('Invalid configuration')
  return { ...value, rpm: value.rpm ?? 5, angleDeg: value.angleDeg ?? 0, playing: false, showRays: value.showRays ?? false, searchResolutionDeg: value.searchResolutionDeg ?? 1 } as SimulationConfig
}

export const serialiseCustomSensors = (sensors: SensorDefinition[]): string => JSON.stringify(sensors)
export const parseCustomSensors = (text: string): SensorDefinition[] => {
  const value = JSON.parse(text) as SensorDefinition[]
  if (!Array.isArray(value) || value.some((sensor) => !sensor.id || !sensor.name || !sensor.architecture)) throw new Error('Invalid custom sensors')
  return value
}
