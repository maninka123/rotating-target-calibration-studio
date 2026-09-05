import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PlacedSensor, TargetConfig } from '../core/types'

interface Props {
  target: TargetConfig
  sensors: PlacedSensor[]
  angleDeg: number
  playing: boolean
  rpm: number
  showRays: boolean
}

function TargetMesh({ target, angleDeg, playing, rpm }: Omit<Props, 'sensors' | 'showRays'>) {
  const group = useRef<THREE.Group>(null)
  const currentAngle = useRef(angleDeg * Math.PI / 180)
  const geometry = useMemo(() => {
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
    const result = new THREE.ExtrudeGeometry(shape, { depth: target.thicknessMm / 1000, bevelEnabled: false, curveSegments: 96 })
    result.center()
    return result
  }, [target])
  useFrame((_, delta) => {
    if (playing) currentAngle.current += rpm * Math.PI / 30 * delta
    else currentAngle.current = angleDeg * Math.PI / 180
    if (group.current) group.current.rotation.z = currentAngle.current
  })
  return (
    <group ref={group}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#65757b" roughness={0.72} metalness={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, target.thicknessMm / 2000 + 0.002]}>
        <cylinderGeometry args={[target.hubRadiusMm / 1000, target.hubRadiusMm / 1000, 0.008, 48]} />
        <meshStandardMaterial color="#39474b" />
      </mesh>
    </group>
  )
}

function Frustum({ sensor, index, showRays }: { sensor: PlacedSensor, index: number, showRays: boolean }) {
  const z = sensor.standOffM
  const halfWidth = Math.tan(sensor.horizontalFovDeg * Math.PI / 360) * z
  const halfHeight = Math.tan(sensor.verticalFovDeg * Math.PI / 360) * z
  const points = useMemo(() => {
    const origin = new THREE.Vector3(0, 0, z)
    const corners = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0), new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0), new THREE.Vector3(-halfWidth, halfHeight, 0),
    ]
    const values: THREE.Vector3[] = []
    corners.forEach((corner) => values.push(origin, corner))
    for (let i = 0; i < 4; i += 1) values.push(corners[i], corners[(i + 1) % 4])
    return new THREE.BufferGeometry().setFromPoints(values)
  }, [halfWidth, halfHeight, z])
  return (
    <group position={[index * 0.035 - 0.035, 0, 0]}>
      <lineSegments geometry={points}><lineBasicMaterial color="#56a1aa" transparent opacity={0.58} /></lineSegments>
      <mesh position={[0, 0, z]}><boxGeometry args={[0.06, 0.04, 0.08]} /><meshStandardMaterial color="#176b75" /></mesh>
      {showRays && <lineSegments geometry={points}><lineBasicMaterial color="#d58b49" transparent opacity={0.22} /></lineSegments>}
    </group>
  )
}

function OrbitController() {
  const { camera, gl } = useThree()
  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    const animate = () => controls.update()
    controls.addEventListener('change', animate)
    return () => {
      controls.removeEventListener('change', animate)
      controls.dispose()
    }
  }, [camera, gl])
  return null
}

export function SceneViewport(props: Props) {
  return (
    <div className="scene-wrap" data-testid="three-scene">
      <Canvas camera={{ position: [0.58, 0.42, 1.1], fov: 48 }} shadows dpr={[1, 1.5]}>
        <color attach="background" args={['#1d2427']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[1.4, 1.8, 1.2]} intensity={2.2} castShadow />
        <gridHelper args={[4, 40, '#455358', '#303b3f']} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.34, -0.5]} />
        <mesh position={[0, 0, -props.target.backgroundDistanceM]} receiveShadow><planeGeometry args={[2.4, 2.4]} /><meshStandardMaterial color="#a9b9bd" roughness={1} /></mesh>
        <TargetMesh target={props.target} angleDeg={props.angleDeg} playing={props.playing} rpm={props.rpm} />
        {props.sensors.map((sensor, index) => <Frustum key={sensor.instanceId} sensor={sensor} index={index} showRays={props.showRays} />)}
        <OrbitController />
      </Canvas>
      <div className="scene-labels">{props.sensors.map((sensor, index) => <span key={sensor.instanceId}>S{index + 1} · {sensor.name}</span>)}</div>
    </div>
  )
}
