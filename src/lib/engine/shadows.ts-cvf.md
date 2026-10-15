# shadows.ts — CVF (2026-10-15)

One 4096² directional shadow map, shared by all scenes, re-rendered when a scene becomes active (`Engine.swapTo`). Static per scene: casters don't move except swaying branches, which are ignored.

- Casters: every `Mesh` whose material has `userData.shadow` = `'surface'` (depth-only shader) or `'ribbon'` (the ribbon vertex shader with `uResolution` = map size and `uMinPx` = 1, so sub-texel struts still cast a 1-texel shadow). Everything else (sky, points, particles) is hidden during the pass.
- Receivers sample in GLSL (`atmosphere.ts`): `shadowFactor` = PCSS (16-tap blocker search, penumbra = (receiver − blocker depth) × `uvPerDepth`, 16-tap Poisson filter rotated per pixel). `uvPerDepth = depth·tan(lightAngle)/(2·radius)` so penumbrae widen with occluder distance like a real light of that angular size (moon 0.0045 rad, overcast sun ~0.05). `shadowHard` (1 tap) is used per raymarch step in the volume → shadowed light shafts.
- Bias = 0.0004 + 2 m in depth units, plus a 12 cm normal offset. Shadow box per scene: `shadow: { center, radius, depth, lightAngle }`; outside the box = lit.
- Verified by a debug render (shadowed = red, in-box = green) on Summit, 2026-10-15. If shadows "do nothing", check the light direction first: with the key light from the side the tower's 300 m shadow simply fell out of frame.
