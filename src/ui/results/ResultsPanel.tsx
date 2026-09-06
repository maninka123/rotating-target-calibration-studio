import { useEffect, useRef, useState } from 'react'
import type { EstimateResult, PlacedSensor, SampleFrame, SimulationConfig, SweepRecord } from '../../core/types'
import type { SweepSummary } from '../../core/sweep'
import { Panel } from '../shared/Panel'
import { drawCost, drawSamples } from '../shared/plots'
import { parseConfiguration, serialiseConfiguration } from '../../core/config'
import { SweepReviewDialog } from './SweepReviewDialog'
import { downloadSweepPackage, saveSweepFolder, sweepFolderName, sweepRecordsCsv } from './sweepFiles'

interface Props {
  playing: boolean
  sensors: PlacedSensor[]
  config: SimulationConfig
  estimates: Record<string, { frame: SampleFrame, results: EstimateResult[] }>
  onEstimate: (estimators: ('contour' | 'geometric')[]) => void
  busy: boolean
  sweepProgress: number
  sweepRecords: SweepRecord[]
  sweepSummaries: SweepSummary[]
  onSweep: (count: number, estimators: ('contour' | 'geometric')[]) => Promise<{ records: SweepRecord[], summaries: SweepSummary[] }>
  onImport: (config: SimulationConfig) => void
  onSearchResolution: (value: number) => void
}

