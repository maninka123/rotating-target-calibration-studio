# Validation report

Validated on 6 September 2026. Sampling is derived from scan geometry: no working-band sample count, ring count or target-span fraction is stored as a sensor constant. Counts below are outputs obtained by intersecting generated rays with the target plane.

## Geometry and mechanics

| Check | Expected | Actual | Result |
| --- | ---: | ---: | :---: |
| Single-aperture sensitivity | 6.09 × 10⁶ mm³ | 6.090667 × 10⁶ mm³ | Pass |
| Dual-aperture sensitivity | 11.60 × 10⁶ mm³ | 11.598000 × 10⁶ mm³ | Pass |
| Triple-aperture sensitivity | 17.11 × 10⁶ mm³ | 17.105333 × 10⁶ mm³ | Pass |
| Sensitivity dispersion reductions | 28%, 40%, 18% | 27.533%, 40.329%, 17.657% | Pass |
| Aperture areas | 21,782; 29,221; 36,661 mm² | 21,781.709; 29,221.175; 36,660.641 mm² | Pass |
| Triple-aperture eccentricity | 21.63 mm | 21.628 mm | Pass |
| Minimum plate thickness | 2.73 mm | 2.7275 mm | Pass |
| Bending stress | 0.68 MPa | 0.6781 MPa | Pass |
| Five minimum stand-offs | 1.31, 1.09, 1.04, 1.82, 0.61 m | 1.3101, 1.0868, 1.0377, 1.8158, 0.6129 m | Pass |

## Scan-geometry properties

| Check | Actual | Result |
| --- | --- | :---: |
| All seven architectures generate and classify rays | Non-empty band for every representative | Pass |
| All 17 built-ins load, fit at default stand-off and generate frames | 17/17 | Pass |
| Angular target extent at doubled stand-off | 1.979–2.000× reduction | Pass |
| Puck, array, rotating mirror and camera area scaling | 3.875–4.008× fewer band rays | Pass |
| Prism area scaling | Avia: 1.890× fewer | Pass within finite-pattern tolerance |
| Micro-mirror area scaling | 1.856× fewer | **Does not meet ≈4×** |
| Single-plane scaling | 2.000× fewer | **Does not meet ≈4×; expected for a line scan** |
| Direct ring enumeration | 4, 16 and 32-channel cases match | Pass |
| 2× camera downsampling in both dimensions | ≈4× fewer counted rays | Pass |
| Camera samples-across-target units | FLIR 373.33 px; thermal and NIR both 51% of frame height | Pass |
| Aperture/background classification invariants | Checked for every ray | Pass |
| Solid/open target ray-count invariance | Counts identical | Pass |
| Consecutive prism positions | Different | Pass |
| Consecutive fixed-array positions | Identical | Pass |
| Avia 100 ms trajectory complexity | More than 35 vertical crossings and more than 500 occupied spatial bins | Pass |
| Avia centre coverage | Minimum ray radius is inside the 50 mm hub | Pass |

The requested universal 4× band-count rule is not a geometry invariant for every finite non-uniform scan. The micro-mirror illuminates different portions of its pattern within a finite window, and a one-dimensional scanner scales with target diameter rather than area. These discrepancies are reported rather than tuning scan parameters to force a ratio.

## Informational band counts

| Built-in | Band rays | Built-in | Band rays |
| --- | ---: | --- | ---: |
| LSLiDAR C4 | 222 | LSLiDAR C8 | 552 |
| Velodyne Puck Hi-Res | 888 | Velodyne HDL-32E | 1,742 |
| Ouster OS1-64 | 3,246 | Ouster OS1-128 | 6,526 |
| Livox Avia | 3,701 | Livox Horizon | 4,205 |
| Livox Tele-15 | 12,832 | Blickfeld Cube 1 | 1,435 |
| Hesai FT120 | 600 | Livox Mid-360 | 372 |
| Single-plane scanner | 180 | FLIR Blackfly S | 103,276 |
| FLIR rolling readout | 103,276 | Thermal 640 × 512 | 50,544 |
| Near-infrared 905 nm | 202,052 |  |  |

These values are not assertions and are not used as sampler inputs.

## Estimation and integration

| Check | Actual | Result |
| --- | --- | :---: |
| Genuine sparse/dense camera comparison | 1,300/8,144 rays; 0.0596°/0.0177° mean error | Pass |
| Prism contour sweep, 300 acquisitions | median 1.50°, mean 12.12°, 18 errors above 90° | Pass |
| Micro-mirror sweep, 300 acquisitions | 119 rejections | Pass |
| Single-plane geometric rejection | `insufficient two-dimensional boundary coverage` | Pass |
| Both estimators on every architecture | No throw for 7/7 | Pass |
| Four timestamp conventions | Four distinct reported times | Pass |
| Custom sensor round-trip | Rays and classes identical | Pass |
| Configuration JSON round-trip | State identical | Pass |
| Six scenarios load and generate | 6/6 | Pass |
| Four aperture edge cases | 4/4 | Pass |
| Acceptance boundaries | 49/50 samples and 2/3 class samples distinguished | Pass |
| Geometry edits | Signature and vertex fingerprint change | Pass |
| Rim-connected aperture triangulation | Aperture probes open; material and hub probes covered; no coincident hole paths | Pass |
| Preset selection state | Only matching target geometry is selected | Pass |
| Local strict-mode worker lifecycle | Avia and FLIR live frames become non-empty; clock continues | Pass |
| Frozen-frame grouping | One sensor produces one output card with two estimator rows | Pass |
| 100 geometry rebuilds | 200 geometry and 400 material instances disposed | Pass |
| Hub consistency | 3D, preview and sensor conversions agree for 20, 50 and 95 mm | Pass |

## Build and browser status

| Check | Result |
| --- | :---: |
| TypeScript strict typecheck | Pass |
| ESLint with zero warnings | Pass |
| Unit suite: 109 tests | Pass |
| Production build | Pass |
| Main application chunk reduced from about 1,023 kB to about 190 kB | Pass |
| Three-dimensional renderer emitted as a lazy chunk | Pass |
| Browser interaction, all six panels and geometry edits | 3/3 checks pass |
| Header Play/Pause legibility | White label retained in hover state | Pass |
| Sweep progress feedback | Rotating target glyph, percentage and completed/total count render during work | Pass |
| Three-sensor 60-second run | Pass — non-zero live frames maintained; zero console errors |
| Ten-second README demonstration capture | 50 frames, 867 × 600 px, 2.4 MB | Pass |

The renderer chunk remains large when requested, but it no longer blocks the initial application bundle. The scene is deterministic and noise-free; reported estimator accuracy is an optimistic simulation bound.
