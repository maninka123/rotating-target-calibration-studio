import { useMemo, useState } from 'react'
import { minimumStandOffM } from '../../core/geometry'
import type { Architecture, PlacedSensor, SensorDefinition, TargetConfig, TimestampConvention } from '../../core/types'
import { ARCHITECTURE_LABELS, SENSOR_LIBRARY, customSensorErrors, sensorSampleSummary } from '../../sensors/library'
import { NumberField } from '../shared/NumberField'
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
    try { return JSON.parse(localStorage.getItem('rotating-target-custom-sensors') ?? '[]') as SensorDefinition[] } catch { return [] }
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
    localStorage.setItem('rotating-target-custom-sensors', JSON.stringify(next))
    setBuilderOpen(false)
  }
  return (
    <Panel number={2} title="Sensor configuration" actions={<button disabled={sensors.length >= 3} onClick={() => onChange([...sensors, { ...structuredClone(SENSOR_LIBRARY[6]), instanceId: crypto.randomUUID() }])}>Add sensor</button>}>
      <div className="sensor-stack">
        {sensors.map((sensor, index) => {
          const minimum = minimumStandOffM(target.outerDiameterMm / 2, sensor.horizontalFovDeg, sensor.verticalFovDeg)
          const fits = sensor.standOffM >= minimum
          return (
            <article className="sensor-card" key={sensor.instanceId}>
              <div className="sensor-heading"><strong>S{index + 1}</strong><select value={sensor.id} onChange={(event) => replace(index, event.target.value)}>{library.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="icon danger" disabled={sensors.length === 1} onClick={() => onChange(sensors.filter((_, position) => position !== index))}>×</button></div>
              <div className="field-grid compact">
                <NumberField label="Stand-off" value={sensor.standOffM} unit="m" step={0.01} min={0.1} onChange={(value) => update(index, { standOffM: value })} />
                <label className="field"><span>Timestamp</span><select value={sensor.timestampConvention} onChange={(event) => update(index, { timestampConvention: event.target.value as TimestampConvention })}>{conventions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                {sensor.timestampConvention === 'window-start' && <NumberField label="Window" value={sensor.integrationTimeS} unit="s" step={0.01} min={0} onChange={(value) => update(index, { integrationTimeS: value })} />}
                {sensor.timestampConvention === 'rolling-readout' && <NumberField label="Readout" value={sensor.readoutTimeS * 1000} unit="ms" step={1} min={0} onChange={(value) => update(index, { readoutTimeS: value / 1000 })} />}
                {sensor.architecture === 'rotating-head' && <NumberField label="Channels" value={sensor.channelCount ?? 16} min={1} max={256} onChange={(value) => update(index, { channelCount: value })} />}
              </div>
              <div className={`fov-status ${fits ? 'ok' : 'bad'}`}><span>{fits ? 'Target fits field of view' : 'Target is clipped'} · minimum {minimum.toFixed(2)} m</span>{!fits && <button onClick={() => update(index, { standOffM: Number(minimum.toFixed(3)) })}>Apply minimum</button>}</div>
              <div className="sensor-meta"><span>{ARCHITECTURE_LABELS[sensor.architecture]}</span><span>{sensor.resolution ? `${sensor.resolution[0]} × ${sensor.resolution[1]}` : `${sensor.horizontalFovDeg}° × ${sensor.verticalFovDeg}°`}</span></div>
            </article>
          )
        })}
      </div>
      <button className="text-button" onClick={() => setBuilderOpen((value) => !value)}>{builderOpen ? 'Close custom sensor builder' : 'Build a custom sensor'}</button>
      {builderOpen && <CustomBuilder onSave={saveCustom} />}
    </Panel>
  )
}

function CustomBuilder({ onSave }: { onSave: (sensor: SensorDefinition) => void }) {
  const [sensor, setSensor] = useState<SensorDefinition>({ ...structuredClone(SENSOR_LIBRARY[0]), id: `custom-${Date.now()}`, name: 'Custom sensor' })
  const errors = useMemo(() => customSensorErrors(sensor), [sensor])
  const summary = sensorSampleSummary(sensor)
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
        <NumberField label="Horizontal FOV" value={sensor.horizontalFovDeg} unit="°" min={1} max={360} onChange={(value) => setSensor({ ...sensor, horizontalFovDeg: value })} />
        <NumberField label="Vertical FOV" value={sensor.verticalFovDeg} unit="°" min={1} max={179} onChange={(value) => setSensor({ ...sensor, verticalFovDeg: value })} />
        <NumberField label="Stand-off" value={sensor.standOffM} unit="m" min={0.1} step={0.1} onChange={(value) => setSensor({ ...sensor, standOffM: value })} />
        <NumberField label="Nominal band samples" value={sensor.nominalBandSamples ?? 500} min={50} onChange={(value) => setSensor({ ...sensor, nominalBandSamples: value })} />
      </div>
      <p className="builder-summary">Estimated {summary.sampleCount.toLocaleString()} band samples · {summary.acrossTarget.toFixed(0)} samples across target</p>
      {errors.length > 0 && <div className="warning">{errors.join(' · ')}</div>}
      <button disabled={errors.length > 0} onClick={() => onSave(sensor)}>Save to this browser</button>
    </div>
  )
}
