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
- Hill Station: bright overcast long exposure (sky ≈ 0.25 linear). Sodium floods have `range` ~75 m and sit above the canopy edge so the yellow pool reads; otherwise they light the whole hill orange. Camera 34 m above its hill (at eye level nearby crowns triangulate into slivers). Valley mist via `volume`.
- Summit: near-black navy sky. Camera on a 30 m knoll ~170 m from the tower, pitched up 12°. The photo is a composite: dishes are lit from the camera side while the moon is ahead, so the key light comes from behind the camera and the visible moon is separate. Spindrift via `volume`.
- Pylons: street lamp is a spot aimed at the monopole so the wall stays black. Pylon A 60 m out so it clears the wall like the photo.
- Launch Complex: overcast daylight + cyan 80s print, not dusk. Terrain heights are relative to the camera (foothills 0.5–1 km, peaks 2.5–3.5 km reaching ~13°); the compound's buildings sit 80–150 m from the camera because the camera is ~19 m up looking level.
