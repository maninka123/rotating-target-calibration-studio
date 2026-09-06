import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { DUAL_APERTURE, matchesTargetPreset, SINGLE_APERTURE, TRIPLE_APERTURE } from '../core/presets'
import { hubRadiusPreviewUnits, hubRadiusSceneM, hubRadiusSensorPixels, hubRadiusTargetMm } from '../core/viewGeometry'
import { targetGeometrySignature } from '../core/viewGeometry'
import { buildTargetGeometry, buildTargetResources, buildTargetShape, targetGeometryFingerprint } from '../scene/TargetMesh'

const topFaceContains = (target: typeof DUAL_APERTURE, radiusM: number, angleDeg: number): boolean => {
  const geometry = buildTargetGeometry(target)
  const positions = geometry.getAttribute('position')
  const topZ = geometry.boundingBox!.max.z
  const point = new THREE.Vector3(radiusM * Math.cos(angleDeg * Math.PI / 180), radiusM * Math.sin(angleDeg * Math.PI / 180), topZ)
  let covered = false
  for (let index = 0; index < positions.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, index)
    const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1)
    const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2)
    if ([a, b, c].every((vertex) => Math.abs(vertex.z - topZ) < 1e-8) && new THREE.Triangle(a, b, c).containsPoint(point)) { covered = true; break }
  }
  geometry.dispose()
  return covered
}

describe('target mesh lifecycle', () => {
  it.each([
    ['outer diameter', { outerDiameterMm: 500 }],
    ['hub radius', { hubRadiusMm: 70 }],
    ['plate thickness', { thicknessMm: 8 }],
    ['aperture width', { apertures: DUAL_APERTURE.apertures.map((item, index) => index ? item : { ...item, widthDeg: 45 }) }],
    ['aperture centre', { apertures: DUAL_APERTURE.apertures.map((item, index) => index ? item : { ...item, centreDeg: 35 }) }],
    ['aperture inner radius', { apertures: DUAL_APERTURE.apertures.map((item, index) => index ? item : { ...item, innerRadiusMm: 75 }) }],
  ])('%s changes the mesh geometry', (_, patch) => {
    const changed = { ...DUAL_APERTURE, ...patch }
    expect(targetGeometrySignature(changed)).not.toBe(targetGeometrySignature(DUAL_APERTURE))
    expect(targetGeometryFingerprint(changed)).not.toBe(targetGeometryFingerprint(DUAL_APERTURE))
  })

  it('disposes every old geometry and material over 100 rebuilds', () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose')
    for (let index = 0; index < 100; index += 1) {
      const resources = buildTargetResources({ ...DUAL_APERTURE, outerDiameterMm: 420 + index })
      resources.dispose()
    }
    expect(geometryDispose).toHaveBeenCalledTimes(200)
    expect(materialDispose).toHaveBeenCalledTimes(400)
    geometryDispose.mockRestore()
    materialDispose.mockRestore()
  })

  it('builds rim openings as contour notches without coincident hole boundaries', () => {
    expect(buildTargetShape(DUAL_APERTURE).holes).toHaveLength(0)
    expect(topFaceContains(DUAL_APERTURE, 0.14, 0)).toBe(false)
    expect(topFaceContains(DUAL_APERTURE, 0.16, 180)).toBe(false)
    expect(topFaceContains(DUAL_APERTURE, 0.15, 90)).toBe(true)
    expect(topFaceContains(DUAL_APERTURE, 0.02, 0)).toBe(true)
  })

  it('identifies only the currently selected target preset', () => {
    expect(matchesTargetPreset(DUAL_APERTURE, DUAL_APERTURE)).toBe(true)
    expect(matchesTargetPreset(DUAL_APERTURE, SINGLE_APERTURE)).toBe(false)
    expect(matchesTargetPreset(DUAL_APERTURE, TRIPLE_APERTURE)).toBe(false)
    expect(matchesTargetPreset({ ...DUAL_APERTURE, hubRadiusMm: 51 }, DUAL_APERTURE)).toBe(false)
  })
})

describe('hub source of truth', () => {
  it.each([20, 50, 95])('all views resolve %i mm to the same target radius', (hubRadiusMm) => {
    const target = { ...DUAL_APERTURE, hubRadiusMm }
    expect(hubRadiusTargetMm(target)).toBe(hubRadiusMm)
    expect(hubRadiusSceneM(target) * 1000).toBe(hubRadiusMm)
    expect(hubRadiusPreviewUnits(target, 100) / 100 * (target.outerDiameterMm / 2)).toBeCloseTo(hubRadiusMm)
    expect(hubRadiusSensorPixels(target, 2) / 2).toBe(hubRadiusMm)
  })
})
