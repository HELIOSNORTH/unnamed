# trees.ts — CVF (2026-10-15)

Near/mid-distance broadleaf trees the game-engine way: a ribbon branch skeleton (`branchingPlant`) plus camera-facing leaf cards with an alpha-tested leaf atlas. Replaced displaced icospheres on Launch, which the owner read as "green balls / broccoli" twice.

- Silhouette comes from 5–8 sub-clumps per crown with sky gaps between them, not from one sphere; cards cluster around clumps.
- Atlas: 512² canvas, 2×2 tiles of leaf sprays drawn at build time (no image files, single-file build). Green channel doubles as brightness, red/blue as a pseudo normal tilt.
- Cards: one quad each, billboarded in the vertex shader, rotated by seed, wind sway from `uWind`. Lighting uses a crown-radial normal (sphere-ish shading over the whole tree, like foliage normals in games), inner-crown AO and back-lit translucency.
- `alphaToCoverage` with the MSAA scene target gives soft leaf edges without sorting; renderOrder 2.
- Shadows: `userData.shadow = 'custom'` + `userData.depthMaterial` (same vertex shader, alpha test 0.5) so leaves cast dappled shadows.
- LOD: `style.lod = { eye, near, min }` keeps `cards × clamp(near / distance, min, 1)` cards per tree and grows each card by √(full/kept) so coverage stays the same. Cameras are fixed per scene, so LOD is chosen at build time; a free-moving game camera would need runtime LOD.
