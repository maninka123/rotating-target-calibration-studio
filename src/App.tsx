import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DUAL_APERTURE } from './core/presets'
import { scenarioConfiguration, type ScenarioName } from './core/scenarios'
import { parseConfiguration } from './core/config'
import type { EstimateResult, PlacedSensor, SampleFrame, SimulationConfig, SweepRecord, TargetConfig } from './core/types'
import { summariseSweepRecords, type PairwiseOffset, type SweepSummary, type SweepVisualSnapshot } from './core/sweep'
import { byId } from './sensors/library'
import { ScenePanel } from './ui/scene/ScenePanel'
import { ResultsPanel } from './ui/results/ResultsPanel'
import { SensorConfiguration } from './ui/sensors/SensorConfiguration'
import { TargetDesigner } from './ui/target/TargetDesigner'
import { LiveSensorViews } from './ui/views/LiveSensorViews'
import { RotationPanel } from './ui/rotation/RotationPanel'
import { FirstLoadNotice } from './ui/shared/FirstLoadNotice'
import { SimulationWorkerClient } from './workers/client'

const NOTICE_STORAGE_KEY = 'rotating-target-studio-notice-dismissed'

const place = (id: string): PlacedSensor => ({ ...byId(id), instanceId: crypto.randomUUID() })

const initialConfig = (): SimulationConfig => ({
  target: structuredClone(DUAL_APERTURE),
  sensors: [place('livox-avia'), place('flir-global')],
  rpm: 5,
  angleDeg: 0,
  playing: true,
  showRays: false,
  searchResolutionDeg: 1,
})

