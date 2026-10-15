# post.ts — CVF (2026-10-15)

Order: scene → half-float 4× MSAA target (+ depth texture) → [SSAO + depth-aware blur] → [volume march + temporal resolve] → combine (`scene·AO·T + L`) → [depth of field] → 7 downsamples (13-tap, Karis-weighted first level) → lens ghosts from the ⅛-res mip → tent upsample (additive) → composite.

Composite: gate weave (per 24 fps frame) → barrel distortion (`distortion`, samples inward so no black corners) → radial chromatic aberration → optional film softness (4-tap blur mix) → bloom lerp (÷ level count) with lens dirt and halation tint → lens ghosts × (0.35 + dirt) → vignette → exposure → AgX → saturation → contrast (power around 0.3) → lift/gamma/gain → grain (`grainSize` px clumps, 24 fps) → flicker → fade → sRGB → dither.

Profiling: `pipeline.profiling` (D overlay) times passes with a 1-px readback sync; approximate on real GPUs, unreliable in SwiftShader — use `scripts/bench.mjs` ablations there.

SSAO (half resolution, 3×3 depth-aware blur): 16-sample view-space hemisphere ray test against the depth buffer, normals rebuilt from depth (smaller neighbour difference wins), radius grows slightly with distance, 3×3 depth-weighted blur. Fades out between 350 and 700 m and is skipped beyond: 24-bit depth error grows as z²·2⁻²⁴/near (0.1 m at 1 km, 12 m at 10 km); it reaches ¼ of the occlusion bias (0.02·R) at ~690 m. Distant terrain otherwise occludes itself in wavy dark horizontal bands (owner reports, Hill Station then Launch foothills at 0.5–2 km; a first 1–2 km fade was not enough). Verified by diffing AO on/off renders at 1080p. Applied before fog/volume so mist is not darkened. Per scene `ao: { radius, intensity }`.

Depth of field (`dof: { focus, strength }`, owner request: distant objects and lights slightly soft, like a video camera): only beyond focus, CoC = strength·(1 − focus/z) px at 1080 rows (scaled with render height). Full-resolution 16-tap golden-angle gather; samples behind the centre use the centre's CoC, samples in front need their own CoC to reach (in-focus foreground never bleeds into the blurred background). The composite mixes the blur in by full-res CoC. The sky gets CoC 0 so stars stay sharp for scintillation, but a distant ridge still blends softly into the sky. Half resolution was tried first: small CoCs turned distant lights into square blocks.

Streaks: thresholded ¼-res mip blurred horizontally twice (1.5 and 9 texel steps) → anamorphic-style horizontal flare on bright lights (`streak`, `streakTint`). Negative `softness` = sharpen.

Lens model (all per scene in `Grade`): `flare` ghosts (5 ghosts mirrored through centre with dispersion + halo ring, thresholded), `dirt` (procedural canvas texture: soft spots, rings, dust, smears; only visible where bloom/flare is bright), `distortion`, `aberration`. Point-light sprites carry their own diffraction cross (`spikes` in `addLightSprites`). Keep all of these subtle; the reference photos show only faint ghosts and crosses.

- AgX desaturates bright colours toward white. Saturated emissives (launch tower red) must stay moderate or they turn peach; beacon cores going orange-white is wanted.
- "80s film" (Launch): cyan gain, raised blue-green lift, softness 0.7, grain 0.055 at 2.1 px, weave 0.8, strong halation.
- Dither matters: dark 8-bit gradients band without it.
