# noise3d.ts — CVF (2026-10-14)

64³ R8 tileable "Perlin-Worley"-style texture: 4 octaves of periodic value noise (periods 4–32) blended 60/40 with inverted 3D Worley (6 cells), the billowy shape used for cloud rendering. Built on the CPU at startup (~0.1 s), RepeatWrapping in all three axes so the raymarcher can sample world-space coordinates directly. Two fetches per sample in the shader instead of ALU noise keeps 48–56 steps per pixel affordable.
