import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { DUAL_APERTURE } from '../core/presets'
import { hubRadiusPreviewUnits, hubRadiusSceneM, hubRadiusSensorPixels, hubRadiusTargetMm } from '../core/viewGeometry'
import { targetGeometrySignature } from '../core/viewGeometry'
import { buildTargetResources, targetGeometryFingerprint } from '../scene/TargetMesh'

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