export default function App() {
  const [config, setConfig] = useState<SimulationConfig>(initialConfig)
  const [frames, setFrames] = useState<Record<string, SampleFrame>>({})
  const [estimates, setEstimates] = useState<Record<string, { frame: SampleFrame, results: EstimateResult[] }>>({})
  const [busy, setBusy] = useState(false)
  const [frameBusy, setFrameBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sweepProgress, setSweepProgress] = useState(0)
  const [sweepRecords, setSweepRecords] = useState<SweepRecord[]>([])
  const [sweepSummaries, setSweepSummaries] = useState<SweepSummary[]>([])
  const [pairwiseOffsets, setPairwiseOffsets] = useState<PairwiseOffset[]>([])
  const [noticeOpen, setNoticeOpen] = useState(() => {
    try { return localStorage.getItem(NOTICE_STORAGE_KEY) !== 'true' } catch { return true }
  })
  const worker = useMemo(() => new SimulationWorkerClient(), [])
  const sweepWorker = useMemo(() => new SimulationWorkerClient(), [])
  const aboutTrigger = useRef<HTMLAnchorElement>(null)
  const acquisition = useRef(0)
  const clockOrigin = useRef({ timeMs: performance.now(), angleDeg: 0 })
  const revision = useRef(0)
  const lastFrameKey = useRef('')
  const frameKey = JSON.stringify([config.target, config.sensors, config.rpm, config.angleDeg])

  const resetClock = useCallback((angleDeg: number) => { clockOrigin.current = { timeMs: performance.now(), angleDeg } }, [])

  useEffect(() => () => { worker.terminate(); sweepWorker.terminate() }, [worker, sweepWorker])

  useEffect(() => {
    if (!config.playing) return
    let active = true
    let pending = false
    const tick = async () => {
      if (pending || !active) return
      pending = true
      const elapsed = (performance.now() - clockOrigin.current.timeMs) / 1000
      const liveAngle = (clockOrigin.current.angleDeg + elapsed * 6 * config.rpm) % 360
      setConfig((current) => ({ ...current, angleDeg: liveAngle }))
      try {
        const replies = await Promise.all(config.sensors.map((sensor) => worker.request({
          type: 'frame', sensor, target: config.target, rpm: config.rpm,
          angleDeg: liveAngle, startS: elapsed,
          acquisitionIndex: acquisition.current,
        })))
        if (active) {
          const next: Record<string, SampleFrame> = {}
          replies.forEach((reply) => { const frame = reply.frame as SampleFrame; next[frame.sensorId] = frame })
          setFrames(next)
          acquisition.current += 1
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Frame generation failed')
      } finally { pending = false }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 500)
    return () => { active = false; window.clearInterval(timer) }
  }, [config.playing, config.rpm, config.sensors, config.target, worker])

  useEffect(() => {
    if (config.playing || lastFrameKey.current === frameKey) { setFrameBusy(false); return }
    let active = true
    setFrameBusy(true)
    void Promise.all(config.sensors.map((sensor) => worker.request({ type: 'frame', sensor, target: config.target, rpm: config.rpm, angleDeg: config.angleDeg, startS: 0, acquisitionIndex: acquisition.current }))).then((replies) => {
      if (!active) return
      const next: Record<string, SampleFrame> = {}
      for (const reply of replies) { const frame = reply.frame as SampleFrame; next[frame.sensorId] = frame }
      setFrames(next)
      lastFrameKey.current = frameKey
    }).catch((error: Error) => { if (active) setErrorMessage(error.message) }).finally(() => { if (active) setFrameBusy(false) })
    return () => { active = false }
  }, [config.playing, config.target, config.sensors, config.rpm, config.angleDeg, frameKey, worker])

  const set = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => {
    if (key !== 'showRays') { revision.current += 1; setEstimates({}); setErrorMessage('') }
    if (key === 'target' || key === 'sensors' || key === 'rpm' || key === 'angleDeg') { setFrames({}); lastFrameKey.current = '' }
    if (key === 'playing' && value === false && config.sensors.every((sensor) => frames[sensor.instanceId])) lastFrameKey.current = frameKey
    setConfig((current) => {
    if (key === 'rpm' || key === 'playing' || key === 'angleDeg') resetClock(key === 'angleDeg' ? Number(value) : current.angleDeg)
    return { ...current, [key]: value }
    })
  }

  const runEstimate = useCallback(async (estimators: ('contour' | 'geometric')[]) => {
    setBusy(true)
    setEstimates({})
    const requestedRevision = revision.current
    try {
      if (config.sensors.some((sensor) => !frames[sensor.instanceId])) throw new Error('Wait for the sensor frames to finish loading')
      const replies = await Promise.all(config.sensors.map((sensor) => worker.request({
        type: 'estimate', frame: frames[sensor.instanceId], target: config.target, rpm: config.rpm,
        estimators,
        searchResolutionDeg: config.searchResolutionDeg,
      })))
      const next: Record<string, { frame: SampleFrame, results: EstimateResult[] }> = {}
      replies.forEach((reply) => {
        const frame = reply.frame as SampleFrame
        next[frame.sensorId] = { frame, results: reply.results as EstimateResult[] }
      })
      if (requestedRevision === revision.current) setEstimates(next)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Estimation failed')
    } finally { setBusy(false) }
  }, [config, frames, worker])

  const runSweepMode = useCallback(async (count: number, estimators: ('contour' | 'geometric')[], options: { rpm: number, rotations: number, intermediate: boolean, configuration: SimulationConfig, onIntermediate?: (records: SweepRecord[], visuals: SweepVisualSnapshot[]) => void }) => {
    setBusy(true)
    setSweepRecords([]); setSweepSummaries([]); setPairwiseOffsets([])
    setSweepProgress(0.001)
    try {
      const run = options.configuration
      const partialRecords: SweepRecord[] = []
      const reply = await sweepWorker.request({ type: 'sweep', sensors: run.sensors, target: run.target, rpm: options.rpm, angleDeg: run.angleDeg, rotations: options.rotations, acquisitions: count, estimators, searchResolutionDeg: run.searchResolutionDeg, includeVisuals: options.intermediate }, (fraction, checkpoint, visuals) => {
        setSweepProgress(fraction)
        if (!checkpoint.length) return
        partialRecords.push(...checkpoint)
        options.onIntermediate?.(checkpoint, visuals)
        if (fraction >= 1 / 3) {
          const partial = summariseSweepRecords(partialRecords, run.sensors, estimators, options.rpm)
          setSweepRecords([...partialRecords])
          setSweepSummaries(partial.summaries)
          setPairwiseOffsets(partial.pairwiseOffsets)
        }
      })
      const records = reply.records as SweepRecord[]
      const summaries = reply.summaries as SweepSummary[]
      const offsets = reply.pairwiseOffsets as PairwiseOffset[]
      setSweepRecords(records)
      setSweepSummaries(summaries)
      setPairwiseOffsets(offsets)
      setSweepProgress(1)
      return { records, summaries, pairwiseOffsets: offsets }
    } finally { setBusy(false); setSweepProgress(0) }
  }, [sweepWorker])

  const applyScenario = (name: ScenarioName) => {
    revision.current += 1
    lastFrameKey.current = ''
    const next = scenarioConfiguration(name)
    resetClock(next.angleDeg)
    setConfig(next)
    setFrames({})
    setEstimates({})
    setSweepRecords([])
    setSweepSummaries([])
    setPairwiseOffsets([])
  }

  const importConfig = (incoming: SimulationConfig) => {
    if (!incoming.target || !Array.isArray(incoming.sensors) || incoming.sensors.length < 1 || incoming.sensors.length > 3) throw new Error('Invalid configuration')
    const next = parseConfiguration(JSON.stringify(incoming))
    revision.current += 1
    lastFrameKey.current = ''
    setFrames({}); setEstimates({}); setSweepRecords([]); setSweepSummaries([]); setPairwiseOffsets([])
    resetClock(next.angleDeg)
    setConfig(next)
  }

  const closeNotice = useCallback(() => {
    try { localStorage.setItem(NOTICE_STORAGE_KEY, 'true') } catch { /* storage may be unavailable */ }
    setNoticeOpen(false)
    requestAnimationFrame(() => aboutTrigger.current?.focus())
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" /><div><span className="eyebrow">Temporal calibration laboratory</span><h1>Rotating Target Calibration Studio</h1></div></div>
        <div className="header-actions">
          <span className="work-marker">Work in progress</span>
          <a ref={aboutTrigger} className="header-about" href="#about-this-tool" onClick={(event) => { event.preventDefault(); setNoticeOpen(true) }}>About this tool</a>
          <button
            className={`header-play ${config.playing ? 'is-playing' : 'is-paused'}`}
            type="button"
            aria-pressed={config.playing}
            onClick={() => set('playing', !config.playing)}
          >
            <span aria-hidden="true">{config.playing ? 'Ⅱ' : '▶'}</span>
            {config.playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </header>
      <nav className="scenario-bar" aria-label="Preset scenarios">
        <span>Scenarios</span>
        <button onClick={() => applyScenario('Sparse ring failure')}>Sparse ring failure</button>
        <button onClick={() => applyScenario('Dense camera')}>Dense camera</button>
        <button onClick={() => applyScenario('Aperture ablation')}>Aperture ablation</button>
        <button onClick={() => applyScenario('Rolling shutter at rate')}>Rolling shutter at rate</button>
        <button onClick={() => applyScenario('LiDAR–camera offset')}>LiDAR–camera offset</button>
        <button onClick={() => applyScenario('Resolution threshold')}>Resolution threshold</button>
      </nav>
      <main className="panel-grid">
        <TargetDesigner target={config.target} onChange={(target: TargetConfig) => set('target', target)} />
        <SensorConfiguration target={config.target} sensors={config.sensors} onChange={(sensors) => set('sensors', sensors)} />
        <ScenePanel target={config.target} sensors={config.sensors} rpm={config.rpm} angleDeg={config.angleDeg} playing={config.playing} showRays={config.showRays} onRpm={(rpm) => set('rpm', rpm)} onAngle={(angle) => set('angleDeg', angle)} onPlaying={(playing) => set('playing', playing)} onShowRays={(show) => set('showRays', show)} />
        <RotationPanel target={config.target} angleDeg={config.angleDeg} playing={config.playing} rpm={config.rpm} />
        <LiveSensorViews sensors={config.sensors} frames={frames} target={config.target} playing={config.playing} />
        {errorMessage && <div role="alert" className="rejection">{errorMessage}</div>}
        <ResultsPanel playing={config.playing} frameBusy={frameBusy || config.sensors.some((sensor) => !frames[sensor.instanceId])} sensors={config.sensors} config={config} estimates={estimates} onEstimate={runEstimate} busy={busy} sweepProgress={sweepProgress} sweepRecords={sweepRecords} sweepSummaries={sweepSummaries} pairwiseOffsets={pairwiseOffsets} onSweep={runSweepMode} onCancelSweep={() => sweepWorker.terminate()} onImport={importConfig} onSearchResolution={(value) => set('searchResolutionDeg', value)} />
      </main>
      <footer>All calculations run locally. No telemetry, backend, ROS runtime, or external service is used.</footer>
      <FirstLoadNotice open={noticeOpen} onClose={closeNotice} />
    </div>
  )
}
