# Physics and simulation model

This document describes the models implemented by Rotating Target Calibration Studio. The application runs entirely in the browser with no backend, ROS runtime, Python service, telemetry or external API. The simulation is intentionally noise-free: it does not add range noise, classification error, boundary blur or radiometric effects. Its accuracy is therefore an optimistic numerical bound, not measured hardware performance.

## Sampling and classification

The target lies in a plane normal to each sensor's optical axis. Every sample begins as a double-precision ray direction and is intersected analytically with that plane. Sampling never reads pixels back from the Three.js renderer.

The target-plane hit is expressed by its radius and polar angle. At the sample's own observation time it is assigned one of three classes:

- **Material:** the hit lies on the remaining target face.
- **Aperture:** the hit lies inside an aperture and the ray passes through the target.
- **Background:** the ray misses the outer disc or passes through an aperture to the background.

Apertures are annular sectors connected to the outer rim. Each begins at its configured inner radius and extends to the target's outer radius. The working band is the annulus between the hub radius and the outer radius; only samples in this band enter either estimator.

The background plane and its adjustable distance are visual aids in the 3D scene. Background distance does not affect analytic ray generation or estimation.

Sample frames use typed arrays. The sampling and estimation workloads run in Web Workers. When a view contains more than about 20,000 samples, only the displayed points are decimated; the estimator always receives the full working-band data.

## Sensor architectures

All built-ins and user-created sensors use the same JSON-serialisable `SensorDefinition` schema and architecture-specific sampling paths. The interface supports one to three active sensors with independent stand-off and timestamp conventions. Working-band count is obtained by counting generated rays, never by scaling a stored density.

### Rotating multi-channel head

Channel elevations are distributed uniformly across the vertical field of view. Every channel is paired with azimuth steps covering 360°. The target-plane height of a channel is fixed at `d tan(θ)`, producing a scan ring. Sample time advances with azimuth.

The built-ins are LSLiDAR C4, LSLiDAR C8, Velodyne Puck Hi-Res, Velodyne HDL-32E, Ouster OS1-64 and Ouster OS1-128.

### Counter-rotating prism

The Risley-prism model adds two rotating wedge deflections with different rates. The resulting trajectory is an acquisition-dependent rosette that fills progressively with integration time. Acquisition phase advances between frames so consecutive patterns differ.

Livox Avia is represented by a non-repetitive multi-line rosette mode. Livox Horizon and Livox Tele-15 use the same kinematic family with their own field of view, rates and wedge parameters. The 3D coverage envelope is elliptical rather than rectangular.

### Oscillating micro-mirror

The Blickfeld Cube 1 model uses a sinusoidal horizontal scan. Its vertical scan is phase-shifted by `π/4` and multiplied by a triangular amplitude ramp that rises from zero to one and then falls to zero during the frame. This produces sparse, eye-shaped coverage rather than a filled rectangle.

The reference configuration uses a 70° × 30° field of view, 200 scan lines, a 1 kHz mirror eigenfrequency and a 97 kHz pulse rate. Frame duration follows from scan-line count and eigenfrequency.

### Rotating mirror

Livox Mid-360 uses a dedicated non-repeating rotating-mirror path at 200,000 points/s and 10 Hz. Its native vertical coverage is asymmetric: −7° to +52°. Pitch is added to both limits and to every generated ray. At zero pitch the lower portion of a nearby centred target is clipped; `−22.5°` centres the coverage.

### Solid-state array

Hesai FT120 produces a fixed rectangular grid of angular ray directions. Consecutive acquisitions therefore have identical sample positions for unchanged geometry.

### Single-plane scanner

The single-plane scanner steps only in horizontal angle. All rays have zero elevation, forming a flat fan. Because its samples have no two-dimensional spread, the geometric estimator rejects the frame for insufficient two-dimensional boundary coverage.

### Camera

Each evaluated pixel produces a pinhole ray derived from image resolution, pixel pitch and focal length. Camera field of view is calculated as

```text
FOV = 2 atan(resolution × pixel pitch / (2 × focal length))
```

and is never stored independently. Global-shutter pixels share an exposure midpoint. Rolling-shutter row times advance through the readout.

The built-ins are FLIR Blackfly S global shutter, FLIR Blackfly S with 20 ms rolling readout, Thermal 640 × 512 and Near-infrared 905 nm. Pixels outside the square crop enclosing the projected disc are omitted because they cannot enter the estimator; row timestamp metadata is still derived from the full image.

### Scene representation

The Three.js view uses architecture-specific translucent coverage geometry: full annular bands for rotating heads, a rotating-mirror band, elliptical cones for prism sensors, a faint micro-mirror envelope, a flat fan for the single-plane scanner, and rectangular pyramids for arrays and cameras. The scene includes a sensor-colour legend, distance annotations, orbit controls and optional coverage edges. It is explanatory; all calculations use analytic rays.

## Timestamp conventions

Every sample retains its individual observation time. The acquisition's reported timestamp is a separate value:

| Convention | Reported time is |
|---|---|
| Instantaneous | The first sample observation |
| Accumulation-window start | The frame or window start |
| Exposure midpoint | The midpoint of the full sample span |
| Rolling readout | The start of the first row exposure |

Each rolling-shutter row is observed at the midpoint of its own exposure interval. Distinguishing per-sample observation time from reported time is what produces intra-acquisition geometric distortion and recoverable temporal offsets.

## Angular sensitivity and plate checks

For isolated annular sectors, angular sensitivity is

```text
Λ = Σ 2(R³ − ρₖ³) / 3
```

