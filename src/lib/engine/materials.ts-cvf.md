# materials.ts — CVF (2026-10-15)

All `ShaderMaterial`s output linear HDR with `applyAtmosphere` already applied. No tone mapping or colour space conversion here (post does it).

## Sky
Back-side sphere (r 20 km) that follows the camera; depth pushed to the far plane. Gradient zenith→horizon, then the same atmosphere as geometry so the horizon matches distant terrain exactly. Optional moon (disk with fbm maria, limb darkening, 3-term aureole), Milky Way band (great circle + fbm + dust lanes), cloud deck (plane at `height`, faded near the horizon because grazing angles stretch the noise into streaks).

## Surface
One shader with feature defines:
- `CANOPY` – crowns of varying size (worley) built from sub-clumps (second worley at 3.2×) plus leaf-scale noise; per-crown hue variety (yellow-green, olive, grey-green), near-black gaps via AO. Each detail level fades by its own `fwidth` footprint; once a crown cell is under ~1 px the shader branches to the mean canopy colour (no noise evaluated, no speckle). Earlier single-scale smooth crowns read as broccoli. Near trees you can walk up to should use `trees.ts` instead.
- `SNOW` – snow vs rock by slope/height; isotropic 3-octave normal detail, each octave faded by pixel footprint (the old stretched ripple pattern aliased into horizontal "hair" lines at grazing angles). Glints: per cell a random micro-facet normal, cell size = max(2.2 cm, next power of two of 2.4× pixel footprint); two offset layers, 70 % of cells chosen. The glint dot is shaped in screen pixels (world offset → tangent plane → inverse of the pixel Jacobian), radius ~1.5 px. A world-space round dot on ground seen at a grazing angle projected into horizontal ovals (owner report). facet spread ±0.65 around the normal, lobe pow 380, tinted cool/warm. Only changes with view direction (camera sway), fades out by 260 m. Strength per scene via `sparkle` (Summit 24; owner asked for more after 7).
- `GRASS` – meadow ground: dry/lush patches (same fbm as `grass.ts` tufts), worn earth patches, 0.35 m tufts (worley, per-tuft hue) and blade noise, each faded by pixel footprint; tuft AO; a grazing-angle sheen (blade tops catching sky light) added as extra sky ambient.
- `GRID` – facade panel lines from world coords on axis-aligned faces.
- `BAKED_SHADOW` – reads `aShade` (terrain shadow bake). Without the define vShade = 1. Before this define existed, meshes without the attribute read 0 and rendered unlit.

## Performance notes (2026-10-15)
- Ribbons are shaded per vertex (`RIBBON_SHADE`): lighting, shadow, fog in the vertex shader, fragment only does coverage AA. Lines are 1–3 px wide, so it looks the same; Beacon's 40k bush segments made per-fragment shading the top cost. Point lighting on lines is clamped (long guy-wire segments interpolated a beacon's near-field light along their whole length).
- Worley uses a 2×2 cell search (nearest-corner trick) instead of 3×3.
- Canopy crown and leaf bumps use screen-space derivatives of one height evaluation (solved for the xz gradient) instead of finite differences.
- Snow normal octaves are skipped once their frequency is below pixel size.
- Sky is drawn after opaque geometry (`renderOrder` 1, depth at 0.9999999·w) so hidden sky pixels are rejected by early-z.

## Ribbons (towers, wires, branches)
Each segment is a quad expanded in screen space. Width = max(true pixel radius, `uMinPx`); alpha is scaled by true/visible width ("coverage"), so a 2 cm wire 400 m away is a faint 1 px line instead of flickering. Near-plane clipped in view space. `aFlex` per end drives wind sway (branches). `lightResponse` scales point lights on lines; lattice lit fully by a beacon next to it looked like a glowing rod.

## Points
Stars (direction-based extinction, fog, scintillation: value-noise flicker at ~6–10 changes/s and slight colour flashes, both stronger toward the horizon where the air path is longer; kept small on purpose) and lights (transmittance to the point, slight twinkle). Additive, no depth write. Size in CSS px × `viewport.pxScale`. Optional `perspective: [refDist, minScale]` shrinks light points beyond `refDist` (∝ 1/distance, floor `minScale`): Hill Station's 9–23 km shore lights all had the same size and read flat.
