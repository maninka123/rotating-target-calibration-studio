# Design decisions

This file records choices made where the specification allowed or required an implementation decision.

| Decision | Choice and rationale |
| --- | --- |
| Coordinate system | The target lies in the XY plane and sensor optical axes lie on +Z, looking toward the origin. This makes target-plane projection and the Three.js scene use the same convention. Positive target rotation is counter-clockwise in target coordinates. |
| Ray model | Every generated point begins as a double-precision ray direction and is intersected analytically with the target plane. Camera pixels are treated as individual rays in the target-region lattice; no render/read-back path is used. |
| Camera workload | The sampler generates all working-band rays plus a bounded contextual set of background rays. Pixels far outside the target cannot affect either estimator and are omitted. This keeps 200k-band-pixel NIR frames interactive while retaining every estimation sample. |
| Camera effective scale | The schema includes `targetFrameHeightFraction`. It is 0.234 for the wide-FOV FLIR and 0.51 for thermal/NIR, matching the specified on-target spans and exposing why image resolution alone does not determine band sampling. Focal length and pixel pitch remain visible physical metadata. |
| Nominal scan densities | Built-ins store a nominal C10 band density in the same JSON-serialisable schema. Counts scale with projected working-band area, stand-off squared and camera pixel count. These are architecture calibration metadata, not hard-coded branches in the sampler. |
| Sparse patterns | Rotating heads use discrete scan lines, prisms use acquisition-dependent incommensurate phases, the micro-mirror uses a sparse quasi-periodic scan, the electronic array uses a regular low-discrepancy lattice, and the rotating mirror uses a striped quasi-periodic pattern. |
| Non-repeating prism phase | Acquisition index advances an irrational-like phase, ensuring successive prism acquisitions do not start at the same rosette point. |
| Instantaneous convention | All sample observation times equal the acquisition time. Other conventions distribute true observation times over their configured span. This makes “instantaneous” a genuine distortion-free reference. |
| Estimator comparison truth | Error is measured against target angle at the sensor-reported timestamp. A sequential acquisition therefore exposes the intended timestamp-to-mean-observation offset. |
| Contour baseline | Boundary support is determined from class transitions. Dense or adequately supported frames use feature correspondence followed by the shared geometry objective; sparse four/eight-ring scans reject gracefully. Deterministic rare correspondence failures model intermediate-pattern 180° ambiguity. |
| Geometric optimizer | A one-degree global sweep is followed by golden-section refinement. Binary disagreement is softened only inside a 1.25° clipped boundary margin. All working-band samples participate. |
| Local uncertainty | Curvature uses symmetric 0.05° finite differences. The UI explicitly warns that near-zero dense-grid values are numerical conditioning, not total repeatability. |
| Mechanical span | The supplied deflection validation value of 2.73 mm is only obtained with the unsupported radial span `R − hub radius = 160 mm`, not the full 210 mm outer radius stated beside the equation. The implementation uses the unsupported span and documents this specification inconsistency. |
| Custom sensors | User definitions are persisted only in `localStorage`; configuration JSON remains the portable interchange mechanism. |
| Display decimation | Canvases cap display at approximately 20,000 samples by stride. Typed-array frames passed to estimators are never decimated. |
| Styling | Native system fonts avoid network font requests. The sole accent is teal; material, aperture and background use the same muted palette in every 2D/3D view. |
| GitHub Pages base | Production Actions builds use `/rotating-target-calibration-studio/`; local builds use `/`. This supports both repository-subpath deployment and normal local preview. |
| Browser support | Current evergreen browsers with Web Workers, WebGL2, typed arrays, modules, `structuredClone`, and `crypto.randomUUID` are targeted. |
