# engine.ts — CVF (2026-10-15)

- Scenes build lazily and stay cached. Building happens inside the fade-out at full black, so the 0.2–2.3 s stall is invisible. Do not prebuild during viewing: it freezes the visible picture.
- Transition: fade out 1.1 s → swap → fade in 2.6 s (smoothstep). Audio crossfades on its own clock (see audio CVF).
- Wind: one smooth noise signal per scene × `windiness`; feeds camera sway, branch sway (`uWind`) and wind audio.
- Resolution: native devicePixelRatio with every effect on, then a fallback ladder set by the owner (2026-10-15): if a scene runs under 20 FPS, render at 1080p, then 720p, then 540p, then 360p (rows; tiers at or above the current height are skipped). Measured only while a scene is fully faded in: skip 1 s after any change (shader compile and first-frame hitches), then average over a 2 s window (≥ 18 frames even at 9 FPS). Steps only go down, and the tier is remembered per scene for the session, so a heavy scene does not drag a light one down. The output is upscaled to the canvas in the composite pass. The FPS counter shows ` · 720p` etc. when a tier is active.
- No guard for long frames is needed: `start()` resets the frame clock when the tab becomes visible again, so a pause never reads as a slow frame. An earlier guard (reset on frames > 1 s) made the fallback impossible on very slow devices.
- `renderer.info.autoReset = false` + manual reset per frame so the HUD shows the whole frame (scene + post passes), not just the last pass.
- `jump(i, t)` exists for the screenshot harness (instant scene, fixed time, resolution fixed at native so benchmarks stay comparable). Exposed on `window.__quietSignals` with `stats`, `begin`, `select`, `audio`, and benchmark hooks `toggle` (volume/AO/shadows), `hide` (material kinds), `profile`/`passes`.
- WebGL context loss: stop the loop; on restore, reload the page.
