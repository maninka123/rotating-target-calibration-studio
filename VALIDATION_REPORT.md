# Validation report

Validation date: 7 September 2026. This report distinguishes automated checks, measured diagnostic runs and remaining limitations. Sampling counts are outputs of generated scan rays; no nominal band density or target sample count is stored in sensor definitions.

## Selected correctness repairs

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Asymmetric plate origin | Preserve XY origin for 120° aperture | X bounds −210 to +105 mm; thickness −1.5 to +1.5 mm | Pass |
| Frozen acquisition | Estimate displayed sample arrays without resampling | Worker accepts frame directly; core preserves arrays | Pass |
| Dense contour bias | Absolute error below 0.1° at cardinal and non-cardinal angles | Maximum 0.002147° across seven test angles | Pass |
| No apertures or zero-area apertures | Orientation unobservable | Both estimators reject; eccentricity and sensitivity are finite zero | Pass |
| Rotational symmetry | Reject orders 2 and 3 independently of grid | Both reject at 0.05°, 0.5°, 1°, 7°, 8°, 10° | Pass |
| Actual two-dimensional support | Reject coincident points and collinear samples | Covariance-rank checks reject even with electronic-array metadata | Pass |
| Resolution threshold | Quarter width/height gives about 16× fewer pixels | 103,276 → 6,436 (16.047×) with unchanged optical FOV | Pass |
| Static sweep | 0 RPM holds selected angle | All 20 acquisitions remain at 73° across two requested rotations; time errors null | Pass |
| Rotating sweep | Full-circle maximum gap ≤ 2 × 360/N | Positive-RPM circular-gap test passes | Pass |
| Touching sector union | Same area, moments and sensitivity as merged opening | Equal-radius sectors agree, including the 0° seam | Pass |
| Unequal-radius touching boundary | Count only the exposed radial segment | Analytical segment-integral test passes | Pass |
| Invalid target combinations | Reject hub/aperture/diameter inconsistency | Whole-target validation retains valid model state | Pass |
| JSON booleans and IDs | Reject string booleans, absent or duplicate instance IDs | Invalid-import regressions pass | Pass |
| Prism degeneracy and resource bounds | Reject zero combined deflection and oversized frames | Validation rejects both before allocation | Pass |
| Sweep settings | Reject invalid count, RPM, step and rotations | Core validation and numeric fields enforce finite ranges | Pass |
| Sample-count acceptance boundaries | Exactly 50 samples and 3/class evaluated | Existing expectations preserved with non-collinear fixtures | Pass |
| Intermediate checkpoints | Each acquisition saved once in ordered batches | Checkpoint sequence test covers all 20 acquisitions without duplicates | Pass |
| Intermediate visual output | Detection/template PNG for every sensor at each checkpoint | Browser save test observes generated PNG files; images use the actual checkpoint frame and estimator outputs | Pass |
| Sweep sensor identity | Human-readable name retained independently of current UI state | Record, summary, pairwise table, CSV and JSON tests preserve configured names | Pass |
| Saved run contents | Acquisition CSV, summary, configuration, pair offsets, explicit run options | All five files verified with a test directory handle | Pass |
| CSV escaping | Embedded quotes doubled | Quoted/comma field regression passes | Pass |
| Pitch eligibility | Only genuinely asymmetric elevation limits | Symmetric limits and camera definitions excluded | Pass |

## Measured contour behaviour

The corrected contour boundary endpoints use measured sample angles, not bin edges. This changes prior sweep statistics; the previous figures are superseded.

Full-resolution FLIR, noise-free scene, 0 RPM:

| True angle | Signed contour error |
| ---: | ---: |
| 0° | 0° |
| 13.17° | +0.002147° |
| 37.4° | +0.001163° |
| 90° | 0° |
| 180° | 0° |
| 270° | 0° |
| 359.8° | −0.000099° |

A fresh 300-acquisition Livox Avia contour sweep at 5 RPM, dual-aperture target and default sensor configuration produced:

| Accepted | Rejected | MAE | Median absolute error | SD | P95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 215/300 | 28.333% | 1.563443° | 1.520753° | 0.582809° | 2.530818° |

These are diagnostic outputs, not required error distributions. No acceptance rate or gross-error count is manufactured. Errors are measured against truth at the reported timestamp, so moving-scan timing contributes to them.

## Scan geometry checks retained

