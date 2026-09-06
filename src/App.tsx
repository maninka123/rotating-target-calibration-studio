import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DUAL_APERTURE } from './core/presets'
import { scenarioConfiguration, type ScenarioName } from './core/scenarios'
import { parseConfiguration } from './core/config'
import type { EstimateResult, PlacedSensor, SampleFrame, SimulationConfig, SweepRecord, TargetConfig } from './core/types'
import type { SweepSummary } from './core/sweep'
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
  const [sweepProgress, setSweepProgress] = useState(0)
  const [sweepRecords, setSweepRecords] = useState<SweepRecord[]>([])
  const [sweepSummaries, setSweepSummaries] = useState<SweepSummary[]>([])
  const [noticeOpen, setNoticeOpen] = useState(() => {
    try { return localStorage.getItem(NOTICE_STORAGE_KEY) !== 'true' } catch { return true }
  })
  const worker = useMemo(() => new SimulationWorkerClient(), [])
  const aboutTrigger = useRef<HTMLAnchorElement>(null)
  const acquisition = useRef(0)
  const startTime = useRef(performance.now())

  useEffect(() => () => worker.terminate(), [worker])

  useEffect(() => {
    if (!config.playing) return
    let active = true
    let pending = false
    const tick = async () => {
      if (pending || !active) return
      pending = true
      const elapsed = (performance.now() - startTime.current) / 1000
      setConfig((current) => ({ ...current, angleDeg: (elapsed * 6 * current.rpm) % 360 }))
      try {
        const replies = await Promise.all(config.sensors.map((sensor) => worker.request({
          type: 'frame', sensor, target: config.target, rpm: config.rpm,
          angleDeg: (elapsed * 6 * config.rpm) % 360, startS: elapsed,
          acquisitionIndex: acquisition.current,
        })))
        if (active) {
          const next: Record<string, SampleFrame> = {}
          replies.forEach((reply) => { const frame = reply.frame as SampleFrame; next[frame.sensorId] = frame })
          setFrames(next)
          acquisition.current += 1
        }
      } catch (error) {
        if (active) console.error(error)
      } finally { pending = false }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 500)
    return () => { active = false; window.clearInterval(timer) }
  }, [config.playing, config.rpm, config.sensors, config.target, worker])

  const set = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => setConfig((current) => ({ ...current, [key]: value }))

  const runEstimate = useCallback(async (estimators: ('contour' | 'geometric')[]) => {
    setBusy(true)
    setEstimates({})
    try {
      const replies = await Promise.all(config.sensors.map((sensor) => worker.request({
        type: 'estimate', sensor, target: config.target, rpm: config.rpm,
        angleDeg: config.angleDeg, startS: 0, acquisitionIndex: acquisition.current,
        estimators,
        searchResolutionDeg: config.searchResolutionDeg,
      })))
      const next: Record<string, { frame: SampleFrame, results: EstimateResult[] }> = {}
      replies.forEach((reply) => {
        const frame = reply.frame as SampleFrame
        next[frame.sensorId] = { frame, results: reply.results as EstimateResult[] }
      })
      setEstimates(next)
    } finally { setBusy(false) }
  }, [config, worker])

  const runSweepMode = useCallback(async (count: number, estimators: ('contour' | 'geometric')[]) => {
    setBusy(true)
    setSweepProgress(0.001)
    try {
      const reply = await worker.request({ type: 'sweep', sensors: config.sensors, target: config.target, rpm: config.rpm, acquisitions: count, estimators, searchResolutionDeg: config.searchResolutionDeg }, setSweepProgress)
      setSweepRecords(reply.records as SweepRecord[])
      setSweepSummaries(reply.summaries as SweepSummary[])
      setSweepProgress(1)
    } finally { setBusy(false) }
  }, [config, worker])

  const applyScenario = (name: ScenarioName) => {
    setConfig(scenarioConfiguration(name))
    setFrames({})
    setEstimates({})
    setSweepRecords([])
    setSweepSummaries([])
  }

  const importConfig = (incoming: SimulationConfig) => {
    if (!incoming.target || !Array.isArray(incoming.sensors) || incoming.sensors.length < 1 || incoming.sensors.length > 3) throw new Error('Invalid configuration')
    setConfig(parseConfiguration(JSON.stringify(incoming)))
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
        <LiveSensorViews sensors={config.sensors} frames={frames} target={config.target} />
        <ResultsPanel playing={config.playing} sensors={config.sensors} config={config} estimates={estimates} onEstimate={runEstimate} busy={busy} sweepProgress={sweepProgress} sweepRecords={sweepRecords} sweepSummaries={sweepSummaries} onSweep={runSweepMode} onImport={importConfig} onSearchResolution={(value) => set('searchResolutionDeg', value)} />
      </main>
      <footer>All calculations run locally. No telemetry, backend, ROS runtime, or external service is used.</footer>
      <FirstLoadNotice open={noticeOpen} onClose={closeNotice} />
    </div>
  )
}
