# materials.ts — CVF (2026-10-14)

All `ShaderMaterial`s output linear HDR with `applyAtmosphere` already applied. No tone mapping or colour space conversion here (post does it).

## Sky
Back-side sphere (r 20 km) that follows the camera; depth pushed to the far plane. Gradient zenith→horizon, then the same atmosphere as geometry so the horizon matches distant terrain exactly. Optional moon (disk with fbm maria, limb darkening, 3-term aureole), Milky Way band (great circle + fbm + dust lanes), cloud deck (plane at `height`, faded near the horizon because grazing angles stretch the noise into streaks).

## Surface
One shader with feature defines:
- `CANOPY` – worley crowns (two scales) bump the normal and darken gaps; detail fades with `fwidth` footprint to stop shimmer at distance.
- `SNOW` – snow vs rock by slope/height, wind-carved ripples (anisotropic fbm normal) near the camera, moon glints from a hashed micro-facet per 11 cm cell.
- `GRID` – facade panel lines from world coords on axis-aligned faces.
- `BAKED_SHADOW` – reads `aShade` (terrain shadow bake). Without the define vShade = 1. Before this define existed, meshes without the attribute read 0 and rendered unlit.

## Ribbons (towers, wires, branches)
Each segment is a quad expanded in screen space. Width = max(true pixel radius, `uMinPx`); alpha is scaled by true/visible width ("coverage"), so a 2 cm wire 400 m away is a faint 1 px line instead of flickering. Near-plane clipped in view space. `aFlex` per end drives wind sway (branches). `lightResponse` scales point lights on lines; lattice lit fully by a beacon next to it looked like a glowing rod.

## Points
Stars (direction-based extinction, horizon twinkle, fog) and lights (transmittance to the point, slight twinkle). Additive, no depth write. Size in CSS px × `viewport.pxScale`.
