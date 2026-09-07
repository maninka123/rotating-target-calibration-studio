import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'

const { applyPalette, quantize } = gifenc
const port = 4175
const baseUrl = process.env.SOCIAL_PREVIEW_URL ?? `http://127.0.0.1:${port}/`
const sourcePath = 'docs/social-preview-source.png'
const outputPath = 'public/social-preview.png'
const server = process.env.SOCIAL_PREVIEW_URL ? undefined : spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { env: process.env, stdio: 'inherit', detached: true },
)

function stopServer() {
  if (!server?.pid) return
  // npm launches vite as a child, so signal the whole process group.
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* Already gone. */ }
}
process.on('exit', stopServer)

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return
    } catch { /* The local server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Preview server did not start')
}

function quantizeIfNeeded(image) {
  if (image.byteLength < 1_000_000) return image
  const decoded = PNG.sync.read(image)
  const palette = quantize(decoded.data, 192, { format: 'rgba4444' })
  const indices = applyPalette(decoded.data, palette, 'rgba4444')
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const colour = palette[indices[pixel]]
    const offset = pixel * 4
    decoded.data[offset] = colour[0]
    decoded.data[offset + 1] = colour[1]
    decoded.data[offset + 2] = colour[2]
    decoded.data[offset + 3] = colour[3] ?? 255
  }
  return PNG.sync.write(decoded, {
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
  })
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })

  const capturePage = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  })
  await capturePage.addInitScript(() => {
    localStorage.setItem('rotating-target-studio-notice-dismissed', 'true')
  })
  await capturePage.goto(baseUrl)
  await capturePage.getByTestId('three-scene').waitFor({ state: 'visible' })
  const scene = capturePage.getByTestId('three-scene')
  await scene.scrollIntoViewIfNeeded()
  await capturePage.getByLabel('Distances').uncheck()
  await capturePage.getByLabel('FOV opacity').fill('0.1')
  await capturePage.getByLabel('Revolution angle').fill('32')
  // Drop the in-scene HUD so the card shows only the geometry.
  await capturePage.addStyleTag({ content: '.scene-legend, .realtime-badge { display: none !important; }' })
  await capturePage.waitForTimeout(1200)
  await scene.screenshot({ path: sourcePath, type: 'png' })
  await capturePage.close()

  const source = await readFile(sourcePath)
  const sourceUrl = `data:image/png;base64,${source.toString('base64')}`
  const cardPage = await browser.newPage({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
  })
  await cardPage.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: 1280px; height: 640px; margin: 0; overflow: hidden; }
          body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          #card {
            position: relative;
            width: 1280px;
            height: 640px;
            overflow: hidden;
            background: #1d2427 url("${sourceUrl}") left center / cover no-repeat;
          }
          #card::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, rgba(15, 21, 24, .97) 0%, rgba(15, 21, 24, .88) 32%, rgba(15, 21, 24, .52) 49%, rgba(15, 21, 24, .08) 72%, rgba(15, 21, 24, 0) 100%);
          }
          .copy {
            position: absolute;
            z-index: 1;
            left: 90px;
            top: 50%;
            width: 455px;
            padding-left: 24px;
            transform: translateY(-50%);
            color: #f5f8f8;
          }
          .copy::before {
            content: "";
            position: absolute;
            left: 0;
            top: 5px;
            bottom: 4px;
            width: 6px;
            background: #176b75;
          }
          h1 {
            margin: 0;
            font-size: 50px;
            font-weight: 650;
            line-height: 1.06;
            letter-spacing: -.035em;
          }
          p {
            margin: 24px 0 0;
            max-width: 420px;
            color: #cfdbdd;
            font-size: 22px;
            font-weight: 400;
            line-height: 1.38;
          }
        </style>
      </head>
      <body>
        <main id="card" aria-label="Rotating Target Calibration Studio social preview">
          <div class="copy">
            <h1>Rotating Target<br />Calibration Studio</h1>
            <p>Temporal calibration across LiDAR and camera architectures</p>
          </div>
        </main>
      </body>
    </html>`)
  const card = cardPage.locator('#card')
  const rendered = await card.screenshot({ type: 'png' })
  await writeFile(outputPath, quantizeIfNeeded(rendered))
  await cardPage.close()

  const output = await readFile(outputPath)
  const png = PNG.sync.read(output)
  const details = await stat(outputPath)
  if (png.width !== 1280 || png.height !== 640) {
    throw new Error(`Expected 1280 x 640, received ${png.width} x ${png.height}`)
  }
  if (details.size >= 1_000_000) {
    throw new Error(`Expected a file under 1 MB, received ${details.size} bytes`)
  }
  process.stdout.write(`Created ${outputPath}: ${png.width} x ${png.height}, ${details.size} bytes\n`)
} finally {
  await browser?.close()
  stopServer()
}
