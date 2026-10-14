# engine.ts — CVF (2026-10-14)

- Scenes build lazily and stay cached. Building happens inside the fade-out at full black, so the 0.2–2.3 s stall is invisible. Do not prebuild during viewing: it freezes the visible picture.
- Transition: fade out 1.1 s → swap → fade in 2.6 s (smoothstep). Audio crossfades on its own clock (see audio CVF).
- Wind: one smooth noise signal per scene × `windiness`; feeds camera sway, branch sway (`uWind`) and wind audio.
- Adaptive resolution: median frame time over ≥ 0.8 s windows; > 24 ms → scale × √(16.7/median) (at most −40 % per step, floor 0.5 px/CSS px), < 17.5 ms → × 1.05 up to devicePixelRatio (cap 2). Time-based windows so a 10 fps start recovers in seconds, not 90 frames. Thresholds come from the 60 Hz budget (16.7 ms) with margin; no hardware measurements yet.
- `renderer.info.autoReset = false` + manual reset per frame so the HUD shows the whole frame (scene + post passes), not just the last pass.
- `jump(i, t)` exists for the screenshot harness (instant scene, fixed time, adaptive scale off). Exposed on `window.__quietSignals` with `stats`, `begin`, `select`, `audio`.
- WebGL context loss: stop the loop; on restore, reload the page.
