import { expect, test } from '@playwright/test'

test('all five panels render, rotation runs, and both estimators return output', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/rotating-target-calibration-studio/')
  await expect(page.locator('[data-panel]')).toHaveCount(5)
  await expect(page.getByTestId('three-scene')).toBeVisible()
  const angle = page.getByLabel('Revolution angle')
  const before = await angle.inputValue()
  await page.waitForTimeout(1200)
  expect(await angle.inputValue()).not.toBe(before)
  await page.getByTestId('play-pause').click()
  await page.getByRole('button', { name: 'Dense camera baseline' }).click()
  await page.getByTestId('run-estimators').click()
  await expect(page.getByTestId('estimator-results').getByText('Accepted').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'docs/application-overview.png', fullPage: true })
  expect(errors).toEqual([])
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
