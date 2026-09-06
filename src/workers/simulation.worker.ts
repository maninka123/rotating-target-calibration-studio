/// <reference lib="webworker" />
import { estimateFrozenFrame } from '../core/estimation'
import { generateFrame } from '../core/sampling'
import { runSweep } from '../core/sweep'
import type { PlacedSensor, SampleFrame, TargetConfig } from '../core/types'

type Request =
  | { id: number, type: 'frame', sensor: PlacedSensor, target: TargetConfig, rpm: number, angleDeg: number, startS: number, acquisitionIndex: number }
  | { id: number, type: 'estimate', frame: SampleFrame, target: TargetConfig, rpm: number, estimators: ('contour' | 'geometric')[], searchResolutionDeg: number }
  | { id: number, type: 'sweep', sensors: PlacedSensor[], target: TargetConfig, rpm: number, angleDeg: number, rotations: number, acquisitions: number, estimators: ('contour' | 'geometric')[], searchResolutionDeg: number }
  | { id: number, type: 'benchmark', sensors: PlacedSensor[], target: TargetConfig, rpm: number, angleDeg: number, estimators: ('contour' | 'geometric')[], searchResolutionDeg: number }

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    if (request.type === 'frame') {
      const frame = generateFrame(request.sensor, request.target, request.rpm, request.angleDeg, request.startS, request.acquisitionIndex)
      self.postMessage({ id: request.id, type: 'frame', frame })
      return
    }
    if (request.type === 'estimate') {
      const frame = request.frame
      const results = estimateFrozenFrame(frame, request.target, request.rpm, request.estimators, request.searchResolutionDeg)
      self.postMessage({ id: request.id, type: 'estimate', frame, results })
      return
    }
    if (request.type === 'benchmark') {
      const start = performance.now()
      runSweep(request.target, request.sensors, request.rpm, 1, request.estimators, request.searchResolutionDeg, undefined, 1, request.angleDeg)
      self.postMessage({ id: request.id, type: 'benchmark', secondsPerAcquisition: (performance.now() - start) / 1000 })
      return
    }
    const result = runSweep(
      request.target,
      request.sensors,
      request.rpm,
      request.acquisitions,
      request.estimators,
      request.searchResolutionDeg,
      (fraction, checkpoint) => self.postMessage({ id: request.id, type: 'progress', fraction, checkpoint }),
      request.rotations,
      request.angleDeg,
    )
    self.postMessage({ id: request.id, type: 'sweep', ...result })
  } catch (error) {
    self.postMessage({ id: request.id, type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

export {}
