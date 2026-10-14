# Milestones

## M1 — Five scenes, playable (2026-10-14) ✅

- Render engine: analytic height fog + cloud slab + point/spot light in-scattering in every material, HDR MSAA, bloom, AgX, grade, 24 fps grain.
- Scenes: Beacon, Hill Station, Summit, Pylons, Launch Complex, tuned against the reference photos with the screenshot harness.
- Handheld camera (breath, slow drift, wind gusts, tremor) driven by the same wind signal as the audio.
- Blowing snow on Summit (GPU particles wrapped in a box around the camera, brighter toward the moon).
- Procedural soundscapes per scene with crossfades; loudness balanced to about −24 dB RMS by measurement.
- Glass UI: intro, scene title cards, navigation pill, mute, full screen, debug HUD.
- Single-file build published as a claude.ai artifact.

## M2 — Next candidates

- Measure frame times on Apple Silicon and a mid-range Windows laptop; tune adaptive scale thresholds from those numbers.
- Listening pass on headphones and speakers; adjust per-voice levels.
- Drifting low cloud sheets on Hill Station.
