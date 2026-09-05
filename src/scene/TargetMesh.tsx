/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TargetConfig } from '../core/types'
import { hubRadiusSceneM } from '../core/viewGeometry'

export const HUB_COLOUR = '#c94b43'
export const buildTargetGeometry = (target: TargetConfig): THREE.ExtrudeGeometry => {
  const radius = target.outerDiameterMm / 2000
  const shape = new THREE.Shape()
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false)
  for (const aperture of target.apertures) {
    const path = new THREE.Path()
    const inner = aperture.innerRadiusMm / 1000
    const centre = aperture.centreDeg * Math.PI / 180
    const half = aperture.widthDeg * Math.PI / 360
    path.moveTo(inner * Math.cos(centre - half), inner * Math.sin(centre - half))
    path.lineTo(radius * Math.cos(centre - half), radius * Math.sin(centre - half))
    path.absarc(0, 0, radius, centre - half, centre + half, false)
    path.lineTo(inner * Math.cos(centre + half), inner * Math.sin(centre + half))
    path.absarc(0, 0, inner, centre + half, centre - half, true)
    shape.holes.push(path)
  }
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
  const group = useRef<THREE.Group>(null)
  const currentAngle = useRef(angleDeg * Math.PI / 180)
  const resources = useMemo(() => buildTargetResources(target), [target])
  useEffect(() => () => resources.dispose(), [resources])
  useFrame((_, delta) => {
    if (playing) currentAngle.current += rpm * Math.PI / 30 * delta
    else currentAngle.current = angleDeg * Math.PI / 180
    if (group.current) group.current.rotation.z = currentAngle.current
  })
  const faceZ = target.thicknessMm / 2000 + 0.0003
  return <group ref={group}>
    <mesh geometry={resources.geometry} material={resources.plateMaterial} castShadow receiveShadow />
    <lineSegments geometry={resources.edges} material={resources.edgeMaterial} position={[0, 0, .0002]} />
    <mesh position={[0, 0, faceZ]} material={resources.hubMaterial}><circleGeometry args={[hubRadiusSceneM(target), 64]} /></mesh>
    <mesh position={[0, 0, faceZ + .0001]} material={resources.hubEdgeMaterial}><ringGeometry args={[hubRadiusSceneM(target) - .0008, hubRadiusSceneM(target) + .0008, 64]} /></mesh>
  </group>
}
