# Quiet Signals

Five real-time 3D night scenes of radio towers in the browser, each with its own light, fog, sky, colour grade and generated soundscape. Built from five reference photographs (desert mast with red beacons, tropical hill station in haze, alpine relay under a full moon, monopole and pylons under stars, a launch tower at blue hour).

Last updated: 2026-10-14

## Run

```bash
nix develop            # Node 24 LTS + pnpm (or use any Node ≥ 24 with pnpm)
pnpm install
pnpm dev               # http://localhost:5173
pnpm check             # svelte-check + TypeScript
pnpm build             # static single-file site in build/index.html
pnpm artifact          # build + dist/quiet-signals.html (body-only page for claude.ai artifacts)
pnpm shots 0,1,2,3,4 960 540 21   # headless screenshots of scenes at t=21 s → shots/
```

`pnpm shots` needs a Playwright Chromium (`pnpm exec playwright install chromium` on a new machine). It renders with SwiftShader, so expect 5–25 s per frame.

## Controls

← / → or swipe: previous / next scene · 1–5: jump · M: mute · F: full screen · D: debug HUD (fps, frame time, render scale, draw calls, GPU memory objects, JS heap, scene build time, audio RMS/peak).

## Stack and why

| Choice | Reason |
| --- | --- |
| Three.js, but only `ShaderMaterial`s | Every surface runs the same analytic atmosphere code, so fog, aerial perspective and light glow match across sky, terrain and towers. Built-in materials would need patching to do that. |
| Forward (per-fragment) fog instead of a depth-based post pass | Lattice towers are sub-pixel lines. A post pass would fog their MSAA-resolved edge pixels with the wrong depth and draw halos. See `src/lib/engine/atmosphere.ts-cvf.md`. |
| Own post pipeline (no `postprocessing` lib) | Small, fully controlled: MSAA HDR target → 7-level bloom → one composite pass (AgX, grade, grain, vignette, aberration, fade). |
| Procedural Web Audio, no audio files | Ships as one file, no licensing, and wind gusts drive camera sway and wind sound from one shared signal. |
| SvelteKit 3, hash router, `bundleStrategy: 'inline'` | CSR-only single HTML file that works from `file://`, any static host and a claude.ai artifact. |
| Tailwind 4 + normalize.css + sanitize.css | House style; UI is a thin glass layer over the canvas. |

## Layout

```
src/lib/engine/   renderer core: atmosphere GLSL, materials, geometry builders, post, camera rig, lights, engine loop
src/lib/scenes/   one file per scene + registry (index.ts)
src/lib/audio/    sound engine, synth voices, per-scene soundscapes
src/routes/       the single page (intro, navigation, HUD)
scripts/          artifact packaging, screenshot harness
docs/             milestones
```

Context that the code cannot carry lives in CVF files next to the code (`<file>-cvf.md`):

- `src/lib/engine/atmosphere.ts-cvf.md` – fog, cloud slab and light-scattering model, units and calibration
- `src/lib/engine/materials.ts-cvf.md` – sky, surface (canopy, snow, facade), ribbon lines, points
- `src/lib/engine/post.ts-cvf.md` – HDR pipeline, AgX caveats, grain
- `src/lib/engine/geometry.ts-cvf.md` – terrain meshes, shadow bake, ribbon layout
- `src/lib/engine/engine.ts-cvf.md` – loop, transitions, adaptive resolution, health hooks
- `src/lib/scenes/index.ts-cvf.md` – how scenes are tuned, per-scene notes
- `src/lib/audio/engine.ts-cvf.md` – audio graph, scheduling, loudness targets
- `vite.config.ts-cvf.md` – SvelteKit 3 specifics

## Resource budget

Measured in headless Chromium (2026-10-14): scene builds 0.2–2.3 s (done while the screen is black between scenes), 130k–630k triangles, 26–74 draw calls, 1 HDR MSAA target + 7 half-float bloom mips. Built scenes are cached for the session (memory grows with each first visit, then stays flat). Nothing allocates per frame except small uniform updates. Rendering pauses and audio suspends when the tab is hidden. Render scale drops automatically when the median frame time exceeds 24 ms.

## Known limits

- Real GPU frame times are unmeasured here (only SwiftShader is available in the build container). Check the D HUD on target hardware.
- Lights do not cast shadows through fog (no occlusion of in-scattering).
- Mixing of the soundscapes was balanced by measured RMS, not by ear.
