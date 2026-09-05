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
  horizontalFovDeg: number
  verticalFovDeg: number
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
  resolution?: [number, number]
  focalLengthMm?: number
  pixelPitchUm?: number
  shutter?: 'global' | 'rolling'
  spectralBand?: string
  targetFrameHeightFraction?: number
  nominalBandSamples?: number
  nominalRings?: number
  sparseFailureRate?: number
}

export interface PlacedSensor extends SensorDefinition {
  instanceId: string
}

export interface SampleFrame {
  sensorId: string
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
  reason?: 'insufficient boundary support' | 'correspondence failure' | 'fewer than 50 samples in working band' | 'fewer than 3 samples in each class' | 'minimum cost above threshold'
  angleDeg?: number
  trueAngleDeg: number
  signedErrorDeg?: number
  timingErrorS?: number | null
  uncertaintyDeg?: number
  minimumCost?: number
  costAnglesDeg?: Float64Array
  costs?: Float64Array
}

export interface SimulationConfig {
  target: TargetConfig
  sensors: PlacedSensor[]
  rpm: number
  angleDeg: number
  playing: boolean
  showRays: boolean
}

export interface SweepRecord {
  acquisition: number
  sensor: string
  trueAngleDeg: number
  reportedTimeS: number
  meanObservationTimeS: number
  estimator: string
  accepted: boolean
  errorDeg: number | null
  timingErrorS: number | null
  reason: string
}
