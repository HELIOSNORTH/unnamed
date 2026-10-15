# scenes — CVF (2026-10-14)

Each scene file returns `BuiltScene`: three `Scene`, atmosphere uniforms, lights, a `Shot` (camera position/target, vertical fov, reference aspect), a `Grade` (exposure, colour, lens, film), optional `volume`, `windiness`.

## Matching the reference photos
The five photos are the spec. Loop:
1. `pnpm build`
2. `node scripts/compare.mjs <photo dir> <ids> 21 <out> 560` renders each scene at its photo's aspect with UI hidden.
3. `python3 scripts/compare-montage.py <photo dir> <out> <ids>` writes photo|render montages and prints mean RGB of four horizontal bands for both.
Match band colours first (convert the photo's sRGB band means to linear and set sky/fog/ambient near those values; AgX is roughly identity around 0.01–0.05), then screen positions (convert photo pixel positions to angles with the fov and place objects by angle and distance), then detail. Exposure last.

## Per scene
- Beacon: clean twilight, not haze. Sky slate blue on top, dusty rose at the horizon. Beacon heights (34/64/94 m above the mast base) and pole/bush positions were solved from photo pixel positions. Glow is mostly lens (bloom + small cross); air scatter kept low or the sky turns red.
- Hill Station: dark blue evening (owner asked for later and darker than the photo's bright long exposure). Shore lights 9–23 km out shrink with distance (`addPoints` perspective) for depth. Sodium floods have `range` ~75 m and sit above the canopy edge so the yellow pool reads; otherwise they light the whole hill orange. Camera 34 m above its hill (at eye level nearby crowns triangulate into slivers). Valley mist via `volume`.
- Summit: near-black navy sky. Camera on a 30 m knoll ~170 m from the tower, pitched up 12°. Key light = the visible moon (backlit tower, shadow toward the camera); an earlier side key threw the tower shadow out of frame. Spindrift via `volume` at ½ res (⅓ looked blocky around the hut). Snow glints only on foreground snow, view-dependent.
- Pylons: street lamp is a spot aimed at the monopole. Foreground is a grassy embankment (a flat black wall read as an unnatural bar). Pylon A 60 m out so it clears the embankment like the photo. Every tower top has a 2.4 s red aviation flash. Lens kept faint (flare 0.008): stronger ghosts read as disturbing here (owner).
- Launch Complex: overcast daylight + cyan 80s print, not dusk. Terrain heights are relative to the camera (foothills 0.5–1 km, peaks 2.5–3.5 km reaching ~13°); the compound's buildings sit 80–150 m from the camera because the camera is ~19 m up looking level. Exposure 0.34 (owner asked twice for darker, keep the colours). Lights added: mercury floods on the tower, sodium/mercury yard lights, crane and mast aviation lights, white strobe. Leafy trees are `trees.ts` leaf cards with LOD (were icospheres).
