import { apertureArea, angularSensitivity, bendingStressMpa, centreOfMassEccentricity, minimumPlateThicknessMm, predictedDispersionRatio, removedAreaRelativeTo } from '../../core/geometry'
import { C7, C10, C11 } from '../../core/presets'
import type { TargetConfig } from '../../core/types'
import { NumberField } from '../shared/NumberField'
import { Panel } from '../shared/Panel'

interface Props {
  target: TargetConfig
  onChange: (target: TargetConfig) => void
}

export function TargetDesigner({ target, onChange }: Props) {
  const lambda = angularSensitivity(target)
  const eccentricity = centreOfMassEccentricity(target)
  const minimumThickness = minimumPlateThicknessMm(target)
  const stress = bendingStressMpa(target.outerDiameterMm / 2 - target.hubRadiusMm, target.thicknessMm)
  const update = (key: keyof TargetConfig, value: number) => onChange({ ...target, [key]: value })
  const updateAperture = (index: number, key: 'widthDeg' | 'centreDeg' | 'innerRadiusMm', value: number) => {
    const apertures = target.apertures.map((aperture, position) => position === index ? { ...aperture, [key]: value } : aperture)
    onChange({ ...target, apertures })
  }
  return (
    <Panel number={1} title="Target designer" className="target-panel">
      <div className="preset-row" aria-label="Target presets">
        <button onClick={() => onChange(structuredClone(C7))}>C7</button>
        <button className="active" onClick={() => onChange(structuredClone(C10))}>C10 proposed</button>
        <button onClick={() => onChange(structuredClone(C11))}>C11</button>
      </div>
      <div className="target-layout">
        <div>
          <div className="field-grid">
            <NumberField label="Outer diameter" value={target.outerDiameterMm} unit="mm" min={100} max={1000} onChange={(value) => update('outerDiameterMm', value)} />
            <NumberField label="Hub radius" value={target.hubRadiusMm} unit="mm" min={0} max={target.outerDiameterMm / 2 - 1} onChange={(value) => update('hubRadiusMm', value)} />
            <NumberField label="Plate thickness" value={target.thicknessMm} unit="mm" min={0.1} step={0.1} onChange={(value) => update('thicknessMm', value)} />
            <NumberField label="Background offset" value={target.backgroundDistanceM} unit="m" min={0.05} step={0.1} onChange={(value) => update('backgroundDistanceM', value)} />
          </div>
          <div className="subhead"><span>Apertures</span><button onClick={() => onChange({ ...target, apertures: [...target.apertures, { id: crypto.randomUUID(), widthDeg: 20, centreDeg: 90, innerRadiusMm: 100 }] })}>Add</button></div>
          <div className="aperture-list">
            {target.apertures.map((aperture, index) => (
              <div className="aperture-row" key={aperture.id}>
                <strong>A{index + 1}</strong>
                <NumberField label="Width" value={aperture.widthDeg} unit="°" min={1} max={179} onChange={(value) => updateAperture(index, 'widthDeg', value)} />
                <NumberField label="Centre" value={aperture.centreDeg} unit="°" min={0} max={359} onChange={(value) => updateAperture(index, 'centreDeg', value)} />
                <NumberField label="Inner radius" value={aperture.innerRadiusMm} unit="mm" min={target.hubRadiusMm} max={target.outerDiameterMm / 2 - 1} onChange={(value) => updateAperture(index, 'innerRadiusMm', value)} />
                <button className="icon danger" aria-label={`Remove aperture ${index + 1}`} disabled={target.apertures.length === 1} onClick={() => onChange({ ...target, apertures: target.apertures.filter((_, position) => position !== index) })}>×</button>
              </div>
            ))}
          </div>
        </div>
        <TargetPreview target={target} />
      </div>
      <div className="readout-grid">
        <Readout label="Angular sensitivity Λ" value={`${(lambda / 1e6).toFixed(2)} × 10⁶ mm³`} />
        <Readout label="Predicted SD vs C7" value={`${(predictedDispersionRatio(C7, target) * 100).toFixed(1)}%`} />
        <Readout label="Aperture area" value={`${apertureArea(target).toFixed(0)} mm²`} detail={`${removedAreaRelativeTo(target, C10) >= 0 ? '+' : ''}${removedAreaRelativeTo(target, C10).toFixed(0)} mm² vs C10`} />
        <Readout label="COM eccentricity" value={`${eccentricity.toFixed(1)} mm`} warning={eccentricity > 28.5} />
        <Readout label="Minimum thickness" value={`${minimumThickness.toFixed(2)} mm`} warning={target.thicknessMm < minimumThickness} />
        <Readout label="Maximum bending stress" value={`${stress.toFixed(2)} MPa`} />
      </div>
      {(eccentricity > 28.5 || target.thicknessMm < minimumThickness) && (
        <div className="warning">Design warning: {eccentricity > 28.5 ? 'centre-of-mass eccentricity exceeds 28.5 mm. ' : ''}{target.thicknessMm < minimumThickness ? 'Plate is below the self-weight deflection thickness.' : ''}</div>
      )}
    </Panel>
  )
}

function Readout({ label, value, detail, warning = false }: { label: string, value: string, detail?: string, warning?: boolean }) {
  return <div className={`readout ${warning ? 'readout-warning' : ''}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
}

function TargetPreview({ target }: { target: TargetConfig }) {
  const radius = target.outerDiameterMm / 2
  const path = target.apertures.map((aperture) => {
    const start = (aperture.centreDeg - aperture.widthDeg / 2) * Math.PI / 180
    const end = (aperture.centreDeg + aperture.widthDeg / 2) * Math.PI / 180
    const point = (r: number, a: number) => `${120 + r / radius * 100 * Math.cos(a)},${120 - r / radius * 100 * Math.sin(a)}`
    return `M${point(aperture.innerRadiusMm, start)} L${point(radius, start)} A100,100 0 0,0 ${point(radius, end)} L${point(aperture.innerRadiusMm, end)} A${aperture.innerRadiusMm / radius * 100},${aperture.innerRadiusMm / radius * 100} 0 0,1 ${point(aperture.innerRadiusMm, start)} Z`
  }).join(' ')
  return (
    <div className="target-preview">
      <svg viewBox="0 0 240 240" role="img" aria-label="Target top-down preview">
        <defs><mask id="target-mask"><rect width="240" height="240" fill="black"/><circle cx="120" cy="120" r="100" fill="white"/><path d={path} fill="black"/></mask></defs>
        <circle cx="120" cy="120" r="100" fill="#68777b" mask="url(#target-mask)" />
        <circle cx="120" cy="120" r={target.hubRadiusMm / radius * 100} fill="#3e494d" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="#263034" strokeWidth="2" />
        <line x1="120" y1="8" x2="120" y2="232" stroke="#9ca9ac" strokeDasharray="3 4" />
        <line x1="8" y1="120" x2="232" y2="120" stroke="#9ca9ac" strokeDasharray="3 4" />
      </svg>
    </div>
  )
}
