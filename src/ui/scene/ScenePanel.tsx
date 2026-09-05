import type { PlacedSensor, TargetConfig } from '../../core/types'
import { SceneViewport } from '../../scene/SceneViewport'
import { Panel } from '../shared/Panel'

interface Props {
  target: TargetConfig
  sensors: PlacedSensor[]
  rpm: number
  angleDeg: number
  playing: boolean
  showRays: boolean
  onRpm: (rpm: number) => void
  onAngle: (angle: number) => void
  onPlaying: (playing: boolean) => void
  onShowRays: (show: boolean) => void
}

export function ScenePanel(props: Props) {
  return (
    <Panel number={3} title="3D scene" className="scene-panel">
      <SceneViewport {...props} />
      <div className="transport">
        <button data-testid="play-pause" onClick={() => props.onPlaying(!props.playing)}>{props.playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => { props.onPlaying(false); props.onAngle((props.angleDeg + 1) % 360) }}>Step frame</button>
        <label><span>Rotation rate <strong>{props.rpm.toFixed(1)} rpm</strong></span><input type="range" min="0" max="20" step="0.1" value={props.rpm} onChange={(event) => props.onRpm(Number(event.target.value))} /></label>
        <label><span>Last revolution <strong>{props.angleDeg.toFixed(1)}°</strong></span><input aria-label="Revolution angle" type="range" min="0" max="360" step="0.1" value={props.angleDeg} onChange={(event) => { props.onPlaying(false); props.onAngle(Number(event.target.value)) }} /></label>
        <label className="check"><input type="checkbox" checked={props.showRays} onChange={(event) => props.onShowRays(event.target.checked)} /> Sample-ray overlay</label>
      </div>
    </Panel>
  )
}
