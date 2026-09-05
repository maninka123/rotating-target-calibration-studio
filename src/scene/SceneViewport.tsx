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

function ApertureArc({ radius, centre, half, z }: { radius: number, centre: number, half: number, z: number }) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []
    for (let index = 0; index < 24; index += 1) {
      for (const step of [index, index + 1]) {
        const angle = centre - half + 2 * half * step / 24
        points.push(new THREE.Vector3(radius * .82 * Math.cos(angle), radius * .82 * Math.sin(angle), z))
      }
    }
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [radius, centre, half, z])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#f1c27f" depthTest={false} /></lineSegments>
}

function EngineeringDimensions({ target, sensors }: { target: TargetConfig, sensors: PlacedSensor[] }) {
  const radius = target.outerDiameterMm / 2000
  const zFace = target.thicknessMm / 2000 + .004
  return <group renderOrder={10}>
    <DimensionLine start={new THREE.Vector3(-radius, radius + .06, zFace)} end={new THREE.Vector3(radius, radius + .06, zFace)} colour="#e3eaeb" label={`${target.outerDiameterMm.toFixed(0)} mm`} labelPosition={[0, radius + .09, zFace]} />
    <DimensionLine start={new THREE.Vector3(0, 0, zFace)} end={new THREE.Vector3(target.hubRadiusMm / 1000, 0, zFace)} colour="#d96a62" label={`hub R ${target.hubRadiusMm.toFixed(0)} mm`} labelPosition={[.12, -.035, zFace]} />
    <DimensionLine start={new THREE.Vector3(-radius - .08, 0, 0)} end={new THREE.Vector3(-radius - .08, 0, -target.backgroundDistanceM)} colour="#c9d3d5" label={`background ${target.backgroundDistanceM.toFixed(2)} m`} labelPosition={[-radius - .08, .04, -target.backgroundDistanceM / 2]} />
    {sensors.map((sensor, index) => <DimensionLine key={sensor.instanceId} start={new THREE.Vector3(radius + .08 + index * .045, 0, 0)} end={new THREE.Vector3(radius + .08 + index * .045, 0, sensor.standOffM)} colour={SENSOR_COLOURS[index]} label={`${sensor.standOffM.toFixed(2)} m`} labelPosition={[radius + .1 + index * .05, .04, sensor.standOffM / 2]} />)}
    {target.apertures.map((aperture) => {
      const centre = aperture.centreDeg * Math.PI / 180; const half = aperture.widthDeg * Math.PI / 360
      return <group key={aperture.id}><ApertureArc radius={radius} centre={centre} half={half} z={zFace} />{[centre - half, centre + half].map((angle) => <DimensionLine key={angle} start={new THREE.Vector3(aperture.innerRadiusMm / 1000 * Math.cos(angle), aperture.innerRadiusMm / 1000 * Math.sin(angle), zFace)} end={new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), zFace)} colour="#f1c27f" label="" labelPosition={[0,0,-10]} />)}<LabelSprite text={`${aperture.widthDeg.toFixed(0)}° · r ${aperture.innerRadiusMm.toFixed(0)} mm`} position={[radius * .9 * Math.cos(centre), radius * .9 * Math.sin(centre), zFace]} colour="#f1c27f" /></group>
    })}
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
        {props.sensors.map((sensor, index) => <Frustum key={sensor.instanceId} sensor={sensor} index={index} showRays={props.showRays} />)}
        <OrbitController />
      </Canvas>
      <div className="scene-labels">{props.sensors.map((sensor, index) => <span key={sensor.instanceId}>S{index + 1} · {sensor.name}</span>)}</div>
    </div>
  )
}
