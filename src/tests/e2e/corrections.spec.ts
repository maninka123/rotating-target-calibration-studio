import { expect, test } from '@playwright/test'

test('3D coverage legend follows the active sensors and their colours', async ({ page }) => {
  await page.goto('/rotating-target-calibration-studio/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Rolling shutter at rate', exact: true }).click()
  const legend = page.getByLabel('Sensor coverage colours')
  await expect(legend).toBeVisible()
  await expect(legend.locator(':scope > div')).toHaveCount(2)
  await expect(legend).toContainText('S1 · FLIR Blackfly S')
  await expect(legend).toContainText('S2 · FLIR Blackfly S — 20 ms rolling')
  await expect(legend.locator('[aria-hidden="true"]').nth(0)).toHaveCSS('background-color', 'rgb(86, 161, 170)')
  await expect(legend.locator('[aria-hidden="true"]').nth(1)).toHaveCSS('background-color', 'rgb(213, 139, 73)')
  await page.getByRole('button', { name: 'Dense camera', exact: true }).click()
  await expect(legend.locator(':scope > div')).toHaveCount(1)
})

test('paused frames refresh, frozen estimation uses identical arrays, and edits clear results', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    const state = { frames: {} as Record<string, string>, estimates: [] as { matches: boolean }[] }
    Object.assign(window, { __frameAudit: state })
    const fingerprint = (frame: { xMm: Float64Array, yMm: Float64Array, classes: Uint8Array, observationTimeS: Float64Array }) => JSON.stringify([Array.from(frame.xMm), Array.from(frame.yMm), Array.from(frame.classes), Array.from(frame.observationTimeS)])
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        this.addEventListener('message', (event) => {
          if (event.data.type === 'frame') {
            const frame = event.data.frame
            state.frames[JSON.stringify([frame.sensorId, frame.acquisitionIndex, frame.acquisitionStartS])] = fingerprint(frame)
          }
        })
      }
      postMessage(message: unknown, transfer: Transferable[]): void
      postMessage(message: unknown, options?: StructuredSerializeOptions): void
      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { type: string, frame?: { sensorId: string, xMm: Float64Array, yMm: Float64Array, classes: Uint8Array, observationTimeS: Float64Array } }
        if (request.type === 'estimate' && request.frame) {
          const canvas = [...document.querySelectorAll<HTMLCanvasElement>('.sensor-view canvas')].find((element) => element.dataset.sensorId === request.frame!.sensorId)
          // Only a completed draw identifies the displayed acquisition. Later
          // in-flight replies can be deliberately discarded after pausing.
          state.estimates.push({ matches: state.frames[canvas?.dataset.acquisitionKey ?? ''] === fingerprint(request.frame) })
        }
        if (Array.isArray(options)) super.postMessage(message, options)
        else super.postMessage(message, options)
      }
    }
  })
  await page.goto('/rotating-target-calibration-studio/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.sensor-view').first()).not.toContainText(/Band\s*0\s/)
  await page.locator('.header-play').click()
  await expect(page.getByTestId('run-estimators')).toBeEnabled()
  await page.getByTestId('run-estimators').click()
  await expect(page.locator('.estimate-card')).toHaveCount(2, { timeout: 30_000 })
  expect(await page.evaluate(() => (window as unknown as { __frameAudit: { estimates: { matches: boolean }[] } }).__frameAudit.estimates.length)).toBe(2)
  expect(await page.evaluate(() => (window as unknown as { __frameAudit: { estimates: { matches: boolean }[] } }).__frameAudit.estimates.every((result) => result.matches))).toBe(true)
  const band = page.locator('.sensor-view').first().locator('.tile-readouts strong').first()
  const before = await band.innerText()
  await page.getByLabel('Stand-off').first().fill('2')
  await expect(page.locator('.estimate-card')).toHaveCount(0)
  await expect(band).not.toHaveText(before)
  await expect(band).not.toHaveText('0')
  await page.getByRole('button', { name: 'Dense camera', exact: true }).click()
  await expect(page.locator('.sensor-view').first()).toContainText('103,276')
  await page.getByTestId('run-estimators').click()
  await expect(page.locator('.estimate-card')).toHaveCount(1, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Triple aperture', exact: true }).click()
  await expect(page.locator('.estimate-card')).toHaveCount(0)
  await page.getByLabel('Hub radius').fill('150')
  await expect(page.locator('.target-panel [role="alert"]')).toContainText('inner radius')
  await expect(page.getByTestId('three-scene')).toHaveAttribute('data-hub-radius-mm', '50')
  await page.getByRole('button', { name: 'Resolution threshold', exact: true }).click()
  const low = Number((await page.locator('.sensor-view .tile-readouts strong').first().innerText()).replaceAll(',', ''))
  await expect.poll(async () => Number((await page.locator('.sensor-view .tile-readouts strong').first().innerText()).replaceAll(',', ''))).toBeGreaterThan(6000)
  expect(low).toBeLessThan(7000)
})

