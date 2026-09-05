import type { EstimateResult, SampleFrame, TargetConfig } from '../../core/types'
import { APERTURE, BACKGROUND, MATERIAL } from '../../core/types'

export const CLASS_COLOURS = {
  [MATERIAL]: '#65757b',
  [APERTURE]: '#d58b49',
  [BACKGROUND]: '#a9b9bd',
} as const

export const drawSamples = (
  canvas: HTMLCanvasElement,
  frame: SampleFrame,
  target: TargetConfig,
  estimate?: EstimateResult,
): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 420
  const height = canvas.clientHeight || 260
  canvas.width = width * ratio
  canvas.height = height * ratio
  context.scale(ratio, ratio)
  context.fillStyle = '#f8fafb'
  context.fillRect(0, 0, width, height)
  const scale = Math.min(width, height) * 0.42 / (target.outerDiameterMm / 2)
  const cx = width / 2
  const cy = height / 2
  const stride = Math.max(1, Math.ceil(frame.classes.length / 20_000))
  for (let index = 0; index < frame.classes.length; index += stride) {
    context.fillStyle = CLASS_COLOURS[frame.classes[index] as keyof typeof CLASS_COLOURS]
    context.fillRect(cx + frame.xMm[index] * scale, cy - frame.yMm[index] * scale, 1.5, 1.5)
  }
  context.strokeStyle = '#89969a'
  context.lineWidth = 1
  context.beginPath()
  context.arc(cx, cy, target.outerDiameterMm / 2 * scale, 0, Math.PI * 2)
  context.stroke()
  if (estimate?.accepted && estimate.angleDeg !== undefined) {
    drawApertures(context, target, estimate.angleDeg, cx, cy, scale, '#176b75', false)
    drawApertures(context, target, estimate.trueAngleDeg, cx, cy, scale, '#30383a', true)
    context.fillStyle = '#20282a'
    context.font = '12px Inter, sans-serif'
    context.fillText(`Δθ = ${estimate.signedErrorDeg?.toFixed(3)}°`, 12, 20)
  }
}

const drawApertures = (
  context: CanvasRenderingContext2D,
  target: TargetConfig,
  angleDeg: number,
  cx: number,
  cy: number,
  scale: number,
  colour: string,
  dashed: boolean,
): void => {
  context.strokeStyle = colour
  context.lineWidth = 1.7
  context.setLineDash(dashed ? [5, 4] : [])
  for (const aperture of target.apertures) {
    const centre = (angleDeg + aperture.centreDeg) * Math.PI / 180
    const half = aperture.widthDeg * Math.PI / 360
    for (const edge of [centre - half, centre + half]) {
      context.beginPath()
      context.moveTo(cx + aperture.innerRadiusMm * scale * Math.cos(edge), cy - aperture.innerRadiusMm * scale * Math.sin(edge))
      context.lineTo(cx + target.outerDiameterMm / 2 * scale * Math.cos(edge), cy - target.outerDiameterMm / 2 * scale * Math.sin(edge))
      context.stroke()
    }
  }
  context.setLineDash([])
}

export const drawCost = (canvas: HTMLCanvasElement, result: EstimateResult): void => {
  const context = canvas.getContext('2d')
  if (!context || !result.costs) return
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 420
  const height = canvas.clientHeight || 150
  canvas.width = width * ratio
  canvas.height = height * ratio
  context.scale(ratio, ratio)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  const maxCost = Math.max(...result.costs, 0.01)
  context.strokeStyle = '#176b75'
  context.lineWidth = 1.5
  context.beginPath()
  result.costs.forEach((cost, index) => {
    const x = 30 + index / 359 * (width - 42)
    const y = height - 22 - cost / maxCost * (height - 36)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
  if (result.angleDeg !== undefined) {
    const x = 30 + result.angleDeg / 360 * (width - 42)
    context.fillStyle = '#c84b31'
    context.beginPath()
    context.arc(x, height - 22 - (result.minimumCost ?? 0) / maxCost * (height - 36), 3.5, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = '#556064'
  context.font = '10px Inter, sans-serif'
  context.fillText('0°', 26, height - 7)
  context.fillText('180°', width / 2 - 12, height - 7)
  context.fillText('360°', width - 37, height - 7)
}
