import { lazy, Suspense } from 'react'
import type { TargetConfig } from '../../core/types'
import { Panel } from '../shared/Panel'
const RotationViewport = lazy(() => import('../../scene/RotationViewport').then((module) => ({ default: module.RotationViewport })))
export function RotationPanel(props: { target: TargetConfig, angleDeg: number, playing: boolean, rpm: number }) {
  return <Panel number={4} title="Rotation view" className="rotation-panel"><Suspense fallback={<div className="rotation-wrap">Loading view…</div>}><RotationViewport {...props} /></Suspense></Panel>
}
