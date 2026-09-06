import { useEffect, useRef, useState } from 'react'
import { generatedRayCount } from '../../core/sampling'
import type { PlacedSensor, SimulationConfig } from '../../core/types'

interface PickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

interface Props {
  config: SimulationConfig
  acquisitions: number
  estimators: ('contour' | 'geometric')[]
  folderName: string
  onCancel: () => void
  onConfirm: (directory: FileSystemDirectoryHandle | null) => void
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
  const estimatorFactor = (estimators.includes('geometric') ? 1 : 0) + (estimators.includes('contour') ? 0.3 : 0)
  const seconds = Math.max(1, acquisitions * rays * estimatorFactor / 1_200_000)
  if (seconds < 60) return `about ${Math.ceil(seconds)} seconds`
  return `about ${Math.ceil(seconds / 60)} minutes`
}

const simulatedSpan = (rpm: number): string => rpm > 0 ? `${(60 / rpm).toFixed(2)} s simulated` : 'static target'

export function SweepReviewDialog({ config, acquisitions, estimators, folderName, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [pickerError, setPickerError] = useState('')
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
        <header><div><span className="eyebrow">Review batch</span><h2 id="sweep-review-title">Run acquisition sweep?</h2></div><strong className="sweep-estimate">{estimatedDuration(config, acquisitions, estimators)}</strong></header>
        <div className="sweep-review-grid">
          <section><h3>Target and run</h3><dl><div><dt>Geometry</dt><dd>{config.target.name}: Ø {config.target.outerDiameterMm} mm, hub R {config.target.hubRadiusMm} mm, {config.target.apertures.length} aperture{config.target.apertures.length === 1 ? '' : 's'}</dd></div><div><dt>Speed</dt><dd>{config.rpm.toFixed(1)} rpm · one complete revolution · {simulatedSpan(config.rpm)}</dd></div><div><dt>Work</dt><dd>{acquisitions} acquisitions · {estimators.map((value) => value === 'geometric' ? 'Geometric boundary fit' : 'Contour matching').join(' + ')}</dd></div></dl></section>
          <section><h3>Sensors</h3><div className="sweep-sensor-list">{config.sensors.map((sensor, index) => <article key={sensor.instanceId}><strong>S{index + 1} · {sensor.name}</strong><span>{architectureName(sensor)} · {sensor.horizontalFovDeg}° × {sensor.verticalFovDeg}° FOV · {sensor.standOffM.toFixed(2)} m</span><span>{scanDetails(sensor)}</span><span>{sensor.timestampConvention.replaceAll('-', ' ')} timestamp</span></article>)}</div></section>
          <section><h3>Estimated completion</h3><p><strong>{estimatedDuration(config, acquisitions, estimators)}</strong> on this device. The estimate is based on generated ray count and selected estimators; actual time depends on browser and hardware.</p></section>
          <section><h3>Results destination</h3>{directorySupported ? <><p>A new folder containing CSV results, a JSON summary and the configuration will be created inside the location you choose.</p><div className="destination-row"><button type="button" onClick={chooseDirectory}>Choose parent folder</button><span>{directory ? `${directory.name}/${folderName}` : 'No folder selected'}</span></div>{pickerError && <p className="rejection">{pickerError}</p>}</> : <p>Folder access is unavailable in this browser. Continuing downloads one self-contained JSON results package named <strong>{folderName}.json</strong>.</p>}</section>
        </div>
        <footer><button ref={cancelButton} type="button" onClick={onCancel}>Cancel</button><button className="confirm-sweep" type="button" disabled={directorySupported && !directory} onClick={() => onConfirm(directory)}>{directorySupported ? 'Start and save sweep' : 'Start and download'}</button></footer>
      </div>
    </div>
  )
}
