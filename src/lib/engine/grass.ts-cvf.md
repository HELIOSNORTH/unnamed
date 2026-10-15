# grass.ts — CVF (2026-10-15)

3D grass tufts for a fixed camera: upright cards with a procedural blade atlas, the game-foliage approach. Owner asked for much better ground and grass on Launch.

- Placement is in the camera's view wedge only (`eye`, `yaw`, `halfAngle`), distance sampled as `near·(far/near)^u`, i.e. density ∝ 1/d² per m². Combined with card width growing ∝ d (capped by `maxGrow`), that keeps roughly constant on-screen density from `near` to `far`; beyond `far` the `GRASS` ground shader carries the look.
- Height never grows with distance (0.3–0.55 m). The first version scaled height too, and distant tufts became a 1.4 m dark hedge hiding building bases.
- Cards rotate around Y only (blades stay vertical); bottom sinks 5 cm into the ground; tips sway with `uWind`.
- Lighting, shadow, point lights and fog are computed per vertex (fog split into transmittance and in-scatter, `applyAtmosphere` is affine in colour). Fragment = one texture tap. Cards are 5–25 px, so it looks the same; per-fragment shading made them the second-largest cost on Launch.
- Dry patches use the same fbm as the ground shader, so tufts and ground agree at the transition.
- No shadow casting (tiny, would only add aliasing to the 4096² map).
