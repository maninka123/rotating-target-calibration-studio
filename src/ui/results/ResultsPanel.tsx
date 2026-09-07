import { useCallback, useEffect, useRef, useState } from 'react'
import type { EstimateResult, PlacedSensor, SampleFrame, SimulationConfig, SweepRecord } from '../../core/types'
import { completedSweepAcquisitions, hasRepresentativePartialSweep, summariseSweepRecords, type PairwiseOffset, type SweepSummary, type SweepVisualSnapshot } from '../../core/sweep'
import { Panel } from '../shared/Panel'
import { NumberField } from '../shared/NumberField'
import { drawCost, drawSamples } from '../shared/plots'
import { parseConfiguration, serialiseConfiguration } from '../../core/config'
import { SweepReviewDialog } from './SweepReviewDialog'
import { downloadSweepPackage, saveSweepCheckpoint, saveSweepFolder, sweepRecordsCsv, type SweepOutputDetails } from './sweepFiles'

interface Props {
  playing: boolean
  frameBusy: boolean
  sensors: PlacedSensor[]
  config: SimulationConfig
  estimates: Record<string, { frame: SampleFrame, results: EstimateResult[] }>
  onEstimate: (estimators: ('contour' | 'geometric')[]) => void
  busy: boolean
  sweepProgress: number
  sweepRecords: SweepRecord[]
  sweepSummaries: SweepSummary[]
  pairwiseOffsets: PairwiseOffset[]
  onSweep: (count: number, estimators: ('contour' | 'geometric')[], options: { rpm: number, rotations: number, intermediate: boolean, configuration: SimulationConfig, onIntermediate?: (records: SweepRecord[], visuals: SweepVisualSnapshot[]) => void }) => Promise<{ records: SweepRecord[], summaries: SweepSummary[], pairwiseOffsets: PairwiseOffset[] }>
  onCancelSweep: () => void
  onImport: (config: SimulationConfig) => void
  onSearchResolution: (value: number) => void
}

