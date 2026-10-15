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

## M6 — Camera feel and resolution fallback (2026-10-15) ✅

Owner report (M1 Air): Beacon 20, Hill Station 12, Summit 15, Pylons 17, Launch 9 FPS.
- Automatic resolution fallback below 20 FPS: 1080p → 720p → 540p → 360p, per scene (engine.ts CVF).
- Depth of field on distant objects and lights (round bokeh), per-scene focus distance.
- Stars scintillate slightly. Summit glints are round in screen space (no more horizontal ovals).
- Pylons lens flare reduced. Launch darker again (exposure 0.34). Summit fog volume back to ½ res.

## M7 — Smarter resolution ladder (2026-10-15) ✅

Owner report (M1 Air): Beacon 22 FPS at 1080p, Hill Station 22 at 720p, Summit 25 at 720p and later 540p, Pylons 22 at 1080p, Launch 25 at 540p. Dark horizontal lines in the distance at 1080p and below.
- Ladder steps up above 45 FPS, starts over at native on every visit, median-based measurement.
- Dark distant lines were SSAO depth-precision self-occlusion → AO fades out by 2 km (tightened to 700 m in M8).
- No memory or GPU-object growth over time (3-minute run); drops over time are likely thermal.

## M8 — Ground and foliage (2026-10-15) ✅

Owner: FPS much better after M7. Asked for more fog on Beacon, a darker Launch, a fix for remaining dark lines on Launch at 1080p, and much better ground, grass and green trees.
- AO fade moved to 350–700 m (bands were on Launch's foothills).
- Launch: meadow ground shader, ~16k per-vertex-lit grass tufts, richer leaf atlas and shading, thicker trunks, exposure 0.27.
- Beacon: denser, higher ground fog; stronger light scatter.
- SwiftShader 480×270: Launch 633 → ~830 ms (mostly the meadow shader; grass tufts are within noise after per-vertex lighting).

## M9 — Next candidates

- Owner check of Launch FPS tier after the ground work.
- Same ground/foliage treatment for Hill Station (canopy) and Pylons (embankment) if wanted.
- Browser game: the scenes become levels (owner will specify). Runtime LOD for trees, grass and terrain once the camera moves freely.
- Listening pass on headphones and speakers; adjust per-voice levels.
- Drifting low cloud sheets on Hill Station.
