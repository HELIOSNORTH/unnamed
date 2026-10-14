# audio — CVF (2026-10-14)

Graph: scene bus → master gain → compressor (soft limiter, −12 dB threshold) → destination; analyser after the limiter for the HUD. Shared convolution reverb (generated 5.5 s stereo IR, darkening tail) fed by per-voice sends.

- Everything is synthesized (`voices.ts`): noise loops (white/pink/brown, 6 s buffers with crossfaded loop points), wind (low rumble + band + optional high-Q whistles + hiss, all driven by `setWind`), crickets (one oscillator per insect, pulses as gain automation), cicada swells (AM band noise), tree frogs, croaks, birds, nightjar, corona buzz + crackle, stream, traffic swells, vent hum, generative pad (chord tones with 4–8 s attacks into the reverb + root drone).
- Scheduling: each voice exposes `schedule(until)`; a 120 ms timer schedules 0.6 s ahead on the audio clock. One-shot nodes disconnect themselves on `ended`.
- Scene switch: old bus ramps to 0 over 1.4 s, sources stop and disconnect 0.3 s later; new bus starts at 80 % of the fade-out and ramps in over 3 s.
- Loudness: measured RMS after the limiter in headless Chromium, then `MASTER_GAIN` and per-scape `level` set so scenes sit within ~3 dB of each other, around −24 dB RMS. Not yet checked by ear.
- Context resumes from the Begin click (autoplay policy); suspends with the tab hidden.
