# Rotating Target Calibration Studio

An interactive, browser-only laboratory for studying temporal calibration with a rotating apertured disc and heterogeneous LiDAR/camera sampling. It combines exact ray–plane intersection, true per-sample observation times, selectable reported-timestamp conventions, contour matching and a global geometric boundary fit.

## Scope

A standalone browser tool for exploring rotating-target geometry and
angle estimation. The scene is noise-free: no range noise, classification
error, boundary blur or radiometric effects. Accuracy shown here is an
optimistic bound, not measured hardware performance.

**[Open the live application](https://maninka123.github.io/rotating-target-calibration-studio/)**

![Animated 3D simulation demonstration](docs/simulator-demo.gif)

## Quick start

Requires Node.js 20.19+ or 22+.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser; there is no backend, ROS runtime, Python service, telemetry or external API.

Validate a production build:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

## What is included

- Live single-, dual- and triple-aperture target editing with sensitivity, removed area, centre-of-mass and plate checks.
- Seven shared sensor architectures and seventeen built-ins, each generated from its own scan kinematics rather than a stored density.
- One to three sensors with independent stand-off and timestamp conventions.
- A Three.js scene with rim-connected aperture cut-outs, architecture-specific translucent coverage geometry, a sensor-colour legend, distance annotations, orbit controls and optional coverage edges.
- Typed-array sample frames generated and estimated in a Web Worker.
- Frozen-frame contour and geometric estimation grouped once per sensor, with thick truth/recovered templates, angle-error tables and cost curves.
- Reviewed batch sweeps, independent background execution, error statistics, signed-error plots, cross-sensor time-offset recovery and organised result-folder export.
- Configuration JSON import/export and a persistent custom sensor builder.
- Six one-click teaching and validation scenarios.

Sweep mode repeats acquisitions over one or more target revolutions; at 0 RPM it holds the selected orientation. The review shows geometry, sensors, 0–20 RPM, revolution count and a completion estimate measured using a trial acquisition in this browser. It keeps a snapshot of the reviewed settings while the live view continues independently. Supported browsers save acquisition CSV, summary JSON, pairwise offsets, run settings and configuration in a timestamped folder. Optional checkpoints are written during the run. Other browsers download a JSON package; checkpoints are retained in memory until completion or cancellation. A Cancel sweep button stops computation and preserves completed checkpoints.

![Face-on rotation view](docs/rotation-view.png)

## Preset scenarios

- **Sparse ring failure:** demonstrates contour rejection with two target-crossing rings from a four-channel sensor.
- **Dense camera:** compares both estimators on global-shutter imagery.
- **Aperture ablation:** explores the single-, dual- and triple-aperture sensitivity progression.
- **Rolling shutter at rate:** contrasts global and sequential row exposure at speed.
- **LiDAR–camera offset:** recovers the configured accumulation-to-exposure time offset.
- **Resolution threshold:** reduces FLIR width and height by four and increases effective pixel pitch by four, retaining the optical FOV and reducing band samples approximately sixteenfold.

## Adding a custom sensor

Open **Panel 2 — Sensor configuration**, select **Build a custom sensor**, choose an architecture, enter its optics or FOV, stand-off and scan parameters, then save it. Camera FOV is derived from resolution, pixel pitch and focal length; it is never stored separately. The preview generates the resulting rays and reports the counted band samples before saving. Custom definitions use the same `SensorDefinition` schema and code path as built-ins and persist in browser `localStorage`.

For source-controlled sensors, add a JSON-serialisable object to `src/sensors/library.ts`. Architecture-specific optional fields are defined in `src/core/types.ts`.

## Implemented physics

For each sample ray, the target-plane intersection is evaluated analytically in double precision. Radius and polar angle determine material/aperture/background class at that sample’s own observation time. The background plane is visual only and does not affect analytic sampling. Rim-connected aperture cut-outs extend from their inner radii to the outer edge. Only the annulus from hub radius to outer radius enters estimation.

Rotating heads enumerate every channel and azimuth step, producing fixed-height scan rings. Risley-prism sensors trace acquisition-dependent rosettes. The micro-mirror uses a sinusoidal horizontal scan and a phase-shifted vertical scan whose triangular amplitude ramp produces an eye-shaped pattern. The Mid-360 uses its asymmetric −7° to +52° elevation limits, optional pitch and a non-repeating rotating-mirror pattern. Fixed arrays and cameras use rectangular angular grids; the single-plane scanner produces a zero-elevation fan.

Reported timestamps are defined explicitly: instantaneous means the first sample observation, accumulation-window start means the frame/window start, exposure midpoint means the midpoint of the full sample span, and rolling readout means the start of the first row exposure. Each rolling row is observed at the midpoint of its own exposure interval.

Angular sensitivity is

```text
Λ = Σ 2(R³ − ρₖ³) / 3
```

where isolated annular sectors each contribute two radial boundaries. Touching sectors use their geometric union: a shared boundary contributes only its exposed radial segment, and matching inner radii remove that boundary entirely. Angular dispersion scales as `SD ∝ Λ⁻¹ᐟ²`. A target with no angular boundaries has unobservable orientation.

Sector area is `α(R² − ρ²)/2`. Removed-sector centroid radius is

```text
r̄ = (2/3) (R³ − ρ³)/(R² − ρ²) · sin(α/2)/(α/2)
```

and remaining-plate eccentricity follows from removed-area moments. Plate checks use aluminium density 2700 kg/m³, `E = 70 GPa`, gravity 9.81 m/s² and a 0.05 mm deflection limit.

The geometric boundary-fit estimator performs a configurable-resolution global 0–360° class-agreement search, applies a clipped boundary tolerance, then refines the best interval by golden-section search. The default coarse search step is 1°. Its local curvature proxy describes numerical sharpness near the selected minimum; it is not a statistical uncertainty.

Both estimators reject unobservable and rotationally symmetric layouts before searching, independently of the search step. Two-dimensional support is measured from the working-band positions. Contour matching extracts angular regions and uses their measured end angles, avoiding a half-bin orientation offset. Frozen-frame estimation uses the exact displayed sample arrays. Paused geometry and sensor edits refresh those arrays and invalidate previous estimates.

Sweep plots distinguish each sensor/estimator series and name sensors consistently. Pairwise offset is defined as the first sensor's observation/report lag minus the second's; the table compares recovered offsets with the expected lags over the same accepted pairs. Recovery assumes constant angular speed and is undefined at 0 RPM.

![Estimation overlay](docs/estimation-overlay.png)

Sweep results collect the accuracy and rejection behaviour across a complete revolution.

![Sweep results](docs/sweep-results.png)

## Licence

MIT — see [LICENSE](LICENSE).
