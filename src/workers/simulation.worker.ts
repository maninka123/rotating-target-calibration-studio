/// <reference lib="webworker" />
import { contourEstimate, geometricEstimate } from '../core/estimators'
import { generateFrame } from '../core/sampling'
import { runSweep } from '../core/sweep'
import type { PlacedSensor, TargetConfig } from '../core/types'

type Request =
  | { id: number, type: 'frame', sensor: PlacedSensor, target: TargetConfig, rpm: number, angleDeg: number, startS: number, acquisitionIndex: number }
  | { id: number, type: 'estimate', sensor: PlacedSensor, target: TargetConfig, rpm: number, angleDeg: number, startS: number, acquisitionIndex: number, estimators: ('contour' | 'geometric')[], searchResolutionDeg: number }
  | { id: number, type: 'sweep', sensors: PlacedSensor[], target: TargetConfig, rpm: number, acquisitions: number, estimators: ('contour' | 'geometric')[], searchResolutionDeg: number }

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    if (request.type === 'frame') {
      const frame = generateFrame(request.sensor, request.target, request.rpm, request.angleDeg, request.startS, request.acquisitionIndex)
      self.postMessage({ id: request.id, type: 'frame', frame })
      return
    }
    if (request.type === 'estimate') {
      const frame = generateFrame(request.sensor, request.target, request.rpm, request.angleDeg, request.startS, request.acquisitionIndex)
      const results = request.estimators.map((estimator) => estimator === 'contour'
        ? contourEstimate(frame, request.target, request.sensor, request.rpm)
        : geometricEstimate(frame, request.target, request.rpm, request.searchResolutionDeg))
      self.postMessage({ id: request.id, type: 'estimate', frame, results })
      return
    }
    const result = runSweep(
      request.target,
      request.sensors,
      request.rpm,
      request.acquisitions,
      request.estimators,
      request.searchResolutionDeg,
      (fraction) => self.postMessage({ id: request.id, type: 'progress', fraction }),
    )
    self.postMessage({ id: request.id, type: 'sweep', ...result })
  } catch (error) {
    self.postMessage({ id: request.id, type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

export {}
