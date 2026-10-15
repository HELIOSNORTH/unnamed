# Milestones

## M1 — Five scenes, playable (2026-10-14) ✅

- Render engine: analytic height fog + cloud slab + point/spot light in-scattering in every material, HDR MSAA, bloom, AgX, grade, 24 fps grain.
- Scenes: Beacon, Hill Station, Summit, Pylons, Launch Complex, tuned against the reference photos with the screenshot harness.
- Handheld camera (breath, slow drift, wind gusts, tremor) driven by the same wind signal as the audio.
- Blowing snow on Summit (GPU particles wrapped in a box around the camera, brighter toward the moon).
- Procedural soundscapes per scene with crossfades; loudness balanced to about −24 dB RMS by measurement.
- Glass UI: intro, scene title cards, navigation pill, mute, full screen, debug HUD.
- Single-file build published as a claude.ai artifact.

## M2 — Photo-matched atmosphere and ultra rendering (2026-10-14) ✅

- Raymarched volumetric mist (3D Perlin-Worley noise texture, quadratic jittered steps, temporal reprojection) on Hill Station, Summit, Launch Complex.
- Lens model: ghosts + halo with dispersion, procedural lens dirt, barrel distortion, diffraction crosses on point lights.
- Film stock controls: softness, grain size, gate weave; Launch Complex graded as a cyan 80s print.
- Light range falloff; per-scene photo comparison harness (`scripts/compare.mjs`, `scripts/compare-montage.py`).
- All five scenes re-composed and re-lit against their reference photos (band colours within ~10–15 RGB, object positions solved from photo pixel positions).

## M3 — Ultra pass (2026-10-15) ✅

- Always native resolution, all effects at maximum; FPS counter bottom right.
- 4096² PCSS shadow maps (Summit backlit by the moon, Launch soft sun), shadowed light shafts in the fog volume, SSAO.
- 96³ Perlin-Worley fog noise with domain warp and rotated octaves (fixes visible lines in moving fog).
- Lens: horizontal streaks, stronger ghosts and dirt, sharpen option.
- Textures: rebuilt snow (no aliasing streaks, stable glint sparkle), rebuilt forest canopy.
- Scenes: Beacon ground fog, Hill Station dark blue evening, Pylons grassy embankment instead of a black bar.

## M4 — Performance pass (2026-10-15) ✅

Owner report: 3–4 FPS on a MacBook Air M1 except Pylons (20+). Benchmarked with feature ablations; the fog volume was 55–70 % of the frame.
- Volume at half resolution with bilateral upsample, 28 steps, 2 noise fetches per step, GPU-generated 128³ noise.
- Light glow through fog moved from every material to the half-res volume pass.
- Ribbons shaded per vertex; cheaper Worley; derivative bumps; footprint-gated snow detail; sky drawn last; half-res SSAO; lighter PCSS (8+8, static rotation).
- Result (SwiftShader ms/frame at 480×270): Beacon 1483 → 233, Hill Station 1717 → 533, Summit 1033 → 350, Pylons 217 → 167, Launch 1600 → 617.
- Pylons: blinking aviation lights on every tower. Summit: blowing-snow particles removed (read as sparkles in the sky); snow glints only change with camera movement.

## M5 — Look and performance pass 2 (2026-10-15) ✅

Owner report (M1 Air): Beacon 19, Hill Station 16, Summit 10, Pylons 17, Launch 9 FPS. Summit and Launch are the only scenes with shadow maps, so the shadow path was the prime suspect.
- Shadows: PCSS (32 taps/pixel) → prefiltered ESM (1 tap); fog volume reads a separate 512² copy (cache-friendly).
- Fog volume resolution per scene; Summit and Launch at ⅓.
- Distant canopy skips its noise once crowns are sub-pixel.
- Launch: leaf-card trees with LOD replace the "green balls"; darker grade (same colours); floodlights, yard lights, aviation lights, strobe; streaks, ghosts, dirt.
- Lens: Beacon brought to Hill Station's level; more on Summit and Pylons.
- Hill Station: shore lights shrink with distance. Summit: stronger, denser ground sparkle.
- SwiftShader ms/frame at 480×270 (noise ±10 %): Beacon 217, Hill Station 550, Summit 333, Pylons 167, Launch 667. Roughly unchanged, as expected: the changes target GPU texture bandwidth and cache behaviour, which SwiftShader does not model. Needs an owner re-measure on the M1.

## M6 — Next candidates

- Owner re-measure on the M1 Air. If Summit/Launch are still under 20 FPS: the next levers are SSAO at ¼ resolution and lighter mountain terrain meshes (sub-pixel triangles cause quad overshading).
- Browser game: the scenes become levels (owner will specify). Runtime LOD for trees and terrain once the camera moves freely.
- Listening pass on headphones and speakers; adjust per-voice levels.
- Drifting low cloud sheets on Hill Station.