export function ResultsPanel(props: Props) {
  const [contour, setContour] = useState(true)
  const [geometric, setGeometric] = useState(true)
  const [count, setCount] = useState(300)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [saveStatusTone, setSaveStatusTone] = useState<'normal' | 'warning'>('normal')
  const [runActive, setRunActive] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [activeSweep, setActiveSweep] = useState({ rpm: props.config.rpm, rotations: 1, intermediate: true, total: count })
  const [resultSensors, setResultSensors] = useState<PlacedSensor[]>([])
  const [reviewConfig, setReviewConfig] = useState<SimulationConfig | null>(null)
  const sweepTrigger = useRef<HTMLButtonElement>(null)
  const stopRequested = useRef(false)
  const selected = (): ('contour' | 'geometric')[] => [...(contour ? ['contour' as const] : []), ...(geometric ? ['geometric' as const] : [])]
  const closeReview = useCallback(() => { setReviewOpen(false); requestAnimationFrame(() => sweepTrigger.current?.focus()) }, [])
  const openReview = () => { setSaveStatus(''); setSaveStatusTone('normal'); setReviewConfig(structuredClone(props.config)); setReviewOpen(true) }
  const confirmSweep = async (directory: FileSystemDirectoryHandle | null, options: { rpm: number, rotations: number, intermediate: boolean }, folderName: string) => {
    setRunActive(true)
    setStopping(false)
    stopRequested.current = false
    setReviewOpen(false)
    const total = count * options.rotations
    setActiveSweep({ ...options, total })
    const runConfig = { ...(reviewConfig ?? props.config), rpm: options.rpm, playing: false }
    const checkpoints: SweepRecord[][] = []
    const estimators = selected()
    const details: SweepOutputDetails = { pairwiseOffsets: [], run: { rpm: options.rpm, rotations: options.rotations, acquisitionsPerRotation: count, estimators, searchResolutionDeg: runConfig.searchResolutionDeg, initialAngleDeg: runConfig.angleDeg, saveIntermediate: options.intermediate } }
    let pendingWrites = Promise.resolve()
    let checkpointError = ''
    try {
      if (directory) await saveSweepFolder(directory, folderName, runConfig, [], [], details)
      setResultSensors(structuredClone(runConfig.sensors))
      const result = await props.onSweep(total, estimators, { ...options, configuration: runConfig, onIntermediate: (records, visuals) => {
        checkpoints.push(records)
        const index = checkpoints.length
        if (directory && options.intermediate) pendingWrites = pendingWrites.then(() => saveSweepCheckpoint(directory, folderName, index, records, visuals, runConfig)).catch((error: Error) => { checkpointError = error.message })
      } })
      details.pairwiseOffsets = result.pairwiseOffsets
      await pendingWrites
      if (directory) {
        await saveSweepFolder(directory, folderName, runConfig, result.records, result.summaries, details)
        setSaveStatusTone('normal')
        setSaveStatus(`Saved to ${directory.name}/${folderName}${checkpointError ? ` · checkpoint write failed: ${checkpointError}` : ''}`)
      } else {
        downloadSweepPackage(folderName, runConfig, result.records, result.summaries, { ...details, checkpoints })
        setSaveStatusTone('normal')
        setSaveStatus(`Downloaded ${folderName}.json`)
      }
    } catch (error) {
      await pendingWrites
      const records = checkpoints.flat()
      const completed = completedSweepAcquisitions(records)
      if (stopRequested.current && hasRepresentativePartialSweep(records, total)) {
        const partial = summariseSweepRecords(records, runConfig.sensors, estimators, options.rpm)
        details.pairwiseOffsets = partial.pairwiseOffsets
        if (directory) await saveSweepFolder(directory, folderName, runConfig, records, partial.summaries, details)
        else downloadSweepPackage(`${folderName}_partial`, runConfig, records, partial.summaries, { ...details, checkpoints })
        setSaveStatusTone('normal')
        setSaveStatus(`Sweep stopped after ${(completed / count).toFixed(2)} of ${options.rotations} rotations. Partial results from ${completed} acquisitions are shown and ${directory ? `saved to ${directory.name}/${folderName}` : 'downloaded'}.${checkpointError ? ` Checkpoint error: ${checkpointError}` : ''}`)
      } else if (stopRequested.current) {
        setSaveStatusTone('warning')
        setSaveStatus(`Sweep stopped before one-third of the requested rotations was completed (${completed} of ${total} acquisitions). There is not enough angular coverage to show a representative result; run the sweep again when ready.${checkpointError ? ` Checkpoint error: ${checkpointError}` : ''}`)
      } else {
        setSaveStatusTone('warning')
        setSaveStatus(`Sweep could not finish: ${error instanceof Error ? error.message : String(error)}.${checkpointError ? ` Checkpoint error: ${checkpointError}` : ''}`)
      }
    } finally { setRunActive(false); setStopping(false) }
  }
  const stopSweep = () => {
    stopRequested.current = true
    setStopping(true)
    props.onCancelSweep()
  }
  return (
    <Panel number={6} title="Estimation and results" className="results-panel">
      {props.playing && <div className="paused-notice">Pause rotation to freeze a frame and enable estimation.</div>}
      {!props.playing && props.frameBusy && <div role="status">Refreshing sensor frames…</div>}
      <div className="estimator-toolbar">
        <label className="check"><input type="checkbox" checked={contour} onChange={(event) => setContour(event.target.checked)} /> Contour matching</label>
        <label className="check"><input type="checkbox" checked={geometric} onChange={(event) => setGeometric(event.target.checked)} /> Geometric boundary fit</label>
        <button data-testid="run-estimators" disabled={props.playing || props.frameBusy || props.busy || runActive || selected().length === 0} onClick={() => props.onEstimate(selected())}>{props.busy ? 'Working…' : 'Run on frozen frame'}</button>
        <NumberField label="Angular search resolution" value={props.config.searchResolutionDeg} min={0.05} max={10} step={0.05} unit="°" onChange={props.onSearchResolution} />
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
        <div className="sweep-controls"><NumberField label="Acquisitions" value={count} min={10} max={2000} integer onChange={setCount} /><button ref={sweepTrigger} disabled={props.busy || runActive || selected().length === 0} onClick={openReview}>Run sweep</button></div>
        {props.sweepProgress > 0 && props.sweepProgress < 1 && <SweepProgress fraction={props.sweepProgress} total={activeSweep.total} rpm={activeSweep.rpm} rotations={activeSweep.rotations} detailed={activeSweep.intermediate} stopping={stopping} onStop={stopSweep} />}
        {saveStatus && <p className={`sweep-save-status${saveStatusTone === 'warning' ? ' is-warning' : ''}`} role="status">{saveStatus}</p>}
        {props.sweepSummaries.length > 0 && <SweepResults summaries={props.sweepSummaries} offsets={props.pairwiseOffsets} records={props.sweepRecords} sensors={resultSensors.length ? resultSensors : props.sensors} />}
      </div>
      <ExportBar config={props.config} records={props.sweepRecords} onImport={props.onImport} />
      {reviewOpen && <SweepReviewDialog config={reviewConfig ?? props.config} acquisitions={count} estimators={selected()} onCancel={closeReview} onConfirm={confirmSweep} />}
    </Panel>
  )
}

