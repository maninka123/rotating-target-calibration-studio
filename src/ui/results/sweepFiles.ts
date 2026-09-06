import { serialiseConfiguration } from '../../core/config'
import type { SimulationConfig, SweepRecord } from '../../core/types'
import type { SweepSummary } from '../../core/sweep'

const safeSegment = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const sweepFolderName = (config: SimulationConfig, date = new Date(), rotations = 1): string => {
  const stamp = date.toISOString().replace(/\.\d{3}Z$/, '').replaceAll(':', '-').replace('T', '_')
  return `rotating-target-sweep_${safeSegment(config.target.name)}_${config.rpm.toFixed(1).replace('.', 'p')}rpm_${rotations}rev_${stamp}`
}

export const sweepRecordsCsv = (records: SweepRecord[]): string => {
  const keys: (keyof SweepRecord)[] = ['acquisition', 'sensor', 'estimator', 'accepted', 'trueAngleDeg', 'reportedTimeS', 'meanObservationTimeS', 'errorDeg', 'timingErrorS', 'reason']
  return [keys.join(','), ...records.map((row) => keys.map((key) => JSON.stringify(row[key])).join(','))].join('\n')
}

const writeFile = async (folder: FileSystemDirectoryHandle, name: string, content: string): Promise<void> => {
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
): Promise<void> {
  const folder = await parent.getDirectoryHandle(folderName, { create: true })
  await Promise.all([
    writeFile(folder, 'sweep-results.csv', sweepRecordsCsv(records)),
    writeFile(folder, 'sweep-summary.json', JSON.stringify(summaries, null, 2)),
    writeFile(folder, 'configuration.json', serialiseConfiguration(config)),
  ])
}

export function downloadSweepPackage(folderName: string, config: SimulationConfig, records: SweepRecord[], summaries: SweepSummary[]): void {
  const content = JSON.stringify({ folderName, configuration: config, summaries, records }, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${folderName}.json`
  link.click()
  URL.revokeObjectURL(url)
}
