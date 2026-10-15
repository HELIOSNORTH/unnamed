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

## M5 — Next candidates

- Owner measurement on the M1 Air per scene (D overlay); if Hill Station / Launch stay under 20 FPS, next levers are volume at ⅓ resolution for those two scenes and a lighter forest shader.
- Listening pass on headphones and speakers; adjust per-voice levels.
- Drifting low cloud sheets on Hill Station.
