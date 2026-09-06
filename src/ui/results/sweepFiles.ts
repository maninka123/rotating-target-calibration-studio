import { serialiseConfiguration } from '../../core/config'
import type { SimulationConfig, SweepRecord } from '../../core/types'
import type { PairwiseOffset, SweepRunOptions, SweepSummary, SweepVisualSnapshot } from '../../core/sweep'
import { drawSamples } from '../shared/plots'

export interface SweepOutputDetails { pairwiseOffsets: PairwiseOffset[], run: SweepRunOptions, checkpoints?: SweepRecord[][] }

const safeSegment = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const sweepFolderName = (config: SimulationConfig, date = new Date(), rotations = 1): string => {
  const stamp = date.toISOString().replace(/\.\d{3}Z$/, '').replaceAll(':', '-').replace('T', '_')
  return `rotating-target-sweep_${safeSegment(config.target.name)}_${config.rpm.toFixed(1).replace('.', 'p')}rpm_${rotations}rev_${stamp}`
}

export const sweepRecordsCsv = (records: SweepRecord[]): string => {
  const keys: (keyof SweepRecord)[] = ['acquisition', 'sensor', 'sensorName', 'estimator', 'accepted', 'trueAngleDeg', 'reportedTimeS', 'meanObservationTimeS', 'errorDeg', 'timingErrorS', 'reason']
  const cell = (value: unknown) => value === null ? '' : typeof value === 'string' ? `"${value.replaceAll('"', '""')}"` : String(value)
  return [keys.join(','), ...records.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\n')
}

const writeFile = async (folder: FileSystemDirectoryHandle, name: string, content: string | Blob): Promise<void> => {
  const file = await folder.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function saveSweepFolder(
  parent: FileSystemDirectoryHandle,
  folderName: string,
  config: SimulationConfig,
  records: SweepRecord[],
  summaries: SweepSummary[],
  details: SweepOutputDetails,
): Promise<void> {
  const folder = await parent.getDirectoryHandle(folderName, { create: true })
  await Promise.all([
    writeFile(folder, 'sweep-results.csv', sweepRecordsCsv(records)),
    writeFile(folder, 'sweep-summary.json', JSON.stringify(summaries, null, 2)),
    writeFile(folder, 'configuration.json', serialiseConfiguration(config)),
    writeFile(folder, 'run-settings.json', JSON.stringify(details.run, null, 2)),
    writeFile(folder, 'pairwise-offsets.json', JSON.stringify(details.pairwiseOffsets, null, 2)),
  ])
}

const visualPng = async (visual: SweepVisualSnapshot, config: SimulationConfig): Promise<Blob> => {
  const canvas = document.createElement('canvas')
  canvas.style.width = '960px'
  canvas.style.height = '600px'
  drawSamples(canvas, visual.frame, config.target, visual.results, { width: 960, height: 600 })
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode checkpoint PNG')), 'image/png'))
}

export async function saveSweepCheckpoint(parent: FileSystemDirectoryHandle, folderName: string, index: number, records: SweepRecord[], visuals: SweepVisualSnapshot[] = [], config?: SimulationConfig): Promise<void> {
  const folder = await parent.getDirectoryHandle(folderName, { create: true })
  const checkpoints = await folder.getDirectoryHandle('checkpoints', { create: true })
  const checkpoint = await checkpoints.getDirectoryHandle(`checkpoint-${String(index).padStart(3, '0')}`, { create: true })
  await writeFile(checkpoint, 'acquisitions.csv', sweepRecordsCsv(records))
  if (config) await Promise.all(visuals.map(async (visual, sensorIndex) => {
    const acquisition = String(visual.acquisition).padStart(5, '0')
    const name = `S${sensorIndex + 1}-${safeSegment(visual.sensorName)}-acquisition-${acquisition}-detections-and-templates.png`
    await writeFile(checkpoint, name, await visualPng(visual, config))
  }))
}

export function downloadSweepPackage(folderName: string, config: SimulationConfig, records: SweepRecord[], summaries: SweepSummary[], details: SweepOutputDetails): void {
  const content = JSON.stringify({ version: 2, folderName, configuration: config, summaries, records, ...details }, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${folderName}.json`
  link.click()
  URL.revokeObjectURL(url)
}