where `R` is target outer radius and `ρₖ` is aperture inner radius. The sum is over exposed radial aperture boundaries. Touching sectors use their geometric union: a shared boundary contributes only its exposed radial segment, and matching inner radii remove that boundary entirely. Angular dispersion scales as `SD ∝ Λ⁻¹ᐟ²`. A layout with no angular boundary is unobservable.

Sector area is

```text
A = α(R² − ρ²) / 2
```

and removed-sector centroid radius is

```text
r̄ = (2/3) (R³ − ρ³)/(R² − ρ²) · sin(α/2)/(α/2)
```

Remaining-plate eccentricity is calculated from the combined removed-area moments. The self-weight plate checks use:

- aluminium density `2700 kg/m³`;
- elastic modulus `E = 70 GPa`;
- gravitational acceleration `g = 9.81 m/s²`;
- tip-deflection limit `0.05 mm`.

The unsupported mechanical span is the outer radius minus the hub radius.

## Estimators

Both estimators receive only classified target-plane positions, sample observation times, target geometry and estimator settings. Ground truth is supplied later when error is calculated.

### Geometric boundary fit

The geometric estimator performs a configurable-resolution global 0–360° search for the orientation that best agrees with observed sample classes. Per-sample disagreement is clipped near geometry boundaries. The interval around the global coarse minimum is refined with golden-section search. The default coarse search step is 1°.

The reported local curvature proxy describes numerical sharpness near the selected minimum. It can approach numerical zero in dense regular sampling and is not a statistically justified uncertainty.

Before searching, the estimator rejects unobservable and rotationally symmetric target layouts independently of search resolution. It measures two-dimensional support from the actual working-band sample covariance rather than inferring support from the sensor architecture. It also enforces sample-count, class-support and minimum-cost criteria.

### Contour matching

The contour estimator extracts aperture-supported angular regions from classified samples, builds inner and outer polygon chains, and matches measured widths, inner radii and endpoints against the known aperture set. Measured end angles avoid a half-bin orientation offset. It rejects when boundary support is insufficient or a reliable correspondence cannot be formed; it does not fall back to the geometric estimator.

### Frozen frames

Pausing freezes the displayed acquisition. Both estimators run on those exact sample arrays, including acquisition-dependent non-repeating patterns. Changing target geometry, sensor settings, RPM or manual orientation while paused generates a replacement frame and invalidates obsolete estimates.

## Sweeps and export

Sweep mode repeats acquisitions over one or more revolutions. At positive RPM, acquisition start orientations span the requested rotations. At 0 RPM, every acquisition holds the selected orientation while non-repeating sensor phase may still advance.

Before computation, the review dialog displays the target geometry, active sensors, RPM, rotations, total acquisitions, selected estimators and destination. This reviewed configuration is copied into an immutable run snapshot, so the live views can continue independently. Completion time is estimated from a measured trial acquisition in the current browser with a 35% allowance; it is not a timing guarantee.

The results report MAE, median absolute error, SD, P95 and rejection rate for each sensor/estimator pair. Signed-error plots, histograms and timing plots carry the readable sensor name captured in the run, as do CSV and JSON records.

Where the File System Access API is available, the application creates a timestamped folder containing:

- `sweep-results.csv`;
- `sweep-summary.json`;
- `configuration.json`;
- `run-settings.json`;
- `pairwise-offsets.json`.

When intermediate saving is enabled, each checkpoint has its own subfolder. It contains acquisition CSV and one 960 × 600 PNG per sensor, drawn from the actual checkpoint acquisition with classified detections, dashed ground-truth boundaries, accepted recovered templates and angle-error labels. These images use display-decimated points only; the sweep estimates remain full-density.

Browsers without folder access download one self-contained JSON data package. Checkpoint records remain in memory until completion or cancellation. A Stop sweep control terminates only the batch worker. Once at least one-third of the requested rotations has completed, the saved checkpoint records are summarised through the same tables and plots as a completed run and written as partial output. An earlier stop reports that angular coverage is not yet representative and does not show partial statistics.

For two or more sensors, pairwise offset is defined as the first sensor's observation/report lag minus the second sensor's lag. Recovered offset and expected lag are calculated from the same accepted acquisition pairs. Recovery assumes constant angular speed and is undefined at 0 RPM.

### Preset scenario details

- **Sparse ring failure** uses a four-channel rotating head with two target-crossing rings to demonstrate contour rejection.
- **Dense camera** runs both estimators on global-shutter imagery.
- **Aperture ablation** compares the sensitivity of single-, dual- and triple-aperture targets.
- **Rolling shutter at rate** compares global exposure with sequential row exposure.
- **LiDAR–camera offset** recovers the configured accumulation-to-exposure lag.
- **Resolution threshold** quarters FLIR width and height while increasing effective pixel pitch fourfold. Optical FOV is retained and working-band count falls by approximately sixteen times.

## Adding a custom sensor

In **Panel 2 — Sensor configuration**:

1. Open **Build a custom sensor**.
2. Select an architecture and enter a name.
3. Set stand-off, timestamp convention and architecture-specific parameters.
4. Review the generated sample count, working-band count and samples across the target.
5. Save the sensor.

For cameras, set resolution, pixel pitch and focal length. FOV is derived from those optics and is never stored as an independently editable camera value. The preview generates real rays with the shared sampler before saving.

Custom definitions use the same `SensorDefinition` schema and code path as built-ins. They persist in browser `localStorage`; full configuration JSON export and import provide the portable interchange format.

To add a source-controlled built-in, add a JSON-serialisable definition to `src/sensors/library.ts`. Architecture-specific optional fields are defined in `src/core/types.ts`.

### Local validation

Run the same checks used by continuous integration:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```
