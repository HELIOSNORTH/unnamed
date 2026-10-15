# post.ts — CVF (2026-10-14)

Order: scene → half-float 4× MSAA target (+ depth texture) → [SSAO + depth-aware blur] → [volume march + temporal resolve] → combine (`scene·AO·T + L`) → 7 downsamples (13-tap, Karis-weighted first level) → lens ghosts from the ⅛-res mip → tent upsample (additive) → composite.

Composite: gate weave (per 24 fps frame) → barrel distortion (`distortion`, samples inward so no black corners) → radial chromatic aberration → optional film softness (4-tap blur mix) → bloom lerp (÷ level count) with lens dirt and halation tint → lens ghosts × (0.35 + dirt) → vignette → exposure → AgX → saturation → contrast (power around 0.3) → lift/gamma/gain → grain (`grainSize` px clumps, 24 fps) → flicker → fade → sRGB → dither.

Profiling: `pipeline.profiling` (D overlay) times passes with a 1-px readback sync; approximate on real GPUs, unreliable in SwiftShader — use `scripts/bench.mjs` ablations there.

SSAO (half resolution, 3×3 depth-aware blur): 16-sample view-space hemisphere ray test against the depth buffer, normals rebuilt from depth (smaller neighbour difference wins), radius grows slightly with distance, 5×5 depth-weighted blur. Applied before fog/volume so mist is not darkened. Per scene `ao: { radius, intensity }`.

Streaks: thresholded ¼-res mip blurred horizontally twice (1.5 and 9 texel steps) → anamorphic-style horizontal flare on bright lights (`streak`, `streakTint`). Negative `softness` = sharpen.

Lens model (all per scene in `Grade`): `flare` ghosts (5 ghosts mirrored through centre with dispersion + halo ring, thresholded), `dirt` (procedural canvas texture: soft spots, rings, dust, smears; only visible where bloom/flare is bright), `distortion`, `aberration`. Point-light sprites carry their own diffraction cross (`spikes` in `addLightSprites`). Keep all of these subtle; the reference photos show only faint ghosts and crosses.

- AgX desaturates bright colours toward white. Saturated emissives (launch tower red) must stay moderate or they turn peach; beacon cores going orange-white is wanted.
- "80s film" (Launch): cyan gain, raised blue-green lift, softness 0.7, grain 0.055 at 2.1 px, weave 0.8, strong halation.
- Dither matters: dark 8-bit gradients band without it.
