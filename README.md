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

### Sweep workflow

Before a sweep starts, a review dialog shows the target, sensors, RPM, number of rotations, acquisition count and an estimated completion time. The reviewed settings are frozen for the batch, while the live simulation remains independent.

During a sweep:

- positive RPM distributes acquisitions across the requested revolutions;
- 0 RPM keeps the selected orientation fixed;
- progress and completed acquisitions remain visible;
- cancellation preserves checkpoints already completed.

Supported browsers create a timestamped results folder containing CSV and JSON summaries with readable sensor names. Optional checkpoint folders add one detection/template PNG per sensor. Browsers without folder access download one JSON data package instead.

![Face-on rotation view](docs/rotation-view.png)

## Preset scenarios

- **Sparse ring failure:** demonstrates contour rejection with two target-crossing rings from a four-channel sensor.
- **Dense camera:** compares both estimators on global-shutter imagery.
- **Aperture ablation:** explores the single-, dual- and triple-aperture sensitivity progression.
- **Rolling shutter at rate:** contrasts global and sequential row exposure at speed.
- **LiDAR–camera offset:** recovers the configured accumulation-to-exposure time offset.
- **Resolution threshold:** reduces FLIR width and height by four and increases effective pixel pitch by four, retaining the optical FOV and reducing band samples approximately sixteenfold.

## Adding a custom sensor

Use **Panel 2 — Sensor configuration**:

1. Open **Build a custom sensor**.
2. Choose an architecture and enter a name.
3. Set the stand-off, timing and architecture-specific scan parameters.
4. Review the generated ray count, working-band samples and samples across the target.
5. Save the sensor.

For cameras, enter resolution, pixel pitch and focal length. The application derives the FOV from those optics, so camera FOV is not entered separately.

Saved custom sensors use the same `SensorDefinition` schema and sampling path as built-ins. They persist in browser `localStorage` and can be carried with a full configuration JSON export.

To add a built-in sensor in source code, add a JSON-serialisable definition to `src/sensors/library.ts`. Architecture-specific fields are defined in `src/core/types.ts`.

## Implemented physics

### Ray sampling and classification

Every sample is an analytic, double-precision ray–plane intersection—never a rendered pixel read-back. At each sample’s own observation time, its target-plane radius and angle determine one of three classes:

- **Material:** the ray hits the solid target face.
- **Aperture:** the ray passes through a rim-connected cut-out.
- **Background:** the ray misses the target or passes through an aperture.

Only samples in the working annulus—from the hub radius to the outer radius—enter estimation. The background-plane distance is visual only and does not alter analytic sampling.

### Sensor scan patterns

- **Rotating heads:** every channel elevation and azimuth step is generated, producing fixed-height scan rings.
- **Risley prisms:** acquisition-dependent, non-repeating rosettes fill progressively over time.
- **Oscillating micro-mirror:** sinusoidal horizontal motion and phase-shifted, ramped vertical motion form an eye-shaped pattern.
- **Livox Mid-360:** a non-repeating rotating-mirror pattern uses asymmetric −7° to +52° elevation limits and optional pitch.
- **Solid-state arrays and cameras:** rectangular angular grids derived from array geometry or camera optics.
- **Single-plane scanner:** a horizontal fan with zero elevation extent.

### Per-sample time and reported timestamps

Sample observation time follows the device’s scan order. The reported acquisition timestamp is configured separately:

- **Instantaneous:** first sample observation.
- **Accumulation-window start:** start of the frame or accumulation window.
- **Exposure midpoint:** midpoint of the complete sample span.
- **Rolling readout:** start of the first row exposure; each row is observed at the midpoint of its own exposure interval.

This distinction is what allows the simulator to expose intra-acquisition distortion and timestamp offsets.

### Target sensitivity

Angular sensitivity is

```text
Λ = Σ 2(R³ − ρₖ³) / 3
```

where `R` is the outer radius and `ρₖ` is an aperture’s inner radius. Isolated sectors each contribute two radial boundaries. Touching sectors use their geometric union: only exposed boundary segments contribute, and a shared boundary with matching inner radii disappears entirely.

Angular dispersion scales as `SD ∝ Λ⁻¹ᐟ²`. A target without angular boundaries has no observable orientation.

### Area and mechanical checks

Sector area is `α(R² − ρ²)/2`. Removed-sector centroid radius is

```text
r̄ = (2/3) (R³ − ρ³)/(R² − ρ²) · sin(α/2)/(α/2)
```

The remaining-plate eccentricity follows from the combined removed-area moments. Plate checks use:

- aluminium density: `2700 kg/m³`;
- elastic modulus: `70 GPa`;
- gravity: `9.81 m/s²`;
- tip-deflection limit: `0.05 mm`.

### Orientation estimators

- **Contour matching** extracts aperture-supported angular regions and matches their measured widths, inner radii and endpoints to the known target geometry.
- **Geometric boundary fit** searches 0–360° for the best class agreement, applies a clipped boundary tolerance, then refines the best interval with golden-section search. The default coarse step is 1°.

Both estimators reject unobservable or rotationally symmetric layouts before searching. They also verify two-dimensional support from the actual working-band positions. The displayed local curvature proxy describes numerical sharpness near the geometric minimum; it is not a statistical uncertainty.

Frozen-frame estimation uses the exact displayed sample arrays. Changing target or sensor settings while paused refreshes those arrays and invalidates obsolete results.

### Sweep statistics and sensor timing

Sweep mode reports MAE, median absolute error, SD, P95 and rejection rate for every sensor/estimator pair. Plots show signed error against true angle, error distributions and mean observation-time offsets.

Pairwise offset is defined as the first sensor’s observation/report lag minus the second’s. Recovered and expected offsets use the same accepted acquisition pairs. Recovery assumes constant angular speed and is undefined at 0 RPM.

![Estimation overlay](docs/estimation-overlay.png)

Sweep results collect the accuracy and rejection behaviour across a complete revolution.

![Sweep results](docs/sweep-results.png)

## Licence

MIT — see [LICENSE](LICENSE).
