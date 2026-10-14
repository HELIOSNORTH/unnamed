# scenes — CVF (2026-10-14)

Each scene file returns `BuiltScene`: three `Scene`, atmosphere uniforms, lights, a `Shot` (camera position/target, vertical fov, reference aspect), a `Grade`, `windiness`.

## Tuning loop
`pnpm build && pnpm shots <ids> 960 540 <t>` then look at `shots/sceneN.png`. Compare against the reference photo for: sky top vs horizon colour, glow size around lights, how much of the frame is ground, silhouette readability. Change one thing at a time; exposure last.

## Framing
`Shot.fov` is vertical fov at `refAspect`. Narrower screens widen vfov to keep the reference horizontal fov; wider screens keep vfov (show more sides). Portrait scenes (Summit, Pylons) use refAspect ≈ 0.6–0.7.

## Per scene
- Beacon: 100 mm look (14° vfov). Only 5 mast beacons scatter; beacons above frame still tint the sky, so more of them turned the whole right half red.
- Hill Station: camera 34 m above its own hill (a lookout). At eye level the nearby crowns triangulated into dark slivers. No slab here: the camera sat inside it.
- Summit: knife-edge ridge along the camera→tower axis; distant ranges start beyond 2.5 km. Moon is the shadow light (baked).
- Pylons: street lamp is a spot aimed at the monopole so the berm in front stays black like the photo.
- Launch Complex: red panel is emissive + three red lights with `surface: 0.08` (glow in mist without washing the facade).
