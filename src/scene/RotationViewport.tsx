import type { TargetConfig } from '../core/types'
import { hubRadiusPreviewUnits, targetGeometrySignature } from '../core/viewGeometry'

const point = (radius: number, angle: number) => `${120 + radius * Math.cos(angle)},${120 - radius * Math.sin(angle)}`

function openingPath(target: TargetConfig): string {
  const outer = target.outerDiameterMm / 2
  return target.apertures.map((aperture) => {
    const inner = aperture.innerRadiusMm / outer * 100
    const start = (aperture.centreDeg - aperture.widthDeg / 2) * Math.PI / 180
    const end = (aperture.centreDeg + aperture.widthDeg / 2) * Math.PI / 180
    return `M${point(inner, start)} L${point(100, start)} A100,100 0 0,0 ${point(100, end)} L${point(inner, end)} A${inner},${inner} 0 0,1 ${point(inner, start)} Z`
  }).join(' ')
}

export function RotationViewport({ target, angleDeg }: { target: TargetConfig, angleDeg: number, playing: boolean, rpm: number }) {
  const maskId = 'rotation-target-mask'
  return <div className="rotation-wrap" data-testid="rotation-view" data-target-signature={targetGeometrySignature(target)} data-hub-radius-mm={target.hubRadiusMm}>
    <svg viewBox="0 0 240 240" role="img" aria-label="Face-on rotating target">
      <defs><mask id={maskId}><rect width="240" height="240" fill="black" /><circle cx="120" cy="120" r="100" fill="white" /><path d={openingPath(target)} fill="black" /></mask></defs>
      <g transform={`rotate(${-angleDeg} 120 120)`} className="rotation-target-svg">
        <circle cx="120" cy="120" r="100" fill="#65757b" mask={`url(#${maskId})`} />
        <path d={openingPath(target)} fill="none" stroke="#20282a" strokeWidth="2" />
        <circle cx="120" cy="120" r={hubRadiusPreviewUnits(target, 100)} fill="#c94b43" stroke="#451c1a" strokeWidth="2" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="#20282a" strokeWidth="2.5" />
      </g>
      <path d="M232 120 L220 114 L220 126 Z" fill="#1f292c" aria-label="Zero-degree reference" />
    </svg>
    <span className="rotation-angle">True orientation {angleDeg.toFixed(1)}°</span>
    <span className="rotation-realtime">1.00× real time</span>
  </div>
}
