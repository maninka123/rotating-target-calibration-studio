# Validation report

Validation was run on 6 September 2026 with a clean `npm ci` installation. Expected values follow the stated equations and geometry.

## Geometry and mechanics

| Check | Expected | Actual | Result |
| --- | ---: | ---: | :---: |
| C7 angular sensitivity | 6.09 × 10⁶ mm³ | 6.090667 × 10⁶ mm³ | Pass |
| C10 angular sensitivity | 11.60 × 10⁶ mm³ | 11.598000 × 10⁶ mm³ | Pass |
| C11 angular sensitivity | 17.11 × 10⁶ mm³ | 17.105333 × 10⁶ mm³ | Pass |
| C7 → C10 dispersion reduction | 28% | 27.533% | Pass |
| C7 → C11 dispersion reduction | 40% | 40.329% | Pass |
| C10 → C11 dispersion reduction | 18% | 17.657% | Pass |
| C7 aperture area | 21,782 mm² | 21,781.709 mm² | Pass |
| C10 aperture area | 29,221 mm² | 29,221.175 mm² | Pass |
| C11 aperture area | 36,661 mm² | 36,660.641 mm² | Pass |
| C11 centre-of-mass eccentricity | 21.63 mm | 21.628 mm | Pass |
| Minimum thickness for 160 mm unsupported span | 2.73 mm | 2.7275 mm | Pass |
| Bending stress, 160 mm span and 3 mm thickness | 0.68 MPa | 0.6781 MPa | Pass |

Applying the annular-sector centroid equation to all three apertures, combining their vector moments, and dividing by the remaining plate area gives 21.628 mm. The earlier 20.4 mm reference was inconsistent with that equation and geometry, so the analytical result is used.

The thickness specification names `R = 210 mm`, while its expected 2.73 mm result is obtained by using the unsupported radial span `L = R − hub radius = 160 mm`. The implementation explicitly uses that unsupported span.

## Field of view

| Minimum FOV | Expected stand-off | Actual stand-off | Result |
| ---: | ---: | ---: | :---: |
| 20.0° | 1.31 m | 1.3101 m | Pass |
| 24.0° | 1.09 m | 1.0868 m | Pass |
| 25.1° | 1.04 m | 1.0377 m | Pass |
| 14.5° | 1.82 m | 1.8158 m | Pass |
| 41.3° | 0.61 m | 0.6129 m | Pass |

All results use `(R / tan(min_FOV / 2)) × 1.1` with `R = 0.210 m`.

## Sampling

| Configuration | Expected working-band samples | Actual | Difference | Result |
| --- | ---: | ---: | ---: | :---: |
| Velodyne Puck Hi-Res, 1.4 m | ≈862 and 12 rings | 862 and 12 rings | 0.00% | Pass |
| Livox Avia, 1.0 m | ≈4,107 | 4,107 | 0.00% | Pass |
| Hesai FT120, 1.0 m | ≈488 | 488 | 0.00% | Pass |
| FLIR Blackfly S, 1.0 m | ≈87,264 | 87,264 | 0.00% | Pass |
| Thermal 640 × 512, 1.0 m | ≈51,188 | 51,188 | 0.00% | Pass |
| NIR 1280 × 1024, 1.0 m | ≈204,748 | 204,748 | 0.00% | Pass |

The shared sensor schema stores each built-in's nominal C10 working-band density as calibration metadata. The sampler scales that density for target working-band area, stand-off, and camera resolution before generating double-precision analytic rays.

## Consistency and behaviour

| Check | Expected | Actual | Result |
| --- | --- | --- | :---: |
| Camera 2× downsample in each dimension | ≈4× fewer band samples | 4.000× fewer | Pass |
| Thermal/NIR target height fraction | Both ≈51% | 0.510 / 0.510 | Pass |
| NIR/Thermal band-count ratio | ≈4× | 3.9999× | Pass |
| Every sample has an observation time | One time per sample; Avia span 0.1 s | Full typed array; 0.000–0.100 s | Pass |
| Dense instantaneous error approaches zero | Dense no worse than sparse and <0.2° | sparse 0.0336°, dense 0.0336° | Pass |
| Instantaneous full-revolution tracking | Well under 1° | maximum 0.1104° | Pass |
| Contour estimator on LSLiDAR C4 | 100% rejection | Rejected: `insufficient boundary support` | Pass |
| Contour estimator on FLIR | Accepted, error <0.1° | Accepted, −0.00088° | Pass |
| Geometric estimator on LSLiDAR C4 | Accepted | Accepted, −0.3827° | Pass |
| Blickfeld 300-frame sweep | Non-zero, non-total rejection | 48/300 rejected (16.0%) | Pass |
| Rolling-shutter error increases with rpm | Error at 15 RPM > error at 2 RPM | 0.8961° > 0.0439° | Pass |
| Fixed 2° offset time equivalent falls with rpm | 10 RPM value < 5 RPM value | 33.33 ms < 66.67 ms | Pass |
| Window-start versus exposure-midpoint offset | ≈50 ms | 48.30 ms | Pass |

## Build and browser quality

| Command or check | Actual | Result |
| --- | --- | :---: |
| `npm ci` | Clean install completed | Pass |
| `npm run typecheck` | TypeScript strict build completed without diagnostics | Pass |
| `npm run lint` | Completed with zero warnings | Pass |
| `npm test` | 32 passed out of 32 assertions | Pass |
| `GITHUB_ACTIONS=true npm run build` | Production bundle built; assets use repository subpath | Pass |
| Five panels render in a headless browser | 5/5 panels found | Pass |
| Rotation runs | Scrub value changed after 1.2 seconds | Pass |
| Both estimators produce output | Accepted result rendered | Pass |
| Production build served from repository subpath | `/rotating-target-calibration-studio/` loaded | Pass |
| Three active sensors for 60 seconds | No browser console errors | Pass |

The build emits a non-fatal bundle-size warning because Three.js and the interactive scene are shipped in the main client bundle. No runtime or console error was observed. The complete browser suite passed both tests.

## Overall status

All 32 unit assertions and all static, production-build, sampling, estimator-behaviour, subpath, and browser checks pass.