function SweepProgress({ fraction, total, rpm, rotations, detailed, stopping, onStop }: { fraction: number, total: number, rpm: number, rotations: number, detailed: boolean, stopping: boolean, onStop: () => void }) {
  const completed = Math.min(total, Math.floor(total * fraction))
  const percentage = Math.round(fraction * 100)
  return (
    <div className="sweep-progress-status" role="status" aria-label={`Sweep ${percentage}% complete`}>
      <svg className="sweep-wheel" viewBox="0 0 44 44" aria-hidden="true" style={{ transform: `rotate(${rpm > 0 ? fraction * rotations * 360 : 0}deg)` }}>
        <circle cx="22" cy="22" r="18" />
        <circle className="sweep-wheel-hub" cx="22" cy="22" r="5" />
        <path d="M22 4v13M40 22H27M22 40V27" />
      </svg>
      <div className="sweep-progress-copy"><strong>Running sweep</strong><span>{percentage}% · {completed} of {total} acquisitions{detailed ? ` · rotation ${(fraction * rotations).toFixed(2)} / ${rotations} · ${rpm.toFixed(1)} rpm` : ''}</span></div>
      <div className="progress"><span style={{ width: `${fraction * 100}%` }} /></div>
      <button className="stop-sweep" type="button" disabled={stopping} onClick={onStop}>{stopping ? 'Stopping…' : 'Stop sweep'}</button>
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
      <header><div><strong>{sensor.name}</strong><small>Truth and recovered target templates</small></div></header>
      <div className="estimate-table"><table><thead><tr><th>Estimator</th><th>Status</th><th>Recovered</th><th>True</th><th>Angle error</th><th>Time equivalent</th><th>Local curvature proxy</th></tr></thead><tbody>{results.map((result) => <tr key={result.estimator}><td>{result.estimator === 'geometric' ? 'Geometric boundary fit' : 'Contour matching'}</td><td><span className={result.accepted ? 'status accepted' : 'status rejected'}>{result.accepted ? 'Accepted' : 'Rejected'}</span></td>{result.accepted ? <><td>{result.angleDeg?.toFixed(3)}°</td><td>{result.trueAngleDeg.toFixed(3)}°</td><td><strong>{result.signedErrorDeg?.toFixed(3)}°</strong></td><td>{result.timingErrorS === null ? 'undefined at 0 rpm' : `${((result.timingErrorS ?? 0) * 1000).toFixed(2)} ms`}</td><td>{result.estimator === 'geometric' ? result.localCurvatureProxy?.toExponential(2) : '—'}</td></> : <td colSpan={5} className="rejection-cell">{result.reason}{result.ambiguityOrder ? ` (symmetry order ${result.ambiguityOrder})` : ''}</td>}</tr>)}</tbody></table></div>
      <canvas className="estimate-plot" ref={plot} />
      <div className="cost-grid">{results.filter((result) => result.costs).map((result) => <CostPlot key={result.estimator} result={result} />)}</div>
      {results.some((result) => result.estimator === 'geometric') && <p className="method-note">The local curvature proxy approaches numerical zero for dense regular sampling and is not a statistical uncertainty.</p>}
      <button className="text-button" onClick={exportPng}>Export this figure as PNG</button>
    </article>
  )
}

function CostPlot({ result }: { result: EstimateResult }) {
  const cost = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (cost.current) drawCost(cost.current, result) }, [result])
  return <div><small className="plot-label">{result.estimator === 'geometric' ? 'Geometric' : 'Contour'} cost over orientation</small><canvas className="cost-plot" ref={cost} /></div>
}

