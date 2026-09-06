import { useEffect, useRef } from 'react'
import { classCounts } from '../../core/sampling'
import type { PlacedSensor, SampleFrame, TargetConfig } from '../../core/types'
import { Panel } from '../shared/Panel'
import { drawSamples } from '../shared/plots'

interface Props {
  sensors: PlacedSensor[]
  frames: Record<string, SampleFrame>
  target: TargetConfig
  playing: boolean
}

export function LiveSensorViews({ sensors, frames, target, playing }: Props) {
  return (
    <Panel number={5} title="Live sensor views" className="views-panel">
      <div className="view-grid">
        {sensors.map((sensor) => <SensorTile key={sensor.instanceId} sensor={sensor} frame={frames[sensor.instanceId]} target={target} playing={playing} />)}
      </div>
    </Panel>
  )
}

function SensorTile({ sensor, frame, target, playing }: { sensor: PlacedSensor, frame?: SampleFrame, target: TargetConfig, playing: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current && frame) drawSamples(canvas.current, frame, target)
  }, [frame, target])
  const counts = frame ? classCounts(frame) : { material: 0, aperture: 0, background: 0, band: 0 }
  return (
    <article className="sensor-view">
      <header><div><strong>{sensor.name}</strong><small>{sensor.architecture === 'camera' ? 'Synthetic classified image' : 'Target-plane projection'}</small></div><span className="live-dot">{playing ? 'LIVE' : 'PAUSED'}</span></header>
      <canvas ref={canvas} aria-label={`${sensor.name} live sensor view`} data-hub-radius-mm={target.hubRadiusMm} />
      <div className="tile-readouts">
        <span>Band <strong>{counts.band.toLocaleString()}</strong></span>
        <span>Material <strong>{counts.material.toLocaleString()}</strong></span>
        <span>Aperture <strong>{counts.aperture.toLocaleString()}</strong></span>
        <span>Background <strong>{counts.background.toLocaleString()}</strong></span>
        <span>Across target <strong>{frame?.samplesAcrossTarget.toFixed(0) ?? '—'}</strong></span>
        <span>True angle <strong>{frame?.trueAngleAtReportedDeg.toFixed(2) ?? '—'}°</strong></span>
        <span>Report − mean <strong>{frame ? ((frame.reportedTimeS - frame.meanObservationTimeS) * 1000).toFixed(1) : '—'} ms</strong></span>
        {sensor.architecture === 'rotating-head' && <span>Rings in band <strong>{frame?.ringCount ?? '—'}</strong></span>}
      </div>
      {sensor.resolution && <div className="resolution-line">Raw resolution {sensor.resolution[0]} × {sensor.resolution[1]} · target spans {frame ? (frame.samplesAcrossTarget / sensor.resolution[1] * 100).toFixed(0) : '—'}% of frame height</div>}
    </article>
  )
}
