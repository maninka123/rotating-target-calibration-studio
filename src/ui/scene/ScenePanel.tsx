import { lazy, Suspense, useState } from 'react'
import type { PlacedSensor, TargetConfig } from '../../core/types'
import { Panel } from '../shared/Panel'

const SceneViewport = lazy(() => import('../../scene/SceneViewport').then((module) => ({ default: module.SceneViewport })))

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
  const [showDimensions, setShowDimensions] = useState(true)
  const [showFov, setShowFov] = useState(true)
  const [fovOpacity, setFovOpacity] = useState(0.04)
  return (
    <Panel number={3} title="3D scene" className="scene-panel">
      <Suspense fallback={<div className="scene-wrap scene-loading">Loading 3D renderer…</div>}><SceneViewport {...props} showDimensions={showDimensions} showFov={showFov} fovOpacity={fovOpacity} /></Suspense>
      <div className="transport">
        <button data-testid="play-pause" onClick={() => props.onPlaying(!props.playing)}>{props.playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => { props.onPlaying(false); props.onAngle((props.angleDeg + 1) % 360) }}>Step frame</button>
        <label className="speed-control"><span>Flywheel speed</span><span><input aria-label="Flywheel speed" type="range" min="0" max="20" step="0.1" value={props.rpm} onChange={(event) => props.onRpm(Number(event.target.value))} /><input aria-label="Flywheel speed value" type="number" min="0" max="20" step="0.1" value={props.rpm} onChange={(event) => props.onRpm(Math.min(20, Math.max(0, Number(event.target.value))))} /><small>rpm</small></span></label>
        <label><span>Last revolution <strong>{props.angleDeg.toFixed(1)}°</strong></span><input aria-label="Revolution angle" type="range" min="0" max="360" step="0.1" value={props.angleDeg} onChange={(event) => { props.onPlaying(false); props.onAngle(Number(event.target.value)) }} /></label>
        <div className="scene-options"><label className="check"><input type="checkbox" checked={props.showRays} onChange={(event) => props.onShowRays(event.target.checked)} /> Sample rays</label><label className="check"><input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} /> Distances</label><label className="check"><input type="checkbox" checked={showFov} onChange={(event) => setShowFov(event.target.checked)} /> Sensor FOV</label><label className="fov-opacity"><span>FOV opacity</span><input aria-label="FOV opacity" type="range" min="0.01" max="0.18" step="0.01" value={fovOpacity} onChange={(event) => setFovOpacity(Number(event.target.value))} /></label></div>
      </div>
    </Panel>
  )
}
