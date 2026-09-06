import { describe, expect, it } from 'vitest'
import { scenarioConfiguration } from '../core/scenarios'
import type { SweepRecord } from '../core/types'
import type { SweepSummary } from '../core/sweep'
import { saveSweepCheckpoint, saveSweepFolder, sweepFolderName, sweepRecordsCsv, type SweepOutputDetails } from '../ui/results/sweepFiles'

const details: SweepOutputDetails = { pairwiseOffsets: [{ fromSensor: 'sensor-1', fromSensorName: 'Sensor one', toSensor: 'sensor-2', toSensorName: 'Sensor two', estimator: 'geometric', recoveredOffsetMs: 50, recoveredOffsetSdMs: 1, expectedOffsetMs: 50 }], run: { rpm: 5, rotations: 2, acquisitionsPerRotation: 300, estimators: ['geometric'], searchResolutionDeg: 1, initialAngleDeg: 17, saveIntermediate: true } }

const record: SweepRecord = {
  acquisition: 0, sensor: 'sensor-1', sensorName: 'Sensor one', estimator: 'geometric', accepted: true,
  trueAngleDeg: 20, reportedTimeS: 1, meanObservationTimeS: 1.05,
  errorDeg: 0.1, timingErrorS: 0.003, reason: '',
}

describe('sweep output package', () => {
  it('creates a readable, timestamped folder name', () => {
    const name = sweepFolderName(scenarioConfiguration('Dense camera'), new Date('2026-09-06T04:05:06Z'))
    expect(name).toBe('rotating-target-sweep_dual-aperture_5p0rpm_1rev_2026-09-06_04-05-06')
  })

  it('serialises the documented per-acquisition CSV columns', () => {
    const csv = sweepRecordsCsv([record])
    expect(csv.split('\n')[0]).toBe('acquisition,sensor,sensorName,estimator,accepted,trueAngleDeg,reportedTimeS,meanObservationTimeS,errorDeg,timingErrorS,reason')
    expect(csv).toContain('"sensor-1"')
  })

  it('saves run settings, pairwise offsets and original configuration alongside results', async () => {
    const written = new Map<string, string>()
    const folder = {
      getFileHandle: async (name: string) => ({ createWritable: async () => ({ write: async (value: string) => { written.set(name, value) }, close: async () => undefined }) }),
    }
    let created = ''
    const parent = { getDirectoryHandle: async (name: string) => { created = name; return folder } } as unknown as FileSystemDirectoryHandle
    const summary = { sensor: 'sensor-1', sensorName: 'Sensor one', estimator: 'geometric', acquisitions: 1, accepted: 1, rejectionRate: 0, maeDeg: 0.1, medianAbsDeg: 0.1, sdDeg: null, p95Deg: 0.1 } satisfies SweepSummary
    const config = scenarioConfiguration('Dense camera')
    await saveSweepFolder(parent, 'result-folder', config, [record], [summary], details)
    expect(created).toBe('result-folder')
    expect([...written.keys()].sort()).toEqual(['configuration.json', 'pairwise-offsets.json', 'run-settings.json', 'sweep-results.csv', 'sweep-summary.json'])
    expect(JSON.parse(written.get('run-settings.json')!)).toEqual(details.run)
    expect(JSON.parse(written.get('pairwise-offsets.json')!)).toEqual(details.pairwiseOffsets)
    expect(written.get('sweep-results.csv')).toContain('sensor-1')
  })

  it('writes numbered intermediate acquisition checkpoints', async () => {
    const writes = new Map<string, string>()
    const folders: string[] = []
    const handle = {
      getDirectoryHandle: async (name: string) => { folders.push(name); return handle },
      getFileHandle: async (name: string) => ({ createWritable: async () => ({ write: async (text: string) => { writes.set(name, text) }, close: async () => undefined }) }),
    } as unknown as FileSystemDirectoryHandle
    await saveSweepCheckpoint(handle, 'run', 2, [record])
    expect(folders).toEqual(['run', 'checkpoints', 'checkpoint-002'])
    expect(writes.get('acquisitions.csv')).toContain('Sensor one')
  })

  it('escapes quoted CSV fields using doubled quotes', () => {
    expect(sweepRecordsCsv([{ ...record, sensor: 'A "quoted", sensor' }])).toContain('"A ""quoted"", sensor"')
  })
})