| Check | Actual | Result |
| --- | --- | --- |
| Rotating-head rings | 2, 6, 12, 18, 34, 66 | Pass |
| Every architecture / built-in | 7 architectures / 17 built-ins generate frames | Pass |
| Per-sample aperture classification | Uses each observation time | Pass |
| Working-band mean time | Matches direct mean of estimator-used samples | Pass |
| Camera crop timing | Report metadata independent of target crop | Pass |
| Camera FOV | Derived from optics; thermal 54.49° × 44.76° | Pass |
| Prism phase / integration | Consecutive indices differ; longer integration increases occupied bins | Pass for the implemented model |
| Micro-mirror density | Midline denser than vertical extremes | Pass for the implemented model |
| Level / centred Mid-360 | Clipped at pitch 0°, full at −22.5° at 1 m | Pass for the implemented model |
| Centred safe stand-off | 0.408 m with the same 10% margin as the 1.881 m level value | Documented specification discrepancy: 0.372 m omits that margin |

Informational band counts, dual-aperture target, default stand-offs and acquisition index zero:

| Sensor | Band samples |
| --- | ---: |
| LSLiDAR C4 | 222 |
| LSLiDAR C8 | 560 |
| Velodyne Puck Hi-Res | 888 |
| Velodyne HDL-32E | 1,758 |
| Ouster OS1-64 | 3,270 |
| Ouster OS1-128 | 6,558 |
| Livox Avia | 3,701 |
| Livox Horizon | 4,205 |
| Livox Tele-15 | 12,832 |
| Blickfeld Cube 1 | 1,703 |
| Hesai FT120 | 600 |
| Livox Mid-360, pitch 0° | 331 |
| Single-plane scanner | 180 |
| FLIR global / rolling | 103,276 each |
| Thermal 640 × 512 | 50,544 |
| Near-infrared 905 nm | 202,052 |

## Build and browser verification

| Check | Result |
| --- | --- |
| TypeScript strict typecheck | Pass |
| ESLint | Pass |
| Vitest | Pass — 169 tests in seven files |
| Production build | Pass — renderer remains lazy; approximately 847 kB renderer chunk emits a size advisory |
| Playwright | Pass — 7/7 tests, including the 60-second three-sensor run without console errors |
| 3D coverage legend | Pass — live sensor names, matching coverage colours and removal of inactive entries |

The browser suite includes exact worker-frame comparison, paused refresh, stale-result invalidation, valid/invalid geometry edits, focus retention during playback, zero-value entry, FOV warning fixes, named sweep tables, checkpoint PNG output, subpath loading and the existing 60-second three-sensor run. An initial parallel browser run timed out under shared rendering load; the final suite runs serially and passes in 1.5 minutes. The local run reused an explicitly started production preview because unopened loopback ports stalled readiness checks in this environment. CI retains automatic preview startup.

The first hosted CI run passed all unit/build checks and six of seven browser tests. Its dense-camera result assertion timed out at the implicit five-second limit. That asynchronous assertion now uses the same 30-second allowance as the other estimator-output assertion; the expected count and all numerical expectations are unchanged. Hosted rerun status is available in the repository's CI history.

The next hosted run exposed a race in the frozen-frame test's instrumentation: it used the latest worker reply even when that reply was discarded after pausing. The canvas now records the identity of the acquisition actually drawn, and the test compares its complete arrays with the estimator input. Empty/invalidated frames also clear their canvases while loading. The equality assertion is retained.

## Limits of this verification

- The 100-rebuild unit test verifies disposal calls. It does not measure GPU-memory growth; no memory benchmark is claimed.
- Browser metadata checks alone do not prove rendered mesh correctness. The new independent numerical mesh-bounds test catches the previously missed XY shift.
- The original 0-RPM full-revolution fixture was corrected to positive RPM because static sweeps must no longer rotate. Its circular-gap assertion is unchanged. Count-boundary fixtures now have non-collinear support so they test the count criteria separately from observability.
- Sampling is idealised. Rotating-head/mirror coverage volumes still use a different directional construction from fixed-height sampled rings; prism phase is acquisition-index based. These remaining audit items were outside the selected repair.
- The 500 ms angle update, fixed real-time badges, and synchronous sampling in sensor-configuration rendering remain known performance/presentation limitations outside this repair.
- Runtime prediction is a measured single-acquisition extrapolation with 35% allowance, not a timing guarantee. Folder access and checkpoint throughput depend on the browser and chosen storage.
- Cross-sensor time recovery assumes constant angular speed. Background distance remains visual only; camera sampling omits pixels outside the disc-enclosing crop.
