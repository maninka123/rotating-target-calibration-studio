export type SampleClass = 0 | 1 | 2
export const MATERIAL: SampleClass = 0
export const APERTURE: SampleClass = 1
export const BACKGROUND: SampleClass = 2

export interface Aperture {
  id: string
  widthDeg: number
  centreDeg: number
  innerRadiusMm: number
}

export interface TargetConfig {
  name: string
  outerDiameterMm: number
  hubRadiusMm: number
  thicknessMm: number
  backgroundDistanceM: number
  apertures: Aperture[]
}

export type Architecture =
  | 'rotating-head'
  | 'prism'
  | 'micro-mirror'
  | 'electronic-array'
  | 'rotating-mirror'
  | 'single-plane'
  | 'camera'

export type TimestampConvention =
  | 'instantaneous'
  | 'window-start'
  | 'exposure-midpoint'
  | 'rolling-readout'

export interface SensorDefinition {
  id: string
  name: string
  architecture: Architecture
  standOffM: number
  horizontalFovDeg?: number
  verticalFovDeg?: number
  elevationLowerDeg?: number
  elevationUpperDeg?: number
  pitchDeg?: number
  timestampConvention: TimestampConvention
  integrationTimeS: number
  readoutTimeS: number
  sampleRateHz?: number
  channelCount?: number
  horizontalResolutionDeg?: number
  headRateHz?: number
  prismRateAHz?: number
  prismRateBHz?: number
  wedgeADeg?: number
  wedgeBDeg?: number
  gridColumns?: number
  gridRows?: number
  scanLinesPerFrame?: number
  mirrorEigenfrequencyHz?: number
  emitterCount?: number
  resolution?: [number, number]
  focalLengthMm?: number
  pixelPitchUm?: number
  shutter?: 'global' | 'rolling'
  spectralBand?: string
  scanMode?: string
}

export interface PlacedSensor extends SensorDefinition {
  instanceId: string
}

export interface SampleFrame {
  sensorId: string
  architecture: Architecture
  acquisitionIndex: number
  acquisitionStartS: number
  reportedTimeS: number
  meanObservationTimeS: number
  trueAngleAtReportedDeg: number
  trueAngleAtMeanDeg: number
  xMm: Float64Array
  yMm: Float64Array
  radiusMm: Float64Array
  phiRad: Float64Array
  observationTimeS: Float64Array
  classes: Uint8Array
  inWorkingBand: Uint8Array
  samplesAcrossTarget: number
  ringCount: number
}

export interface EstimateResult {
  estimator: 'contour' | 'geometric'
  accepted: boolean
  reason?: 'insufficient boundary support' | 'correspondence failure' | 'insufficient two-dimensional boundary coverage' | 'fewer than 50 samples in working band' | 'fewer than 3 samples in each class' | 'minimum cost above threshold' | 'orientation ambiguous' | 'orientation unobservable'
  angleDeg?: number
  trueAngleDeg: number
  signedErrorDeg?: number
  timingErrorS?: number | null
  localCurvatureProxy?: number
  minimumCost?: number
  costAnglesDeg?: Float64Array
  costs?: Float64Array
  ambiguityOrder?: number
}

export interface EstimatorSettings {
  searchResolutionDeg: number
  twoDimensionalCoverage: boolean
  ringCount: number
}

export interface EstimatorInput {
  xMm: Float64Array
  yMm: Float64Array
  radiusMm: Float64Array
  phiRad: Float64Array
  observationTimeS: Float64Array
  classes: Uint8Array
  inWorkingBand: Uint8Array
  target: TargetConfig
  settings: EstimatorSettings
}

export interface EstimatorOutput {
  estimator: 'contour' | 'geometric'
  accepted: boolean
  reason?: EstimateResult['reason']
  angleDeg?: number
  localCurvatureProxy?: number
  minimumCost?: number
  costAnglesDeg?: Float64Array
  costs?: Float64Array
  ambiguityOrder?: number
}

export interface SimulationConfig {
  target: TargetConfig
  sensors: PlacedSensor[]
  rpm: number
  angleDeg: number
  playing: boolean
  showRays: boolean
  searchResolutionDeg: number
}

export interface SweepRecord {
  acquisition: number
  sensor: string
  sensorName: string
  trueAngleDeg: number
  reportedTimeS: number
  meanObservationTimeS: number
  estimator: string
  accepted: boolean
  errorDeg: number | null
  timingErrorS: number | null
  reason: string
}
