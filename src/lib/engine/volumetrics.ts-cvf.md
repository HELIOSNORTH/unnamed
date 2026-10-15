# volumetrics.ts — CVF (2026-10-15)

Raymarched heterogeneous fog + all light glow through fog. Browsers expose no hardware ray tracing, so this is per-pixel raymarching.

- Half render resolution (ceil(w/2) × ceil(h/2)); `post.ts` combine pass upsamples bilaterally (4 taps, weights fall off with view-depth difference) so thin towers keep clean edges.
- March: `steps` (28 default in scenes) quadratically spaced samples up to `min(surface, range)`, jittered per pixel (IGN) and per frame (golden ratio), temporally accumulated (reprojected history, 3×3 clamp, 90 %). Per step: 1 warp fetch (BA channels) + 1 shape fetch (R main, G finer octave) of the 128³ noise, ambient + directional × `shadowHard` (1 shadow-map tap → shadowed shafts). No per-step light loop.
- Light glow (moved here from every material on 2026-10-15): once per half-res pixel and light, the closed-form ∫1/(h²+(t−b)²) along the full ray (sky → `uSkyDist`), times density at the closest-approach point = analytic fog/slab density × `uLightScatter` × HG(`uPhase`) + volume density (70 % smooth height profile, 30 % noise — pure noise there projected fire-like wisps) × `lights` × HG(0.6). Lights with `range` use a Gaussian falloff of the closest-approach distance (a hard window drew a visible disc). Lights whose bound contribution < 2e-4 are skipped.
- Scenes without `volume` still run this pass with `NO_VOLUME` (0 steps) for the glow.

Benchmarks (`scripts/bench.mjs`, SwiftShader, ms per frame, 480×270): Beacon 1483 → 233, Hill Station 1717 → 533, Summit 1033 → 350, Pylons 217 → 167, Launch 1600 → 617.
