# geometry.ts — CVF (2026-10-14)

- `polarTerrain`: rings spaced exponentially from `rMin` to `rMax` around a centre, limited to a yaw span → dense near the camera, kilometres of coverage with ~100k vertices. Centre it on the camera (Summit broke when centred elsewhere: the area between camera and centre was empty). Uses flipped winding vs `gridTerrain`; a wrong winding culls the whole mesh from above (happened once — the "ground" seen was the sky's below-horizon colour).
- `gridTerrain`: regular grid for terrain that needs uniform detail (Hill Station forest silhouette).
- Shadow bake: heights are cached on a 512² grid over the mesh bounds, then each vertex marches toward the light with bilinear lookups. Calling the height function per step instead took ~28 s for Summit.
- `ribbonGeometry`: 4 verts/segment, attributes `aStart aEnd aSide aRadius aFlex`; `position` mirrors `aStart` only so three has something to bound — ribbon meshes set `frustumCulled = false`.
- `latticeTower`: legs + X bracing + horizontals per section; section spacing tightens toward the top.
