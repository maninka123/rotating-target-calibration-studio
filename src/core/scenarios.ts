import { DUAL_APERTURE, SINGLE_APERTURE } from './presets'
import type { PlacedSensor, SimulationConfig } from './types'
import { byId } from '../sensors/library'

export const SCENARIO_NAMES = ['Sparse ring failure', 'Dense camera', 'Aperture ablation', 'Rolling shutter at rate', 'LiDAR–camera offset', 'Resolution threshold'] as const
export type ScenarioName = typeof SCENARIO_NAMES[number]
const placed = (id: string, index: number): PlacedSensor => ({ ...byId(id), instanceId: `scenario-${id}-${index}` })

export const scenarioConfiguration = (name: ScenarioName): SimulationConfig => {
  const common = { rpm: 5, angleDeg: 0, playing: false, showRays: false, searchResolutionDeg: 1 }
  if (name === 'Sparse ring failure') return { ...common, target: structuredClone(DUAL_APERTURE), sensors: [placed('ls-c4', 0)] }
  if (name === 'Dense camera') return { ...common, target: structuredClone(DUAL_APERTURE), sensors: [placed('flir-global', 0)] }
  if (name === 'Aperture ablation') return { ...common, target: structuredClone(SINGLE_APERTURE), sensors: [placed('puck-hires', 0)] }
  if (name === 'Rolling shutter at rate') return { ...common, rpm: 12, target: structuredClone(DUAL_APERTURE), sensors: [placed('flir-global', 0), placed('flir-rolling', 1)] }
  if (name === 'LiDAR–camera offset') return { ...common, target: structuredClone(DUAL_APERTURE), sensors: [placed('livox-avia', 0), placed('flir-global', 1)] }
  const camera = placed('flir-global', 0)
  camera.resolution = [484, 366]
  return { ...common, target: structuredClone(DUAL_APERTURE), sensors: [camera] }
}
