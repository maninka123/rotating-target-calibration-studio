# Validation report

Validated on 6 September 2026. Sampling is derived exclusively from generated scan geometry. No sample count, band density, target-span fraction or ring count is stored as a sensor constant.

## Correctness regressions

| Check | Expected | Actual | Result |
| --- | --- | --- | :---: |
| Estimator input isolation | No truth angle, acquisition index or frame truth available to estimator modules | Static source test passes; both estimators accept only `EstimatorInput` | Pass |
| Independent contour implementation | Boundary extraction, polygon approximation and correspondence; no geometric fallback | Inner/outer boundary chains form polygons and are matched by width/radius; unsupported or mismatched features reject | Pass |
| Corrected Avia contour sweep | Report honest behaviour; no encoded distribution | 300 frames: 217 accepted, 27.7% rejected, MAE 1.341°, median 1.275°, SD 0.636°, P95 2.380°; no artificial 180° errors | Pass |
| Sweep orientation | Full circular span; maximum gap ≤ `2 × 360/N` | Start angle is `360 × rotations × i/N`; circular-gap test passes | Pass |
| Pairwise offsets | S1→S2, S1→S3 and S2→S3 independently | Three distinct pair records produced | Pass |
| Circular differences | Wrapped across 0°/360° | Errors, pair differences, symmetry checks and optimizer trials wrap | Pass |
| Cost plot coordinates | Use stored angle values | Uses `costAnglesDeg[index] / 360` | Pass |
| Search resolution | Selected value reaches all search paths | Present in `EstimatorInput`; global grid and refinement use it | Pass |
| Symmetric targets | Reject comparable minima and state order | Twofold and threefold layouts reject as `orientation ambiguous` with order | Pass |
| Overlapping apertures | True union or reject at input | UI edits and JSON import reject overlap | Pass |
| Equal threefold eccentricity | Exactly 0 | 0 | Pass |
| Working-band mean time | Average estimator-used samples only | Direct recomputation matches frame metadata | Pass |
| Camera crop timing | Timestamp independent of crop | 200 mm and 600 mm targets report identical camera time | Pass |
| Worker failure | Pending calls reject rather than hang | Error handler rejects queue, clears it and recreates lazily | Pass |
| JSON validation | Reject invalid fields with clear cause | RPM, stand-off, aperture, optics, timestamp, timing and architecture fields covered | Pass |
| Numeric blank input | Must not write zero | Raw string retained; invalid value shown and not committed | Pass |

## Scan geometry and optics

| Check | Expected | Actual | Result |
| --- | ---: | ---: | :---: |
| Rotating-head rings | 2, 6, 12, 18, 34, 66 | 2, 6, 12, 18, 34, 66 | Pass |
| Mid-360 level coverage at 1 m | No rays below −7°; lower half about 41% clipped | Minimum elevation −7°; 41% of lower half outside | Pass |
| Mid-360 centred pitch | −22.5° gives −29.5°…+29.5° and full target | Limits and target coverage match | Pass |
| Level Mid-360 safe minimum | 1.881 m with 10% margin | 1.881 m | Pass |
| Centred Mid-360 minimum requested later | 0.372 m | 0.408 m with the same required 10% margin | **Fail — specification values use inconsistent margins** |
| Camera FOV source | Derived from optics only | No built-in camera stores FOV | Pass |
| Thermal FOV | 54.5° × 44.8° | 54.49° × 44.76° | Pass |
| FLIR band pixels from stated optics | Reconcile 87,264 versus pinhole result | 103,276; 87,264 is inconsistent with 1936×1464, 4.5 µm, 4 mm at 1 m | Pass |
| Camera 2× downsampling | About 4× fewer counted rays | Direct ray counts pass | Pass |
| Prism consecutive frames and fill | Different positions; coverage grows with integration | Both properties pass | Pass |
| Micro-mirror envelope | Eye-shaped, sparse at extremes | Midline density >2× extreme density; no extreme corners | Pass |
| Mid-360 path | Own non-repeating rotating-mirror path | Consecutive positions differ; prism code not used | Pass |
| All architectures/built-ins | Generate and classify without error | 7/7 architectures and 17/17 built-ins | Pass |

### Informational working-band ray counts

These are outputs, not assertions or calibration inputs.

| Built-in | Rays | Built-in | Rays |
| --- | ---: | --- | ---: |
| LSLiDAR C4 | 222 | LSLiDAR C8 | 560 |
| Velodyne Puck Hi-Res | 888 | Velodyne HDL-32E | 1,758 |
| Ouster OS1-64 | 3,270 | Ouster OS1-128 | 6,558 |
| Livox Avia | 3,701 | Livox Horizon | 4,205 |
| Livox Tele-15 | 12,832 | Blickfeld Cube 1 | 1,703 |
| Hesai FT120 | 600 | Livox Mid-360, pitch 0° | 331 |
| Single-plane scanner | 180 | FLIR Blackfly S | 103,276 |
| FLIR rolling readout | 103,276 | Thermal 640 × 512 | 50,544 |
| Near-infrared 905 nm | 202,052 |  |  |

## Timing, state and rendering

| Check | Actual | Result |
| --- | --- | :---: |
| Rolling row timing | Row exposure midpoint = row start + half exposure | Pass |
| Timestamp definitions | First observation; window/frame start; sample-span midpoint; first-row start | Pass |
| Shared rotation clock | Base angle/time origin resets on play, RPM, manual angle, scenario and import | Pass |
| One target orientation | 3D and face-on views consume the application angle; no private counters | Pass |
| Geometry rebuild/disposal | 100 changes dispose 200 geometry and 400 material resources | Pass |
| Hub consistency | Shared target radius conversion across 3D, preview and sensor plot | Pass |
| Coverage shapes | Bands, prism cone, sparse eye envelope, planar fan and rectangular camera/array pyramids | Pass |
| Background distance | Explicitly documented as visual only | Pass |
| Sweep review | Geometry image, optics/FOV, RPM, revolutions, total acquisitions, destination and conservative time | Pass |
| Sweep presentation | Error statistics, signed-error plot, histogram, timing plot and pairwise table | Pass |

## Automated quality checks

| Command/check | Result |
| --- | :---: |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass — 133 tests |
| `npm run build` | Pass |
| Three.js lazy chunk | Pass — renderer remains outside initial application chunk |
| Playwright added to CI | Pass |
| Playwright local browser suite | Pass — 3/3, including a 60-second three-sensor run with zero console errors |

The centred-pitch stand-off is the sole known numerical mismatch. The 0.372 m value equals `0.21/tan(29.5°)` without a margin, while the level 1.881 m value includes the mandated 10% margin. The implementation applies the safety margin consistently instead of switching definitions with pitch.
