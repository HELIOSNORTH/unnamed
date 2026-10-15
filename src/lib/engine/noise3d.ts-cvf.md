# noise3d.ts — CVF (2026-10-15)

Now generated on the GPU into a 128³ RGBA8 `WebGL3DRenderTarget` (one fullscreen pass per layer, a few ms) instead of ~1.5 s of CPU. R = periodic Perlin-Worley (base 4), G = same at base 12 (finer octave in the same fetch), B/A = periodic Perlin warp fields. The text below describes the retired CPU version's shape model, which the GPU shader keeps.


64³ R8 tileable "Perlin-Worley"-style texture: 4 octaves of periodic value noise (periods 4–32) blended 60/40 with inverted 3D Worley (6 cells), the billowy shape used for cloud rendering. Built on the CPU at startup (~0.1 s), RepeatWrapping in all three axes so the raymarcher can sample world-space coordinates directly. Two fetches per sample in the shader instead of ALU noise keeps 48–56 steps per pixel affordable.
