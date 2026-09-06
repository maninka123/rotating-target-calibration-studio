import { useMemo, useState } from 'react'
import { asymmetricCoverage, minimumStandOffM } from '../../core/geometry'
import { classCounts, generateFrame } from '../../core/sampling'
import { sensorFovDeg } from '../../core/optics'
import { parseCustomSensors, serialiseCustomSensors } from '../../core/config'
import type { Architecture, PlacedSensor, SensorDefinition, TargetConfig, TimestampConvention } from '../../core/types'
import { ARCHITECTURE_LABELS, COVERAGE_SHAPES, SENSOR_LIBRARY, customSensorErrors } from '../../sensors/library'
import { NumberField } from '../shared/NumberField'
import { TIMESTAMP_DESCRIPTIONS } from '../../core/timing'
import { Panel } from '../shared/Panel'

interface Props {
  target: TargetConfig
  sensors: PlacedSensor[]
  onChange: (sensors: PlacedSensor[]) => void
}

const conventions: { value: TimestampConvention, label: string }[] = [
  { value: 'instantaneous', label: 'Instantaneous' },
  { value: 'window-start', label: 'Accumulation-window start' },
  { value: 'exposure-midpoint', label: 'Exposure midpoint' },
  { value: 'rolling-readout', label: 'Rolling readout' },
]

