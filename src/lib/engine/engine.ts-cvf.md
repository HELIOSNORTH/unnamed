# engine.ts — CVF (2026-10-14)

- Scenes build lazily and stay cached. Building happens inside the fade-out at full black, so the 0.2–2.3 s stall is invisible. Do not prebuild during viewing: it freezes the visible picture.
- Transition: fade out 1.1 s → swap → fade in 2.6 s (smoothstep). Audio crossfades on its own clock (see audio CVF).
- Wind: one smooth noise signal per scene × `windiness`; feeds camera sway, branch sway (`uWind`) and wind audio.
- Resolution is always native devicePixelRatio, every setting at maximum, regardless of fps (owner's decision 2026-10-15). The adaptive scaler was removed; the FPS counter (bottom right) shows the cost.
- `renderer.info.autoReset = false` + manual reset per frame so the HUD shows the whole frame (scene + post passes), not just the last pass.
- `jump(i, t)` exists for the screenshot harness (instant scene, fixed time). Exposed on `window.__quietSignals` with `stats`, `begin`, `select`, `audio`, and benchmark hooks `toggle` (volume/AO/shadows), `hide` (material kinds), `profile`/`passes`.
- WebGL context loss: stop the loop; on restore, reload the page.
