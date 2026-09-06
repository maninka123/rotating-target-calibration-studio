import { useEffect, useRef, useState } from 'react'
import { generatedRayCount } from '../../core/sampling'
import type { PlacedSensor, SimulationConfig } from '../../core/types'
import { sensorFovDeg } from '../../core/optics'
import type { TargetConfig } from '../../core/types'
import { sweepFolderName } from './sweepFiles'

interface PickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

interface Props {
  config: SimulationConfig
  acquisitions: number
  estimators: ('contour' | 'geometric')[]
  onCancel: () => void
  onConfirm: (directory: FileSystemDirectoryHandle | null, options: { rpm: number, rotations: number, intermediate: boolean }, folderName: string) => void
}

const architectureName = (sensor: PlacedSensor): string => sensor.architecture.replaceAll('-', ' ')

const scanDetails = (sensor: PlacedSensor): string => {
  if (sensor.architecture === 'camera') return `${sensor.resolution?.join(' × ')} px · ${sensor.focalLengthMm} mm lens · ${sensor.shutter} shutter`
  if (sensor.architecture === 'prism') return `${sensor.sampleRateHz?.toLocaleString()} pulses/s · ${sensor.integrationTimeS.toFixed(3)} s window · ${sensor.prismRateAHz}/${sensor.prismRateBHz} Hz prisms`
  if (sensor.architecture === 'rotating-head') return `${sensor.channelCount} channels · ${sensor.horizontalResolutionDeg}° horizontal step · ${sensor.headRateHz} Hz head`
  if (sensor.architecture === 'electronic-array') return `${sensor.gridColumns} × ${sensor.gridRows} fixed rays`
  if (sensor.architecture === 'micro-mirror') return `${sensor.sampleRateHz?.toLocaleString()} pulses/s · ${sensor.scanLinesPerFrame} lines · ${sensor.mirrorEigenfrequencyHz} Hz eigenfrequency`
  if (sensor.architecture === 'rotating-mirror') return `${sensor.emitterCount} emitters · ${sensor.headRateHz} Hz mirror`
  return `${sensor.horizontalResolutionDeg}° scan step`
}

const estimatedDuration = (config: SimulationConfig, acquisitions: number, estimators: ('contour' | 'geometric')[]): string => {
  const rays = config.sensors.reduce((sum, sensor) => sum + generatedRayCount(sensor, config.target), 0)
  const searchSteps = Math.ceil(360 / config.searchResolutionDeg)
  const estimatorFactor = (estimators.includes('geometric') ? searchSteps : 0) + (estimators.includes('contour') ? 4 : 0)
  const seconds = Math.max(1, acquisitions * rays * estimatorFactor / 18_000_000 * 1.35)
  if (seconds < 60) return `about ${Math.ceil(seconds)} seconds`
  return `about ${Math.ceil(seconds / 60)} minutes`
}

const simulatedSpan = (rpm: number): string => rpm > 0 ? `${(60 / rpm).toFixed(2)} s simulated` : 'static target'

