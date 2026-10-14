# post.ts — CVF (2026-10-14)

Order: scene → half-float 4× MSAA target → 7 downsamples (13-tap, Karis-weighted on the first level to kill fireflies from tiny HDR sprites) → tent upsample with additive blend → composite.

Composite (one pass): radial chromatic aberration → bloom mixed by lerp (energy-preserving, divided by level count) with optional red halation tint → vignette → exposure → AgX → saturation → contrast (power curve around 0.3, so night blacks are not crushed like a 0.5 pivot does) → lift/gamma/gain → grain → exposure flicker → fade → sRGB encode → 1/255 dither.

- AgX desaturates bright colours toward white. Saturated emissives (launch tower red) must stay moderate (≈0.5–1 after exposure) or they turn peach.
- Grain changes at 24 fps (`floor(time·24)`), is luma-shaped (strongest in mid-dark tones) and mostly monochrome with a little chroma. Night scenes are mostly dark, so amplitude is small (0.03).
- Dither matters: 8-bit output of dark gradients bands without it.
