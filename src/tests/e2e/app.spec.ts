import { expect, test } from '@playwright/test'

test('all panels render, rotation runs, and both estimators return output', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/rotating-target-calibration-studio/')
  await expect(page.locator('[data-panel]')).toHaveCount(6)
  await expect(page.getByTestId('three-scene')).toBeVisible()
  const angle = page.getByLabel('Revolution angle')
  const before = await angle.inputValue()
  await page.waitForTimeout(1200)
  expect(await angle.inputValue()).not.toBe(before)
  await page.getByTestId('play-pause').click()
  await page.getByRole('button', { name: 'Dense camera' }).click()
  await page.getByTestId('run-estimators').click()
  await expect(page.getByTestId('estimator-results').getByText('Accepted').first()).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('estimator-results').screenshot({ path: 'docs/estimation-overlay.png' })
  await page.getByRole('button', { name: 'Aperture ablation' }).click()
  await page.getByLabel('Geometric boundary fit').uncheck()
  await page.getByLabel('Acquisitions').fill('30')
  await page.getByRole('button', { name: 'Run sweep' }).click()
  await expect(page.locator('.table-wrap')).toBeVisible({ timeout: 45_000 })
  await page.locator('.sweep-block').screenshot({ path: 'docs/sweep-results.png' })
  expect(errors).toEqual([])
})

test('target edits update both 3D views and keep hub radii consistent', async ({ page }) => {
  await page.goto('/rotating-target-calibration-studio/')
  const scene = page.getByTestId('three-scene')
  const rotation = page.getByTestId('rotation-view')
  await expect(rotation).toBeVisible()
  for (const [label, value] of [['Outer diameter', '460'], ['Hub radius', '65'], ['Plate thickness', '5']] as const) {
    const before = await scene.getAttribute('data-target-signature')
    await page.getByLabel(label).fill(value)
    await expect(scene).not.toHaveAttribute('data-target-signature', before ?? '')
    await expect(rotation).toHaveAttribute('data-target-signature', await scene.getAttribute('data-target-signature') ?? '')
  }
  for (const [label, value] of [['Width', '48'], ['Centre', '22'], ['Inner radius', '80']] as const) {
    const before = await scene.getAttribute('data-target-signature')
    await page.getByLabel(label).first().fill(value)
    await expect(scene).not.toHaveAttribute('data-target-signature', before ?? '')
  }
  const hubs = await page.locator('[data-hub-radius-mm]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-hub-radius-mm')))
  expect(new Set(hubs).size).toBe(1)
})

test('three sensors run for 60 seconds without console errors', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/rotating-target-calibration-studio/')
  await page.getByRole('button', { name: 'Add sensor' }).click()
  await expect(page.locator('.sensor-view')).toHaveCount(3)
  await page.waitForTimeout(60_000)
  expect(errors).toEqual([])
})
