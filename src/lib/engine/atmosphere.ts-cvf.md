# atmosphere.ts — CVF (2026-10-14)

Shared GLSL (`glslCommon`) + one uniform set per scene. Every scene material spreads the same uniform objects, so updating `uTime`, lights, wind once per frame updates all shaders.

## Why forward fog
Fog is applied per fragment in each material (`applyAtmosphere(col, worldPos)`), not as a depth post pass. Towers are sub-pixel ribbons; a depth pass after MSAA resolve fogs edge pixels with the wrong depth → bright halos around every strut. Forward fog keeps MSAA correct.

## Model
- Height fog: density `uFogDensity·exp(−uFogFalloff·(y−uFogBase))`, optical depth integrated in closed form along the ray (IQ "better fog"). Inscatter colour = `fogInscatter(rd)`: low/high colours by view elevation + a directional glow lobe (`uGlowDir`, moon or city dome).
- Cloud slab: horizontal layer `uSlab = (bottom, top, density, noiseScale)`; path length through the slab is exact, density is modulated by 2D fbm sampled at two points on the in-slab segment. Cheap cloud sea / mist bands with no extra geometry. Camera inside the slab looks bad (long grazing paths stretch the noise) — keep it above or below the eye.
- Point lights: in-scattering uses the closed-form ∫1/(h²+(t−b)²) = (atan((t−b)/h)+atan(b/h))/h, times local density at the closest approach, Henyey–Greenstein phase (`uPhase = (g, isotropic floor)`), times transmittance to that point. h is clamped (0.6 m) to avoid the singularity.
- Spot lights: `uLightSpot[i] = (dir, cosOuter)`, w < −1.5 = omni. Applied to surface light and (approximately, at the closest-approach point) to scattering.
- `uLightSurf[i]` scales a light's surface contribution only. Used where a light should glow in the air but not flood nearby geometry (beacons next to their mast, red panel lights on the launch tower).

## Units / calibration
Metres. Colours are linear, scene-referred; AgX in post maps them. Light colour × intensity is radiant intensity: surface gets `I/(d²+1)`, scattering gets `I·σ·phase·(1/h-integral)`. Typical: beacon 250–400, sodium flood 3–9k, street lamp ~2k. Sky values sit around 0.002–0.05; anything ≫1 blooms.

## Limits
`MAX_LIGHTS = 12` (uniform arrays + per-fragment loop cost). Lights beyond 12 or with `scatter: false` are sprites only (distant beacons). No occlusion of scattering (no light shafts).
