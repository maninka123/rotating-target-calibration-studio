import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'

const { GIFEncoder, applyPalette, quantize } = gifenc

const port = 4174
const baseUrl = process.env.CAPTURE_URL ?? `http://127.0.0.1:${port}/`
const server = process.env.CAPTURE_URL ? undefined : spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: process.env,
  stdio: 'ignore',
})

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Preview server did not start')
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Continue' }).click()
  const panel = page.locator('.scene-panel')
  await panel.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  await writeFile('docs/rotation-view.png', await page.locator('.rotation-panel').screenshot({ type: 'png' }))

  const encoder = GIFEncoder()
  for (let frame = 0; frame < 50; frame += 1) {
    const png = PNG.sync.read(await panel.screenshot({ type: 'png' }))
    const palette = quantize(png.data, 64, { format: 'rgba4444' })
    const index = applyPalette(png.data, palette, 'rgba4444')
    encoder.writeFrame(index, png.width, png.height, { palette, delay: 200, repeat: 0 })
    await page.waitForTimeout(150)
  }
  encoder.finish()
  await writeFile('docs/simulator-demo.gif', encoder.bytesView())
} finally {
  await browser?.close()
  server?.kill('SIGTERM')
}