const PLOT_COLOURS = ['#176b75', '#b84f45', '#967329', '#6457a6', '#2e8062', '#a35b8d']
const estimatorName = (value: string) => value === 'geometric' ? 'Geometric boundary fit' : 'Contour matching'
const sensorName = (sensors: PlacedSensor[], id: string, fallback?: string) => {
  const index = sensors.findIndex((sensor) => sensor.instanceId === id)
  return index < 0 ? (fallback ?? id) : `S${index + 1} · ${fallback ?? sensors[index].name}`
}
const plotSeries = (records: SweepRecord[], sensors: PlacedSensor[]) => [...new Set(records.map((row) => JSON.stringify([row.sensor, row.estimator])))].map((key, index) => {
  const [sensor, estimator] = JSON.parse(key) as [string, string]
  const matching = records.filter((row) => row.sensor === sensor && row.estimator === estimator)
  return { key, label: `${sensorName(sensors, sensor, matching[0]?.sensorName)} · ${estimatorName(estimator)}`, colour: PLOT_COLOURS[index % PLOT_COLOURS.length], records: matching.filter((row) => row.accepted && row.errorDeg !== null) }
})
function PlotLegend({ records, sensors }: { records: SweepRecord[], sensors: PlacedSensor[] }) {
  return <div className="plot-legend">{plotSeries(records, sensors).map((series) => <span key={series.key}><i style={{ background: series.colour }} />{series.label}</span>)}</div>
}
function SweepResults({ summaries, offsets, records, sensors }: { summaries: SweepSummary[], offsets: PairwiseOffset[], records: SweepRecord[], sensors: PlacedSensor[] }) {
  return <>
    <div className="table-wrap"><table><thead><tr><th>Sensor</th><th>Estimator</th><th>MAE</th><th>Median</th><th>SD</th><th>P95</th><th>Rejected</th></tr></thead><tbody>{summaries.map((row) => <tr key={`${row.sensor}-${row.estimator}`}><td>{sensorName(sensors, row.sensor, row.sensorName)}</td><td>{estimatorName(row.estimator)}</td><td>{row.maeDeg?.toFixed(3) ?? '—'}°</td><td>{row.medianAbsDeg?.toFixed(3) ?? '—'}°</td><td>{row.sdDeg?.toFixed(3) ?? '—'}°</td><td>{row.p95Deg?.toFixed(3) ?? '—'}°</td><td>{(row.rejectionRate * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
    {offsets.length > 0 && <><p className="method-note">Pair offset = first sensor observation/report lag minus second sensor lag. Expected values use the same paired accepted acquisitions; timing recovery is undefined at 0 RPM.</p><div className="table-wrap"><table><thead><tr><th>Sensor pair</th><th>Estimator</th><th>Recovered offset</th><th>Expected offset</th><th>Offset SD</th></tr></thead><tbody>{offsets.map((row) => <tr key={`${row.fromSensor}-${row.toSensor}-${row.estimator}`}><td>{sensorName(sensors, row.fromSensor, row.fromSensorName)} → {sensorName(sensors, row.toSensor, row.toSensorName)}</td><td>{estimatorName(row.estimator)}</td><td>{row.recoveredOffsetMs?.toFixed(1) ?? '—'} ms</td><td>{row.expectedOffsetMs?.toFixed(1) ?? '—'} ms</td><td>{row.recoveredOffsetSdMs?.toFixed(1) ?? '—'} ms</td></tr>)}</tbody></table></div></>}
    <PlotLegend records={records} sensors={sensors} />
    <SweepPlot records={records} sensors={sensors} />
    <div className="sweep-chart-grid"><ErrorHistogram records={records} sensors={sensors} /><SensorTimingPlot records={records} sensors={sensors} /></div>
  </>
}
function ErrorHistogram({ records, sensors }: { records: SweepRecord[], sensors: PlacedSensor[] }) {
  const series = plotSeries(records, sensors)
  const values = series.flatMap((item) => item.records.map((row) => row.errorDeg!))
  if (!values.length) return null
  const limit = values.reduce((max, value) => Math.max(max, Math.abs(value)), 1)
  const histograms = series.map((item) => {
    const bins = new Uint32Array(21)
    for (const row of item.records) bins[Math.min(20, Math.floor((row.errorDeg! + limit) / (2 * limit) * 21))] += 1
    return bins
  })
  const peak = histograms.reduce((max, bins) => Math.max(max, ...bins), 1)
  const barWidth = 14 / Math.max(1, series.length)
  return <figure><figcaption>Signed error distribution · count per bin</figcaption><svg className="summary-plot" viewBox="0 0 360 160" role="img" aria-label="Signed error histogram">{histograms.flatMap((bins, seriesIndex) => Array.from(bins, (count, index) => {
    const height = count / peak * 110
    return <rect key={`${seriesIndex}-${index}`} x={24 + index * 15 + seriesIndex * barWidth} y={125 - height} width={barWidth} height={height} fill={series[seriesIndex].colour}><title>{series[seriesIndex].label}: {count}</title></rect>
  }))}<text x="2" y="18">{peak}</text><text x="24" y="148">−{limit.toFixed(1)}°</text><text x="174" y="148">0°</text><text x="310" y="148">+{limit.toFixed(1)}°</text></svg></figure>
}
function SensorTimingPlot({ records, sensors }: { records: SweepRecord[], sensors: PlacedSensor[] }) {
  const ids = [...new Set(records.map((row) => row.sensor))]
  const means = ids.map((id) => {
    const rows = records.filter((row) => row.sensor === id)
    return rows.reduce((sum, row) => sum + (row.meanObservationTimeS - row.reportedTimeS) * 1000, 0) / Math.max(1, rows.length)
  })
  const limit = means.reduce((max, value) => Math.max(max, Math.abs(value)), 1)
  return <figure><figcaption>Configured mean observation − reported time</figcaption><svg className="summary-plot" viewBox="0 0 360 150" role="img" aria-label="Sensor observation time offsets"><line x1="30" x2="345" y1="75" y2="75" stroke="#89969a"/>{means.map((mean, index) => {
    const height = Math.abs(mean) / limit * 52
    const y = mean >= 0 ? 75 - height : 75
    const fallback = records.find((row) => row.sensor === ids[index])?.sensorName
    return <g key={ids[index]}><title>{sensorName(sensors, ids[index], fallback)}</title><rect x={52 + index * 96} y={y} width="52" height={height} fill={PLOT_COLOURS[index]}/><text x={78 + index * 96} y="136" textAnchor="middle">S{index + 1}</text><text x={78 + index * 96} y={mean >= 0 ? y - 5 : y + height + 12} textAnchor="middle">{mean.toFixed(1)} ms</text></g>
  })}</svg><div className="method-note">{ids.map((id) => <div key={id}>{sensorName(sensors, id, records.find((row) => row.sensor === id)?.sensorName)}</div>)}</div></figure>
}
function SweepPlot({ records, sensors }: { records: SweepRecord[], sensors: PlacedSensor[] }) {
  const series = plotSeries(records, sensors)
  const accepted = series.flatMap((item) => item.records)
  if (!accepted.length) return <div className="rejection">All acquisitions rejected.</div>
  const max = accepted.reduce((value, row) => Math.max(value, Math.abs(row.errorDeg!)), 1)
  return <svg className="sweep-plot" viewBox="0 0 700 210" role="img" aria-label="Signed error against true angle"><line x1="50" y1="95" x2="680" y2="95" stroke="#879598"/><line x1="50" y1="15" x2="50" y2="175" stroke="#879598"/><text x="5" y="22">+{max.toFixed(1)}°</text><text x="8" y="174">−{max.toFixed(1)}°</text>{[0,90,180,270,360].map((angle) => <text key={angle} x={50 + angle / 360 * 630} y="192" textAnchor="middle">{angle}°</text>)}{series.flatMap((item) => item.records.map((row, index) => {
    const gross = row.estimator === 'contour' && Math.abs(row.errorDeg!) > 90
    return <circle data-gross-error={gross || undefined} key={`${item.key}-${index}`} cx={50 + row.trueAngleDeg / 360 * 630} cy={95 - row.errorDeg! / max * 75} r={gross ? 5 : 3} fill={item.colour} stroke={gross ? '#20282a' : 'none'} opacity={gross ? 1 : .72}><title>{item.label}: {row.errorDeg!.toFixed(3)}° at {row.trueAngleDeg.toFixed(2)}°</title></circle>
  }))}<text x="350" y="208" textAnchor="middle">True angle (°)</text></svg>
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
