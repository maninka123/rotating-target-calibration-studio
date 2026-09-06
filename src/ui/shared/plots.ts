import type { EstimateResult, SampleFrame, TargetConfig } from '../../core/types'
import { APERTURE, BACKGROUND, MATERIAL } from '../../core/types'
import { hubRadiusSensorPixels } from '../../core/viewGeometry'

export const CLASS_COLOURS = {
  [MATERIAL]: '#65757b',
  [APERTURE]: '#d58b49',
  [BACKGROUND]: '#a9b9bd',
} as const

export const drawSamples = (
  canvas: HTMLCanvasElement,
  frame: SampleFrame,
  target: TargetConfig,
  estimate?: EstimateResult | EstimateResult[],
  displaySize?: { width: number, height: number },
): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const ratio = window.devicePixelRatio || 1
  const width = displaySize?.width ?? (canvas.clientWidth || 420)
  const height = displaySize?.height ?? (canvas.clientHeight || 260)
  canvas.width = width * ratio
  canvas.height = height * ratio
  context.scale(ratio, ratio)
  context.fillStyle = '#f8fafb'
  context.fillRect(0, 0, width, height)
  const scale = Math.min(width, height) * 0.42 / (target.outerDiameterMm / 2)
  const cx = width / 2
  const cy = height / 2
  context.strokeStyle = '#89969a'
  context.lineWidth = 1
  context.beginPath()
  context.arc(cx, cy, target.outerDiameterMm / 2 * scale, 0, Math.PI * 2)
  context.stroke()
  context.fillStyle = 'rgba(201,75,67,.28)'
  context.beginPath()
  context.arc(cx, cy, hubRadiusSensorPixels(target, scale), 0, Math.PI * 2)
  context.fill()
  const stride = Math.max(1, Math.ceil(frame.classes.length / 20_000))
  for (let index = 0; index < frame.classes.length; index += stride) {
    context.fillStyle = CLASS_COLOURS[frame.classes[index] as keyof typeof CLASS_COLOURS]
    context.fillRect(cx + frame.xMm[index] * scale - 1, cy - frame.yMm[index] * scale - 1, 2.2, 2.2)
  }
  context.strokeStyle = '#7f302c'
  context.lineWidth = 1.5
  context.beginPath()
  context.arc(cx, cy, hubRadiusSensorPixels(target, scale), 0, Math.PI * 2)
  context.stroke()
  const estimates = estimate ? (Array.isArray(estimate) ? estimate : [estimate]) : []
  const truth = estimates[0]
  const colours = { contour: '#c94b43', geometric: '#176b75' }
  let legendX = 12
  if (truth) {
    context.font = 'bold 11px Inter, sans-serif'; context.fillStyle = '#20282a'; context.fillText('Truth at reported timestamp', legendX, 18); legendX += 164
  }
  for (const result of estimates) if (result.accepted && result.angleDeg !== undefined) {
    const colour = colours[result.estimator]
    drawApertures(context, target, result.angleDeg, cx, cy, scale, colour, false, result.estimator === 'contour' ? 5 : 3.2)
    context.fillStyle = colour
    context.fillText(`${result.estimator === 'contour' ? 'Contour' : 'Geometric'} Δθ ${result.signedErrorDeg?.toFixed(3)}°`, legendX, 18)
    legendX += 142
  }
  if (truth) drawApertures(context, target, truth.trueAngleDeg, cx, cy, scale, '#20282a', true, 3.2)
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
  width = 2,
): void => {
  context.strokeStyle = colour
  context.lineWidth = width
  context.setLineDash(dashed ? [8, 5] : [])
  for (const aperture of target.apertures) {
    const centre = (angleDeg + aperture.centreDeg) * Math.PI / 180
    const half = aperture.widthDeg * Math.PI / 360
    const outer = target.outerDiameterMm / 2 * scale
    const inner = aperture.innerRadiusMm * scale
    context.beginPath()
    context.moveTo(cx + inner * Math.cos(centre - half), cy - inner * Math.sin(centre - half))
    context.lineTo(cx + outer * Math.cos(centre - half), cy - outer * Math.sin(centre - half))
    context.arc(cx, cy, outer, -(centre - half), -(centre + half), true)
    context.lineTo(cx + inner * Math.cos(centre + half), cy - inner * Math.sin(centre + half))
    context.arc(cx, cy, inner, -(centre + half), -(centre - half), false)
    context.closePath()
    context.stroke()
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
  context.lineWidth = 2.5
  context.beginPath()
  result.costs.forEach((cost, index) => {
    const angle = result.costAnglesDeg?.[index] ?? index * 360 / result.costs!.length
    const x = 30 + angle / 360 * (width - 42)
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
