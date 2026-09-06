/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { TargetConfig } from '../core/types'
import { DEG, wrapRad } from '../core/geometry'
import { hubRadiusSceneM } from '../core/viewGeometry'

export const HUB_COLOUR = '#c94b43'
const TAU = Math.PI * 2
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU

const materialRadiusAt = (target: TargetConfig, angle: number): number => {
  const radius = target.outerDiameterMm / 2000
  const active = target.apertures.filter((aperture) =>
    Math.abs(wrapRad(angle - aperture.centreDeg * DEG)) < aperture.widthDeg * DEG / 2,
  )
  return active.length ? Math.min(...active.map((aperture) => aperture.innerRadiusMm / 1000)) : radius
}

export const buildTargetShape = (target: TargetConfig): THREE.Shape => {
  const boundaries = new Set<number>([0, TAU])
  for (const aperture of target.apertures) {
    const centre = aperture.centreDeg * DEG
    const half = aperture.widthDeg * DEG / 2
    boundaries.add(positiveAngle(centre - half))
    boundaries.add(positiveAngle(centre + half))
  }
  const ordered = [...boundaries].sort((a, b) => a - b)
  const shape = new THREE.Shape()
  let started = false
  for (let interval = 0; interval < ordered.length - 1; interval += 1) {
    const start = ordered[interval]
    const end = ordered[interval + 1]
    if (end - start < 1e-10) continue
    const radius = materialRadiusAt(target, (start + end) / 2)
    const steps = Math.max(1, Math.ceil((end - start) / (TAU / 360)))
    for (let step = 0; step <= steps; step += 1) {
      const angle = start + (end - start) * step / steps
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)
      if (!started) { shape.moveTo(x, y); started = true } else shape.lineTo(x, y)
    }
  }
  shape.closePath()
  return shape
}

export const buildTargetGeometry = (target: TargetConfig): THREE.ExtrudeGeometry => {
  const shape = buildTargetShape(target)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: target.thicknessMm / 1000, bevelEnabled: false, curveSegments: 72 })
  geometry.center(); geometry.computeBoundingBox()
  return geometry
}

export const targetGeometryFingerprint = (target: TargetConfig): string => {
  const geometry = buildTargetGeometry(target)
  const positions = geometry.getAttribute('position')
  let checksum = 0
  for (let index = 0; index < positions.count; index += 1) checksum += positions.getX(index) * (index + 1) + positions.getY(index) * (index + 3) + positions.getZ(index) * (index + 5)
  const box = geometry.boundingBox!
  const result = `${positions.count}:${checksum.toFixed(8)}:${box.min.toArray().join(',')}:${box.max.toArray().join(',')}:hub=${target.hubRadiusMm}`
  geometry.dispose()
  return result
}

export function buildTargetResources(target: TargetConfig) {
  const geometry = buildTargetGeometry(target)
  const edges = new THREE.EdgesGeometry(geometry, 25)
  const plateMaterial = new THREE.MeshStandardMaterial({ color: '#65757b', roughness: .72, metalness: .18, side: THREE.DoubleSide })
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#20282a' })
  const hubMaterial = new THREE.MeshBasicMaterial({ color: HUB_COLOUR, side: THREE.DoubleSide, depthTest: true })
  const hubEdgeMaterial = new THREE.MeshBasicMaterial({ color: '#451c1a' })
  return {
    geometry, edges, plateMaterial, edgeMaterial, hubMaterial, hubEdgeMaterial,
    dispose() {
      geometry.dispose(); edges.dispose(); plateMaterial.dispose(); edgeMaterial.dispose(); hubMaterial.dispose(); hubEdgeMaterial.dispose()
    },
  }
}

interface Props { target: TargetConfig, angleDeg: number, playing: boolean, rpm: number }

export function TargetMesh({ target, angleDeg, playing, rpm }: Props) {
  const resources = useMemo(() => buildTargetResources(target), [target])
  useEffect(() => () => resources.dispose(), [resources])
  void playing; void rpm
  const faceZ = target.thicknessMm / 2000 + 0.0003
  return <group rotation={[0, 0, angleDeg * Math.PI / 180]}>
    <mesh geometry={resources.geometry} material={resources.plateMaterial} castShadow receiveShadow />
    <lineSegments geometry={resources.edges} material={resources.edgeMaterial} position={[0, 0, .0002]} />
    <mesh position={[0, 0, faceZ]} material={resources.hubMaterial}><circleGeometry args={[hubRadiusSceneM(target), 64]} /></mesh>
    <mesh position={[0, 0, faceZ + .0001]} material={resources.hubEdgeMaterial}><ringGeometry args={[hubRadiusSceneM(target) - .0008, hubRadiusSceneM(target) + .0008, 64]} /></mesh>
  </group>
}
