import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PlacedSensor, TargetConfig } from '../core/types'
import { targetGeometrySignature } from '../core/viewGeometry'
import { TargetMesh } from './TargetMesh'

interface Props {
  target: TargetConfig
  sensors: PlacedSensor[]
  angleDeg: number
  playing: boolean
  rpm: number
  showRays: boolean
  showDimensions: boolean
  showFov: boolean
  fovOpacity: number
}

function Frustum({ sensor, index, showRays, showFov, opacity }: { sensor: PlacedSensor, index: number, showRays: boolean, showFov: boolean, opacity: number }) {
  const z = sensor.standOffM
  const halfWidth = Math.tan(sensor.horizontalFovDeg * Math.PI / 360) * z
  const halfHeight = Math.tan(sensor.verticalFovDeg * Math.PI / 360) * z
  const { lines, surface } = useMemo(() => {
    const origin = new THREE.Vector3(0, 0, z)
    const corners = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0), new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0), new THREE.Vector3(-halfWidth, halfHeight, 0),
    ]
    const values: THREE.Vector3[] = []
    corners.forEach((corner) => values.push(origin, corner))
    for (let i = 0; i < 4; i += 1) values.push(corners[i], corners[(i + 1) % 4])
    const triangles: number[] = []
    for (let i = 0; i < 4; i += 1) {
      for (const point of [origin, corners[i], corners[(i + 1) % 4]]) triangles.push(point.x, point.y, point.z)
    }
    for (const point of [corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]) triangles.push(point.x, point.y, point.z)
    const fill = new THREE.BufferGeometry()
    fill.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3)); fill.computeVertexNormals()
    return { lines: new THREE.BufferGeometry().setFromPoints(values), surface: fill }
  }, [halfWidth, halfHeight, z])
  useEffect(() => () => { lines.dispose(); surface.dispose() }, [lines, surface])
  const colour = SENSOR_COLOURS[index] ?? SENSOR_COLOURS[0]
  return (
    <group position={[index * 0.035 - 0.035, 0, 0]}>
      {showFov && <><mesh geometry={surface}><meshBasicMaterial color={colour} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} /></mesh><lineSegments geometry={lines}><lineBasicMaterial color={colour} transparent opacity={Math.min(.8, opacity * 3 + .2)} /></lineSegments></>}
      <mesh position={[0, 0, z]}><boxGeometry args={[0.06, 0.04, 0.08]} /><meshStandardMaterial color={colour} /></mesh>
      {showRays && <lineSegments geometry={lines}><lineBasicMaterial color="#d58b49" transparent opacity={0.28} /></lineSegments>}
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

const SENSOR_COLOURS = ['#56a1aa', '#d58b49', '#8d78a8']

function LabelSprite({ text, position, colour = '#eef4f5' }: { text: string, position: [number, number, number], colour?: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96
    const context = canvas.getContext('2d')!; context.fillStyle = 'rgba(22,29,32,.85)'; context.fillRect(0, 0, 512, 96)
    context.fillStyle = colour; context.font = '32px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 48)
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace; return result
  }, [text, colour])
  useEffect(() => () => texture.dispose(), [texture])
  return <sprite position={position} scale={[.24, .045, 1]}><spriteMaterial map={texture} depthTest={false} /></sprite>
}

function ArrowHead({ position, direction, colour }: { position: THREE.Vector3, direction: THREE.Vector3, colour: string }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction.clone().normalize(),
  ), [direction])
  return <mesh position={position} quaternion={quaternion}><coneGeometry args={[.008, .024, 12]} /><meshBasicMaterial color={colour} depthTest={false} /></mesh>
}

function DimensionLine({ start, end, colour, label, labelPosition }: { start: THREE.Vector3, end: THREE.Vector3, colour: string, label: string, labelPosition: [number, number, number] }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([start, end]), [start, end])
  const forward = useMemo(() => end.clone().sub(start), [start, end])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <group><lineSegments geometry={geometry}><lineBasicMaterial color={colour} depthTest={false} /></lineSegments><ArrowHead position={start} direction={forward} colour={colour} /><ArrowHead position={end} direction={forward.clone().negate()} colour={colour} />{label && <LabelSprite text={label} position={labelPosition} colour={colour} />}</group>
}

function EngineeringDimensions({ target, sensors }: { target: TargetConfig, sensors: PlacedSensor[] }) {
  const radius = target.outerDiameterMm / 2000
  return <group renderOrder={10}>
    <DimensionLine start={new THREE.Vector3(-radius - .08, 0, 0)} end={new THREE.Vector3(-radius - .08, 0, -target.backgroundDistanceM)} colour="#c9d3d5" label={`background ${target.backgroundDistanceM.toFixed(2)} m`} labelPosition={[-radius - .08, .04, -target.backgroundDistanceM / 2]} />
    {sensors.map((sensor, index) => <DimensionLine key={sensor.instanceId} start={new THREE.Vector3(radius + .08 + index * .045, 0, 0)} end={new THREE.Vector3(radius + .08 + index * .045, 0, sensor.standOffM)} colour={SENSOR_COLOURS[index]} label={`${sensor.standOffM.toFixed(2)} m`} labelPosition={[radius + .1 + index * .05, .04, sensor.standOffM / 2]} />)}
  </group>
}

export function SceneViewport(props: Props) {
  return (
    <div className="scene-wrap" data-testid="three-scene" data-target-signature={targetGeometrySignature(props.target)} data-hub-radius-mm={props.target.hubRadiusMm}>
      <Canvas camera={{ position: [0.58, 0.42, 1.1], fov: 48 }} shadows dpr={[1, 1.5]}>
        <color attach="background" args={['#1d2427']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[1.4, 1.8, 1.2]} intensity={2.2} castShadow />
        <gridHelper args={[4, 40, '#455358', '#303b3f']} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.34, -0.5]} />
        <mesh position={[0, 0, -props.target.backgroundDistanceM]} receiveShadow><planeGeometry args={[2.4, 2.4]} /><meshStandardMaterial color="#a9b9bd" roughness={1} /></mesh>
        <TargetMesh target={props.target} angleDeg={props.angleDeg} playing={props.playing} rpm={props.rpm} />
        {props.showDimensions && <EngineeringDimensions target={props.target} sensors={props.sensors} />}
        {props.sensors.map((sensor, index) => <Frustum key={sensor.instanceId} sensor={sensor} index={index} showRays={props.showRays} showFov={props.showFov} opacity={props.fovOpacity} />)}
        <OrbitController />
      </Canvas>
      <div className="realtime-badge">Simulation · 1.00× real time</div>
    </div>
  )
}
