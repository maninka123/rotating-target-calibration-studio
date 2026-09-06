import { describe, expect, it } from 'vitest'
import { scenarioConfiguration } from '../core/scenarios'
import type { SweepRecord } from '../core/types'
import type { SweepSummary } from '../core/sweep'
import { saveSweepFolder, sweepFolderName, sweepRecordsCsv } from '../ui/results/sweepFiles'

const record: SweepRecord = {
  acquisition: 0, sensor: 'sensor-1', estimator: 'geometric', accepted: true,
  trueAngleDeg: 20, reportedTimeS: 1, meanObservationTimeS: 1.05,
  errorDeg: 0.1, timingErrorS: 0.003, reason: '',
}

describe('sweep output package', () => {
  it('creates a readable, timestamped folder name', () => {
    const name = sweepFolderName(scenarioConfiguration('Dense camera'), new Date('2026-09-06T04:05:06Z'))
    expect(name).toBe('rotating-target-sweep_dual-aperture_5p0rpm_2026-09-06_04-05-06')
  })

  it('serialises the documented per-acquisition CSV columns', () => {
    const csv = sweepRecordsCsv([record])
    expect(csv.split('\n')[0]).toBe('acquisition,sensor,estimator,accepted,trueAngleDeg,reportedTimeS,meanObservationTimeS,errorDeg,timingErrorS,reason')
    expect(csv).toContain('"sensor-1"')
  })

  it('creates a result folder and writes all three output files', async () => {
    const written = new Map<string, string>()
    const folder = {
      getFileHandle: async (name: string) => ({ createWritable: async () => ({ write: async (value: string) => { written.set(name, value) }, close: async () => undefined }) }),
    }
    let created = ''
    const parent = { getDirectoryHandle: async (name: string) => { created = name; return folder } } as unknown as FileSystemDirectoryHandle
    const summary = { sensor: 'sensor-1', estimator: 'geometric', acquisitions: 1, accepted: 1, rejectionRate: 0, maeDeg: 0.1, medianAbsDeg: 0.1, sdDeg: null, p95Deg: 0.1, recoveredOffsetMs: null, recoveredOffsetSdMs: null } satisfies SweepSummary
    const config = scenarioConfiguration('Dense camera')
    await saveSweepFolder(parent, 'result-folder', config, [record], [summary])
    expect(created).toBe('result-folder')
    expect([...written.keys()].sort()).toEqual(['configuration.json', 'sweep-results.csv', 'sweep-summary.json'])
    expect(written.get('sweep-results.csv')).toContain('sensor-1')
  })
})
