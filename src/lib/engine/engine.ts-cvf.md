# engine.ts — CVF (2026-10-15)

- Scenes build lazily and stay cached. Building happens inside the fade-out at full black, so the 0.2–2.3 s stall is invisible. Do not prebuild during viewing: it freezes the visible picture.
- Transition: fade out 1.1 s → swap → fade in 2.6 s (smoothstep). Audio crossfades on its own clock (see audio CVF).
- Wind: one smooth noise signal per scene × `windiness`; feeds camera sway, branch sway (`uWind`) and wind audio.
- Resolution ladder (owner's rules, 2026-10-15): native → 1080p → 720p → 540p → 360p (render rows; tiers at or above the canvas height are skipped). Below 20 FPS step down one tier; above 45 FPS step up one tier. Every scene visit starts over at native (the device may have changed since the last visit). Tier ratios are ≤ 2.25× pixels, so 45 FPS at one tier predicts ≥ 20 at the next; that gap is what keeps the ladder from oscillating, no back-off timer needed.
- Measurement: skip 1 s after any change (shader compile, first-frame hitches), then a 2 s window (≥ 18 frames even at 9 FPS). FPS = 1000 / median frame time, so one GC pause or background hitch cannot push the resolution down. Measured during the fade-in too (same render cost), so a heavy scene usually settles before it is fully visible. The FPS counter shows ` · 720p` etc. below native.
- No long-frame guard: `start()` resets the frame clock when the tab becomes visible again, so a pause never reads as a slow frame. A guard that ignored frames > 1 s made the fallback impossible on very slow devices.
- FPS falling the longer a scene stays open (owner report, Summit): a 3-minute headless run shows flat frame time, heap ~30 MB and constant GPU object counts, so it is not a leak. Most likely the fanless M1 Air throttling under sustained load; stepping up above 45 FPS recovers when it cools.
- `debugResolution(h)` / `__quietSignals.resolution(h)` forces a render height (harness: `RES=720 node scripts/shot.mjs …`).
- `renderer.info.autoReset = false` + manual reset per frame so the HUD shows the whole frame (scene + post passes), not just the last pass.
- `jump(i, t)` exists for the screenshot harness (instant scene, fixed time, resolution fixed at native so benchmarks stay comparable). Exposed on `window.__quietSignals` with `stats`, `begin`, `select`, `audio`, and benchmark hooks `toggle` (volume/AO/shadows), `hide` (material kinds), `profile`/`passes`.
- WebGL context loss: stop the loop; on restore, reload the page.
