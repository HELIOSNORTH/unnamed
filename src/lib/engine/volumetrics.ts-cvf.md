# volumetrics.ts — CVF (2026-10-14)

Raymarched heterogeneous fog ("the ray-traced fog"). Browsers expose no hardware ray tracing (WebGL2 and WebGPU alike), so this is per-pixel raymarching in a fragment shader.

- Runs at full render resolution after the scene pass. Reads the scene depth texture (MSAA target with `depthTexture`, resolved by three), reconstructs the view ray and the surface distance, marches `steps` samples up to `min(surface, range)`. Samples are quadratically spaced (dense near the camera) and jittered per pixel (interleaved gradient noise) and per frame (golden-ratio offset).
- Density: `density · min(exp(−falloff·(y−base)), 6)` modulated by two fetches of the 64³ tileable cloud noise (`noise3d.ts`) drifting with `wind`. `coverage` is the noise threshold, `noiseStrength` blends uniform ↔ patchy.
- Lighting per sample: ambient (mix of `ground` and `ambient`), the scene's directional light × HG(g=0.55) × `sun`, every scene light with its spot cone, range window and HG(g=0.6) × `lights`. No shadowing.
- Output RGBA = (in-scattered light, transmittance). Combine pass: `scene · T + L`, before bloom so mist glows.
- Temporal resolve: reprojects the end point (surface, or `range` for sky) with last frame's view-projection, clamps history to the 3×3 neighbourhood of the current frame, blends 88 % history. History resets on resize and scene change.
- Coexists with the analytic fog in `atmosphere.ts`: analytic = km-scale homogeneous aerial perspective; volume = local patchy mist within `range`. Scenes without `volume` skip both passes.
- Thin ribbons write depth; their uncovered sub-pixel fraction gets the line's fog, not the sky's. Accepted (barely visible).
