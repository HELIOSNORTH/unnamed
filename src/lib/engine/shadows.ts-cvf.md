# shadows.ts — CVF (2026-10-15, ESM since round 5)

One 4096² directional shadow map, shared by all scenes, re-rendered when a scene becomes active (`Engine.swapTo`). Static per scene: casters don't move except swaying branches/leaves, which are ignored.

- Casters: every `Mesh`/`Points` whose material has `userData.shadow` = `'surface'` (depth-only shader), `'ribbon'` (ribbon vertex shader with `uResolution` = map size and `uMinPx` = 1, so sub-texel struts still cast a 1-texel shadow) or `'custom'` (uses `material.userData.depthMaterial`, e.g. leaf cards with alpha test). Everything else is hidden during the pass.
- Filtering = prefiltered exponential shadow maps (ESM, K = 700). Depth is blurred once per scene in log space (separable 13-tap Gaussian; `log(Σw·e^{K(d−d0)})/K + d0` avoids float overflow) into R32F. Receivers do one bilinear tap: `exp(K·(blurred − receiver))`. Replaced PCSS (16 blocker + 16 filter taps per pixel) on 2026-10-15 because Summit and Launch, the only shadowed scenes, were also the slowest on the owner's M1 Air.
- Penumbra width is fixed per scene from `lightAngle` (blur radius = lightAngle·120 m in texels, clamped 1–60). PCSS contact hardening is lost; at these scales (moon 0.0045 rad, overcast sun 0.05) it was not visible.
- `uShadowVol`: a 512² blurred copy for the fog volume (one tap per raymarch step, ~28 per pixel). Light shafts don't need 4096² detail, and a 64 MB map read 28× per pixel at random depths is cache-hostile on tile GPUs.
- ESM needs linear filtering of float textures (`OES_texture_float_linear`); without it the maps fall back to nearest (blockier, still correct).
- Bias = 0.0002 + 1 m in depth units, plus a 12 cm normal offset; surfaces facing away from the light (n·L < −0.35) are fully shadowed. Shadow box per scene: `shadow: { center, radius, depth, lightAngle }`; outside the box = lit.
- If shadows "do nothing", check the light direction first: with the key light from the side the Summit tower's 300 m shadow fell out of frame.
