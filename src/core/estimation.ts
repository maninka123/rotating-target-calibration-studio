import { wrapDeg } from './geometry'
import { timingEquivalentS } from './timing'
import { contourEstimate, geometricEstimate } from './estimators'
import type { EstimateResult, EstimatorInput, EstimatorOutput, SampleFrame, TargetConfig } from './types'

export const estimatorInputFromFrame = (frame: SampleFrame, target: TargetConfig, searchResolutionDeg: number): EstimatorInput => ({
  xMm: frame.xMm, yMm: frame.yMm, radiusMm: frame.radiusMm, phiRad: frame.phiRad,
  observationTimeS: frame.observationTimeS, classes: frame.classes, inWorkingBand: frame.inWorkingBand, target,
  settings: { searchResolutionDeg, twoDimensionalCoverage: frame.architecture !== 'single-plane', ringCount: frame.ringCount },
})

export const evaluateEstimate = (output: EstimatorOutput, truthDeg: number, rpm: number): EstimateResult => {
  const signedErrorDeg = output.accepted && output.angleDeg !== undefined ? wrapDeg(output.angleDeg - truthDeg) : undefined
  return {
    estimator: output.estimator, accepted: output.accepted, reason: output.reason, angleDeg: output.angleDeg,
    trueAngleDeg: truthDeg, signedErrorDeg,
    timingErrorS: signedErrorDeg === undefined ? undefined : timingEquivalentS(signedErrorDeg, rpm),
    localCurvatureProxy: output.localCurvatureProxy, minimumCost: output.minimumCost,
    costAnglesDeg: output.costAnglesDeg, costs: output.costs, ambiguityOrder: output.ambiguityOrder,
  }
}

export const estimateFrozenFrame = (frame: SampleFrame, target: TargetConfig, rpm: number, estimators: ('contour' | 'geometric')[], searchResolutionDeg: number): EstimateResult[] => {
  const input = estimatorInputFromFrame(frame, target, searchResolutionDeg)
  return estimators.map((kind) => evaluateEstimate(kind === 'contour' ? contourEstimate(input) : geometricEstimate(input), frame.trueAngleAtReportedDeg, rpm))
}