export function SweepReviewDialog({ config, acquisitions, estimators, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [pickerError, setPickerError] = useState('')
  const [rpm, setRpm] = useState(config.rpm)
  const [rotations, setRotations] = useState(1)
  const [intermediate, setIntermediate] = useState(true)
  const folderDate = useRef(new Date())
  const folderName = sweepFolderName({ ...config, rpm }, folderDate.current, rotations)
  const directorySupported = typeof (window as PickerWindow).showDirectoryPicker === 'function'

  useEffect(() => {
    cancelButton.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); return }
      if (event.key !== 'Tab') return
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onCancel])

  const chooseDirectory = async () => {
    try {
      const selected = await (window as PickerWindow).showDirectoryPicker?.({ mode: 'readwrite' })
      if (selected) setDirectory(selected)
      setPickerError('')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPickerError('The selected folder could not be opened.')
    }
  }

  return (
    <div className="notice-backdrop">
      <div className="sweep-review" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sweep-review-title">
        <header><div><span className="eyebrow">Review batch</span><h2 id="sweep-review-title">Run acquisition sweep?</h2></div><strong className="sweep-estimate">{estimatedDuration({ ...config, rpm }, acquisitions * rotations, estimators)}</strong></header>
        <div className="sweep-review-grid">
          <section className="sweep-target-review"><TargetDiagram target={config.target} /><div><h3>Target and run</h3><dl><div><dt>Geometry</dt><dd>{config.target.name}: Ø {config.target.outerDiameterMm} mm, hub R {config.target.hubRadiusMm} mm, {config.target.apertures.length} aperture{config.target.apertures.length === 1 ? '' : 's'}</dd></div><div><dt>Speed</dt><dd><input aria-label="Sweep RPM" type="number" min="0" max="20" step="0.5" value={rpm} onChange={(event) => setRpm(Math.min(20, Math.max(0, Number(event.target.value))))} /> rpm</dd></div><div><dt>Rotations</dt><dd><input aria-label="Sweep rotations" type="number" min="1" max="20" step="1" value={rotations} onChange={(event) => setRotations(Math.min(20, Math.max(1, Math.round(Number(event.target.value)))))} /> · {rpm > 0 ? `${(rotations * 60 / rpm).toFixed(2)} s simulated` : simulatedSpan(rpm)}</dd></div><div><dt>Work</dt><dd>{acquisitions} acquisitions/rotation · {acquisitions * rotations} total · {estimators.map((value) => value === 'geometric' ? 'Geometric boundary fit' : 'Contour matching').join(' + ')}</dd></div></dl><label className="check"><input type="checkbox" checked={intermediate} onChange={(event) => setIntermediate(event.target.checked)} /> Show intermediate rotation and acquisition progress</label></div></section>
          <section><h3>Sensors</h3><div className="sweep-sensor-list">{config.sensors.map((sensor, index) => { const fov = sensorFovDeg(sensor); return <article key={sensor.instanceId}><strong>S{index + 1} · {sensor.name}</strong><span>{architectureName(sensor)} · {fov.horizontalDeg.toFixed(1)}° × {fov.verticalDeg.toFixed(1)}° FOV · {sensor.standOffM.toFixed(2)} m</span><span>{scanDetails(sensor)}</span><span>{sensor.timestampConvention.replaceAll('-', ' ')} timestamp</span></article> })}</div></section>
          <section><h3>Estimated completion</h3><p><strong>{estimatedDuration({ ...config, rpm }, acquisitions * rotations, estimators)}</strong> on this device. The conservative estimate includes generated ray count, all global-search angles and every selected estimator; actual time depends on browser and hardware.</p></section>
          <section><h3>Results destination</h3>{directorySupported ? <><p>A new folder containing CSV results, a JSON summary and the configuration will be created inside the location you choose.</p><div className="destination-row"><button type="button" onClick={chooseDirectory}>Choose parent folder</button><span>{directory ? `${directory.name}/${folderName}` : 'No folder selected'}</span></div>{pickerError && <p className="rejection">{pickerError}</p>}</> : <p>Folder access is unavailable in this browser. Continuing downloads one self-contained JSON results package named <strong>{folderName}.json</strong>.</p>}</section>
        </div>
        <footer><button ref={cancelButton} type="button" onClick={onCancel}>Cancel</button><button className="confirm-sweep" type="button" disabled={(directorySupported && !directory) || !Number.isFinite(rpm) || rpm < 0 || rpm > 20} onClick={() => onConfirm(directory, { rpm, rotations, intermediate }, folderName)}>{directorySupported ? 'Start and save sweep' : 'Start and download'}</button></footer>
      </div>
    </div>
  )
}

function TargetDiagram({ target }: { target: TargetConfig }) {
  const radius = target.outerDiameterMm / 2
  const point = (r: number, angle: number) => `${60 + r / radius * 48 * Math.cos(angle)},${60 - r / radius * 48 * Math.sin(angle)}`
  const paths = target.apertures.map((aperture) => {
    const start = (aperture.centreDeg - aperture.widthDeg / 2) * Math.PI / 180
    const end = (aperture.centreDeg + aperture.widthDeg / 2) * Math.PI / 180
    const inner = aperture.innerRadiusMm / radius * 48
    return `M${point(aperture.innerRadiusMm, start)} L${point(radius, start)} A48,48 0 0,0 ${point(radius, end)} L${point(aperture.innerRadiusMm, end)} A${inner},${inner} 0 0,1 ${point(aperture.innerRadiusMm, start)} Z`
  }).join(' ')
  return <svg className="sweep-target-diagram" viewBox="0 0 120 120" role="img" aria-label="Sweep target geometry"><defs><mask id="sweep-target-mask"><rect width="120" height="120" fill="black"/><circle cx="60" cy="60" r="48" fill="white"/><path d={paths} fill="black"/></mask></defs><circle cx="60" cy="60" r="48" fill="#65757b" mask="url(#sweep-target-mask)"/><circle cx="60" cy="60" r={target.hubRadiusMm / radius * 48} fill="#c94b43"/><circle cx="60" cy="60" r="48" fill="none" stroke="#20282a" strokeWidth="2"/></svg>
}