export function ResultsPanel(props: Props) {
  const [contour, setContour] = useState(true)
  const [geometric, setGeometric] = useState(true)
  const [count, setCount] = useState(300)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [pendingFolder, setPendingFolder] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const sweepTrigger = useRef<HTMLButtonElement>(null)
  const selected = (): ('contour' | 'geometric')[] => [...(contour ? ['contour' as const] : []), ...(geometric ? ['geometric' as const] : [])]
  const closeReview = () => { setReviewOpen(false); requestAnimationFrame(() => sweepTrigger.current?.focus()) }
  const openReview = () => { setPendingFolder(sweepFolderName(props.config)); setSaveStatus(''); setReviewOpen(true) }
  const confirmSweep = async (directory: FileSystemDirectoryHandle | null) => {
    setReviewOpen(false)
    try {
      const result = await props.onSweep(count, selected())
      if (directory) {
        await saveSweepFolder(directory, pendingFolder, props.config, result.records, result.summaries)
        setSaveStatus(`Saved to ${directory.name}/${pendingFolder}`)
      } else {
        downloadSweepPackage(pendingFolder, props.config, result.records, result.summaries)
        setSaveStatus(`Downloaded ${pendingFolder}.json`)
      }
    } catch (error) {
      setSaveStatus(`Sweep output was not saved: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return (
    <Panel number={6} title="Estimation and results" className="results-panel">
      {props.playing && <div className="paused-notice">Pause rotation to freeze a frame and enable estimation.</div>}
      <div className="estimator-toolbar">
        <label className="check"><input type="checkbox" checked={contour} onChange={(event) => setContour(event.target.checked)} /> Contour matching</label>
        <label className="check"><input type="checkbox" checked={geometric} onChange={(event) => setGeometric(event.target.checked)} /> Geometric boundary fit</label>
        <button data-testid="run-estimators" disabled={props.playing || props.busy || selected().length === 0} onClick={() => props.onEstimate(selected())}>{props.busy ? 'Working…' : 'Run on frozen frame'}</button>
        <label className="search-field"><span>Search step</span><span className="input-unit"><input aria-label="Angular search resolution" type="number" min="0.05" max="10" step="0.05" value={props.config.searchResolutionDeg} onChange={(event) => props.onSearchResolution(Number(event.target.value))} /><small>°</small></span></label>
      </div>
      <div className="comparison-grid" data-testid="estimator-results">
        {props.sensors.map((sensor) => {
          const estimate = props.estimates[sensor.instanceId]
          return estimate ? <EstimateGroup key={sensor.instanceId} sensor={sensor} frame={estimate.frame} results={estimate.results} config={props.config} /> : null
        })}
        {!Object.keys(props.estimates).length && <div className="empty-state">No frozen-frame result yet.</div>}
      </div>
      <div className="sweep-block">
        <div className="subhead"><span>Sweep mode</span><small>Runs in a Web Worker without rendering frames</small></div>
        <p className="sweep-explanation">Repeats acquisitions across a full target revolution, then reports angle-error statistics, rejected frames, error plots and cross-sensor timing offsets.</p>
        <div className="sweep-controls"><label>Acquisitions <input type="number" min="10" max="2000" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label><button ref={sweepTrigger} disabled={props.busy || selected().length === 0} onClick={openReview}>Run sweep</button></div>
        {props.sweepProgress > 0 && props.sweepProgress < 1 && <SweepProgress fraction={props.sweepProgress} total={count} />}
        {saveStatus && <p className="sweep-save-status" role="status">{saveStatus}</p>}
        {props.sweepSummaries.length > 0 && <SweepResults summaries={props.sweepSummaries} records={props.sweepRecords} />}
      </div>
      <ExportBar config={props.config} records={props.sweepRecords} onImport={props.onImport} />
      {reviewOpen && <SweepReviewDialog config={props.config} acquisitions={count} estimators={selected()} folderName={pendingFolder} onCancel={closeReview} onConfirm={confirmSweep} />}
    </Panel>
  )
}

function SweepProgress({ fraction, total }: { fraction: number, total: number }) {
  const completed = Math.min(total, Math.floor(total * fraction))
  const percentage = Math.round(fraction * 100)
  return (
    <div className="sweep-progress-status" role="status" aria-label={`Sweep ${percentage}% complete`}>
      <svg className="sweep-wheel" viewBox="0 0 44 44" aria-hidden="true" style={{ transform: `rotate(${fraction * 360}deg)` }}>
        <circle cx="22" cy="22" r="18" />
        <circle className="sweep-wheel-hub" cx="22" cy="22" r="5" />
        <path d="M22 4v13M40 22H27M22 40V27" />
      </svg>
      <div className="sweep-progress-copy"><strong>Running sweep</strong><span>{percentage}% · {completed} of {total} acquisitions</span></div>
      <div className="progress"><span style={{ width: `${fraction * 100}%` }} /></div>
    </div>
  )
}

function EstimateGroup({ sensor, frame, results, config }: { sensor: PlacedSensor, frame: SampleFrame, results: EstimateResult[], config: SimulationConfig }) {
  const plot = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (plot.current) drawSamples(plot.current, frame, config.target, results)
  }, [frame, results, config.target])
  const exportPng = () => {
    const link = document.createElement('a')
    link.download = `${sensor.name}-estimate.png`.replaceAll(' ', '-')
    link.href = plot.current?.toDataURL('image/png') ?? ''
    link.click()
  }
  return (
    <article className="estimate-card">
      <header><div><strong>{sensor.name}</strong><small>Actual and recovered target templates</small></div></header>
      <div className="estimate-table"><table><thead><tr><th>Estimator</th><th>Status</th><th>Recovered</th><th>True</th><th>Angle error</th><th>Time equivalent</th><th>Uncertainty</th></tr></thead><tbody>{results.map((result) => <tr key={result.estimator}><td>{result.estimator === 'geometric' ? 'Geometric boundary fit' : 'Contour matching'}</td><td><span className={result.accepted ? 'status accepted' : 'status rejected'}>{result.accepted ? 'Accepted' : 'Rejected'}</span></td>{result.accepted ? <><td>{result.angleDeg?.toFixed(3)}°</td><td>{result.trueAngleDeg.toFixed(3)}°</td><td><strong>{result.signedErrorDeg?.toFixed(3)}°</strong></td><td>{result.timingErrorS === null ? 'undefined at 0 rpm' : `${((result.timingErrorS ?? 0) * 1000).toFixed(2)} ms`}</td><td>{result.estimator === 'geometric' ? `${result.uncertaintyDeg?.toExponential(2)}°` : '—'}</td></> : <td colSpan={5} className="rejection-cell">{result.reason}</td>}</tr>)}</tbody></table></div>
      <canvas className="estimate-plot" ref={plot} />
      <div className="cost-grid">{results.filter((result) => result.costs).map((result) => <CostPlot key={result.estimator} result={result} />)}</div>
      {results.some((result) => result.estimator === 'geometric') && <p className="method-note">Curvature uncertainty approaches numerical zero for dense regular sampling and is not meaningful in that regime.</p>}
      <button className="text-button" onClick={exportPng}>Export this figure as PNG</button>
    </article>
  )
}

function CostPlot({ result }: { result: EstimateResult }) {
  const cost = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (cost.current) drawCost(cost.current, result) }, [result])
  return <div><small className="plot-label">{result.estimator === 'geometric' ? 'Geometric' : 'Contour'} cost over orientation</small><canvas className="cost-plot" ref={cost} /></div>
}

function SweepResults({ summaries, records }: { summaries: SweepSummary[], records: SweepRecord[] }) {
  return (
    <>
      <div className="table-wrap"><table><thead><tr><th>Sensor</th><th>Estimator</th><th>MAE</th><th>Median</th><th>SD</th><th>P95</th><th>Rejected</th><th>Relative offset</th></tr></thead><tbody>{summaries.map((row) => <tr key={`${row.sensor}-${row.estimator}`}><td>{row.sensor.slice(0, 8)}</td><td>{row.estimator}</td><td>{row.maeDeg?.toFixed(3) ?? '—'}°</td><td>{row.medianAbsDeg?.toFixed(3) ?? '—'}°</td><td>{row.sdDeg?.toFixed(3) ?? '—'}°</td><td>{row.p95Deg?.toFixed(3) ?? '—'}°</td><td>{(row.rejectionRate * 100).toFixed(1)}%</td><td>{row.recoveredOffsetMs?.toFixed(1) ?? '—'} ms</td></tr>)}</tbody></table></div>
      <SweepPlot records={records} />
    </>
  )
}

function SweepPlot({ records }: { records: SweepRecord[] }) {
  const accepted = records.filter((row) => row.accepted && row.errorDeg !== null)
  if (!accepted.length) return <div className="rejection">All acquisitions rejected.</div>
  const max = Math.max(1, ...accepted.map((row) => Math.abs(row.errorDeg ?? 0)))
  return <svg className="sweep-plot" viewBox="0 0 700 190" role="img" aria-label="Signed error against true angle"><line x1="35" y1="95" x2="690" y2="95" stroke="#879598" strokeWidth="1.5"/><line x1="35" y1="10" x2="35" y2="180" stroke="#879598" strokeWidth="1.5"/>{accepted.map((row, index) => { const gross = row.estimator === 'contour' && Math.abs(row.errorDeg ?? 0) > 90; return <circle data-gross-error={gross || undefined} key={index} cx={35 + row.trueAngleDeg / 360 * 655} cy={95 - (row.errorDeg ?? 0) / max * 75} r={gross ? 5 : 3} fill={gross ? '#b84f45' : '#176b75'} opacity={gross ? 1 : .72}/> })}<text x="350" y="188" textAnchor="middle">True angle (°)</text><text x="8" y="100" transform="rotate(-90 8 100)" textAnchor="middle">Signed error (°)</text></svg>
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function ExportBar({ config, records, onImport }: { config: SimulationConfig, records: SweepRecord[], onImport: (config: SimulationConfig) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const exportCsv = () => {
    download('rotating-target-sweep.csv', sweepRecordsCsv(records), 'text/csv')
  }
  return (
    <div className="export-bar">
      <button disabled={!records.length} onClick={exportCsv}>Export sweep CSV</button>
      <button onClick={() => download('rotating-target-configuration.json', serialiseConfiguration(config), 'application/json')}>Export configuration JSON</button>
      <button onClick={() => input.current?.click()}>Import configuration</button>
      <input ref={input} hidden type="file" accept="application/json" onChange={async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        try { onImport(parseConfiguration(await file.text())) } catch { alert('Configuration JSON is invalid.') }
      }} />
    </div>
  )
}