test('sweep review keeps focus, validates fields, and FOV warnings are truthful', async ({ page }) => {
  await page.goto('/rotating-target-calibration-studio/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Angular search resolution').fill('0')
  await expect(page.getByLabel('Angular search resolution')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Acquisitions').fill('0')
  await expect(page.getByLabel('Acquisitions')).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: 'Run sweep', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Run acquisition sweep?' })
  await expect(review).not.toContainText('NaN')
  await expect(review).toContainText('300 acquisitions/rotation')
  const rpm = review.getByLabel('Sweep RPM')
  await rpm.click()
  await page.waitForTimeout(1200)
  await expect(rpm).toBeFocused()
  await rpm.fill('21')
  await expect(rpm).toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Run sweep', exact: true })).toBeFocused()
  await page.locator('.header-play').click()
  await page.locator('.sensor-heading select').first().selectOption('single-plane')
  await expect(page.locator('.sensor-card').first()).toContainText('full disc coverage is impossible')
  await page.locator('.sensor-heading select').first().selectOption('puck-hires')
  await page.getByLabel('Stand-off').first().fill('1')
  await page.getByRole('button', { name: 'Apply minimum', exact: true }).click()
  await expect(page.locator('.sensor-card').first()).toContainText('Target coverage: full')
  await expect(page.getByLabel('Pitch')).toHaveCount(0)
  await expect(page.getByTestId('rotation-view').locator('[aria-label="Zero-degree reference"]')).toHaveAttribute('d', 'M232 120 L220 114 L220 126 Z')
})

test('static multi-sensor sweep labels and downloaded package preserve the reviewed run', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }))
  await page.goto('/rotating-target-calibration-studio/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Rolling shutter at rate', exact: true }).click()
  await page.getByLabel('Geometric boundary fit', { exact: true }).uncheck()
  await page.getByLabel('Acquisitions', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Run sweep', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Run acquisition sweep?' })
  await review.getByLabel('Sweep RPM').fill('0')
  await review.getByLabel('Sweep rotations').fill('2')
  const downloadPromise = page.waitForEvent('download')
  await review.getByRole('button', { name: 'Start and download' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const saved = JSON.parse(Buffer.concat(chunks).toString())
  expect(saved.run).toMatchObject({ rpm: 0, rotations: 2, acquisitionsPerRotation: 10, estimators: ['contour'], saveIntermediate: true })
  expect(saved.configuration.rpm).toBe(0)
  expect(saved.records).toHaveLength(40)
  expect(new Set(saved.records.map((row: { trueAngleDeg: number }) => row.trueAngleDeg))).toEqual(new Set([0]))
  expect(saved.pairwiseOffsets).toHaveLength(1)
  expect(saved.pairwiseOffsets[0].recoveredOffsetMs).toBeNull()
  expect(saved.checkpoints.flat()).toEqual(saved.records)
  await expect(page.locator('.table-wrap').first()).toContainText('S1 · FLIR Blackfly S')
  await expect(page.locator('.table-wrap').first()).toContainText('S2 · FLIR Blackfly S — 20 ms rolling')
  await expect(page.locator('.plot-legend span')).toHaveCount(2)
  await expect(page.locator('.table-wrap').last()).toContainText('Expected offset')
})