export function SensorConfiguration({ target, sensors, onChange }: Props) {
  const [builderOpen, setBuilderOpen] = useState(false)
  const [customSensors, setCustomSensors] = useState<SensorDefinition[]>(() => {
    try { return parseCustomSensors(localStorage.getItem('rotating-target-custom-sensors') ?? '[]') } catch { return [] }
  })
  const library = [...SENSOR_LIBRARY, ...customSensors]
  const update = (index: number, patch: Partial<PlacedSensor>) => onChange(sensors.map((sensor, position) => position === index ? { ...sensor, ...patch } : sensor))
  const replace = (index: number, id: string) => {
    const selected = library.find((sensor) => sensor.id === id)
    if (selected) onChange(sensors.map((sensor, position) => position === index ? { ...structuredClone(selected), instanceId: sensor.instanceId } : sensor))
  }
  const saveCustom = (sensor: SensorDefinition) => {
    const next = [...customSensors.filter((item) => item.id !== sensor.id), sensor]
    setCustomSensors(next)
    localStorage.setItem('rotating-target-custom-sensors', serialiseCustomSensors(next))
    setBuilderOpen(false)
  }
  return (
    <Panel number={2} title="Sensor configuration" actions={<button disabled={sensors.length >= 3} onClick={() => onChange([...sensors, { ...structuredClone(SENSOR_LIBRARY[6]), instanceId: crypto.randomUUID() }])}>Add sensor</button>}>
      <p className="sensor-description">Sensors are analytically colocated on the target axis. Small lateral separation in the 3D scene is for display only.</p>
      <div className="sensor-stack">
        {sensors.map((sensor, index) => {
          const fov = sensorFovDeg(sensor)
          const minimum = minimumStandOffM(target.outerDiameterMm / 2, fov.horizontalDeg, fov.verticalDeg)
          const asymmetric = sensor.elevationLowerDeg !== undefined && sensor.elevationUpperDeg !== undefined
          const coverage = asymmetric ? asymmetricCoverage(target, sensor.standOffM, sensor.elevationLowerDeg!, sensor.elevationUpperDeg!, sensor.pitchDeg ?? 0) : null
          const fits = coverage ? coverage.full : sensor.standOffM >= minimum
          const bandSamples = classCounts(generateFrame(sensor, target, 0, 0, 0)).band
          return (
            <article className="sensor-card" key={sensor.instanceId}>
              <div className="sensor-heading"><strong>S{index + 1}</strong><select value={sensor.id} onChange={(event) => replace(index, event.target.value)}>{library.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="icon danger" disabled={sensors.length === 1} onClick={() => onChange(sensors.filter((_, position) => position !== index))}>×</button></div>
              <div className="field-grid compact">
                <NumberField label="Stand-off" value={sensor.standOffM} unit="m" step={0.01} min={0.1} onChange={(value) => update(index, { standOffM: value })} />
                <label className="field"><span>Timestamp</span><select value={sensor.timestampConvention} onChange={(event) => update(index, { timestampConvention: event.target.value as TimestampConvention })}>{conventions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                {sensor.timestampConvention === 'window-start' && <NumberField label="Window" value={sensor.integrationTimeS} unit="s" step={0.01} min={0} onChange={(value) => update(index, { integrationTimeS: value })} />}
                {sensor.timestampConvention === 'rolling-readout' && <NumberField label="Readout" value={sensor.readoutTimeS * 1000} unit="ms" step={1} min={0} onChange={(value) => update(index, { readoutTimeS: value / 1000 })} />}
                {sensor.architecture === 'rotating-head' && <NumberField label="Channels" value={sensor.channelCount ?? 16} min={1} max={256} onChange={(value) => update(index, { channelCount: value })} />}
                {asymmetric && <NumberField label="Pitch" value={sensor.pitchDeg ?? 0} unit="°" step={0.5} min={-89} max={89} onChange={(value) => update(index, { pitchDeg: value })} />}
              </div>
              <div className="sensor-description">{TIMESTAMP_DESCRIPTIONS[sensor.timestampConvention]}</div>
              <div className={`fov-status ${fits ? 'ok' : 'bad'}`}><span>{fits ? 'Target coverage: full' : coverage ? `Target coverage: clipped · ${(coverage.clippedFraction * 100).toFixed(0)}% overall / ${(coverage.lowerHalfClippedFraction * 100).toFixed(0)}% of lower half outside` : 'Target coverage: clipped'}{coverage ? ` · elevation ${coverage.lowerDeg >= 0 ? '+' : ''}${coverage.lowerDeg.toFixed(1)}° to ${coverage.upperDeg >= 0 ? '+' : ''}${coverage.upperDeg.toFixed(1)}° · minimum ${Number.isFinite(coverage.minimumStandOffM) ? `${coverage.minimumStandOffM.toFixed(3)} m` : 'unavailable'}` : ` · minimum ${minimum.toFixed(2)} m`}</span>{!fits && !asymmetric && <button onClick={() => update(index, { standOffM: Number(minimum.toFixed(3)) })}>Apply minimum</button>}{coverage && <button onClick={() => update(index, { pitchDeg: -(sensor.elevationLowerDeg! + sensor.elevationUpperDeg!) / 2 })}>Centre on target · {asymmetricCoverage(target, sensor.standOffM, sensor.elevationLowerDeg!, sensor.elevationUpperDeg!, -(sensor.elevationLowerDeg! + sensor.elevationUpperDeg!) / 2).minimumStandOffM.toFixed(3)} m</button>}</div>
              <div className="sensor-meta"><span>{ARCHITECTURE_LABELS[sensor.architecture]} · {COVERAGE_SHAPES[sensor.architecture]}</span><span>{sensor.resolution ? `${sensor.resolution[0]} × ${sensor.resolution[1]} · ${fov.horizontalDeg.toFixed(1)}° × ${fov.verticalDeg.toFixed(1)}°` : asymmetric ? `360° × (${sensor.elevationLowerDeg}°…+${sensor.elevationUpperDeg}°)` : `${fov.horizontalDeg}° × ${fov.verticalDeg}°`}</span></div>
              {sensor.scanMode && <div className="sensor-description">{sensor.scanMode}</div>}
              <div className="sensor-description">{bandSamples.toLocaleString()} samples in working band</div>
            </article>
          )
        })}
      </div>
      <button className="text-button" onClick={() => setBuilderOpen((value) => !value)}>{builderOpen ? 'Close custom sensor builder' : 'Build a custom sensor'}</button>
      {builderOpen && <CustomBuilder target={target} onSave={saveCustom} />}
    </Panel>
  )
}

function CustomBuilder({ target, onSave }: { target: TargetConfig, onSave: (sensor: SensorDefinition) => void }) {
  const [sensor, setSensor] = useState<SensorDefinition>({ ...structuredClone(SENSOR_LIBRARY[0]), id: `custom-${Date.now()}`, name: 'Custom sensor' })
  const errors = useMemo(() => customSensorErrors(sensor), [sensor])
  const summary = useMemo(() => {
    const frame = generateFrame({ ...sensor, instanceId: sensor.id }, target, 0, 0, 0)
    return { sampleCount: classCounts(frame).band, acrossTarget: frame.samplesAcrossTarget }
  }, [sensor, target])
  const setArchitecture = (architecture: Architecture) => {
    const template = SENSOR_LIBRARY.find((item) => item.architecture === architecture) ?? SENSOR_LIBRARY[0]
    setSensor({ ...structuredClone(template), id: sensor.id, name: sensor.name })
  }
  return (
    <div className="builder">
      <h3>Custom sensor builder</h3>
      <div className="field-grid">
        <label className="field"><span>Name</span><input value={sensor.name} onChange={(event) => setSensor({ ...sensor, name: event.target.value })} /></label>
        <label className="field"><span>Architecture</span><select value={sensor.architecture} onChange={(event) => setArchitecture(event.target.value as Architecture)}>{Object.entries(ARCHITECTURE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {sensor.architecture !== 'camera' && <><NumberField label="Horizontal FOV" value={sensor.horizontalFovDeg ?? 1} unit="°" min={1} max={360} onChange={(value) => setSensor({ ...sensor, horizontalFovDeg: value })} /><NumberField label="Vertical FOV" value={sensor.verticalFovDeg ?? 1} unit="°" min={1} max={179} onChange={(value) => setSensor({ ...sensor, verticalFovDeg: value })} /></>}
        {sensor.architecture === 'camera' && <><NumberField label="Resolution width" value={sensor.resolution?.[0] ?? 640} unit="px" min={32} onChange={(value) => setSensor({ ...sensor, resolution: [Math.round(value), sensor.resolution?.[1] ?? 480] })} /><NumberField label="Resolution height" value={sensor.resolution?.[1] ?? 480} unit="px" min={32} onChange={(value) => setSensor({ ...sensor, resolution: [sensor.resolution?.[0] ?? 640, Math.round(value)] })} /><NumberField label="Focal length" value={sensor.focalLengthMm ?? 4} unit="mm" min={0.1} step={0.1} onChange={(value) => setSensor({ ...sensor, focalLengthMm: value })} /><NumberField label="Pixel pitch" value={sensor.pixelPitchUm ?? 4.5} unit="µm" min={0.1} step={0.1} onChange={(value) => setSensor({ ...sensor, pixelPitchUm: value })} /></>}
        <NumberField label="Stand-off" value={sensor.standOffM} unit="m" min={0.1} step={0.1} onChange={(value) => setSensor({ ...sensor, standOffM: value })} />
        {['prism', 'micro-mirror', 'rotating-mirror'].includes(sensor.architecture) && <NumberField label="Pulse rate" value={sensor.sampleRateHz ?? 10000} unit="Hz" min={100} onChange={(value) => setSensor({ ...sensor, sampleRateHz: value })} />}
        {sensor.architecture === 'micro-mirror' && <><NumberField label="Scan lines/frame" value={sensor.scanLinesPerFrame ?? 200} min={2} onChange={(value) => setSensor({ ...sensor, scanLinesPerFrame: value })} /><NumberField label="Mirror eigenfrequency" value={sensor.mirrorEigenfrequencyHz ?? 1000} unit="Hz" min={1} onChange={(value) => setSensor({ ...sensor, mirrorEigenfrequencyHz: value })} /></>}
        {sensor.elevationLowerDeg !== undefined && sensor.elevationUpperDeg !== undefined && <><NumberField label="Lower elevation" value={sensor.elevationLowerDeg} unit="°" min={-89} max={89} step={0.5} onChange={(value) => setSensor({ ...sensor, elevationLowerDeg: value, verticalFovDeg: sensor.elevationUpperDeg! - value })} /><NumberField label="Upper elevation" value={sensor.elevationUpperDeg} unit="°" min={-89} max={89} step={0.5} onChange={(value) => setSensor({ ...sensor, elevationUpperDeg: value, verticalFovDeg: value - sensor.elevationLowerDeg! })} /><NumberField label="Pitch" value={sensor.pitchDeg ?? 0} unit="°" min={-89} max={89} step={0.5} onChange={(value) => setSensor({ ...sensor, pitchDeg: value })} /></>}
        {sensor.architecture === 'electronic-array' && <><NumberField label="Grid columns" value={sensor.gridColumns ?? 64} min={2} onChange={(value) => setSensor({ ...sensor, gridColumns: value })} /><NumberField label="Grid rows" value={sensor.gridRows ?? 48} min={2} onChange={(value) => setSensor({ ...sensor, gridRows: value })} /></>}
      </div>
      <p className="builder-summary">Estimated {summary.sampleCount.toLocaleString()} band samples · {summary.acrossTarget.toFixed(0)} samples across target</p>
      {errors.length > 0 && <div className="warning">{errors.join(' · ')}</div>}
      <button disabled={errors.length > 0} onClick={() => onSave(sensor)}>Save to this browser</button>
    </div>
  )
}
