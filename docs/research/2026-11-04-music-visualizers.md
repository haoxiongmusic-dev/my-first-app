# Music visualizers: research notes and build list

Date: 2026-11-04
Purpose: understand how music visualizers work, and list what this project must build
to turn a song plus a template into a music-reactive MP4 using HyperFrames.

---

## 1. How a music visualizer works

Every visualizer, from Winamp to the AXIOM album videos, runs the same pipeline:

```
song file ─► decode to samples ─► FFT per frame ─► group into bands ─► scale to 0–1
          ─► smooth (fast attack, slow release) ─► detect hits/beats ─► drive visuals
```

| Step | What it does | Typical choice |
|---|---|---|
| **Decode** | Turn MP3/WAV into raw mono samples | FFmpeg, 44.1 kHz mono |
| **FFT** | Split each short slice of sound into frequencies | 2048–4096 sample window, Hann-weighted, one per video frame |
| **Bands** | Group frequencies into a handful of bars | **Logarithmic** spacing (e.g. 30 Hz–16 kHz). Equal spacing would cram all the movement into a few bars, because music energy is concentrated low |
| **Scale** | Turn raw energy into 0–1 | Convert to decibels, clip to a window (e.g. -70 to -10 dB), map to 0–1 |
| **Smooth** | Stop jitter without making it sluggish | **Asymmetric**: rise fast (attack ≈ 0.5), fall slow (release ≈ 0.1). Symmetric smoothing is both laggy on hits and jittery on decay |
| **Hits / beats** | Know *when* something happens, not just how loud | Simple: energy > ~1.5× its recent average. Better: **spectral flux** onset strength (how much the spectrum *increased* since last frame), then peak-pick |
| **Map to visuals** | Bass → size/pulse, treble → sparkle/glow, loudness → overall energy, hits → bursts | Per template |

### Our big advantage: we render offline

Live visualizers (Winamp, Spotify) must react in real time and can only look backwards.
We analyze the **whole song before rendering**, so we can:

- normalize against the whole track (so quiet songs and loud songs both look lively),
- **look ahead**, e.g. start a burst a frame *before* a hit so it feels perfectly on time,
- smooth in both directions with no lag,
- know song sections (intro, drop, outro) in advance.

HyperFrames also requires this: renders must be deterministic, so there is no live
Web Audio analysis. The analysis is pre-computed into a data file the template reads.

---

## 2. Drawing techniques

| Technique | Good for | Notes |
|---|---|---|
| **Canvas 2D** | Lines, curves, simple shapes (strands template) | Easiest to learn. Glow = draw the same path several times, wider and fainter each time, with `globalCompositeOperation = "lighter"`. Avoid `shadowBlur` (very slow) |
| **WebGL (Three.js)** | Thousands of particles, 3D perspective (horizon template) | Points with additive blending on a dark background; **bloom** post-process for the neon glow |
| **Additive blending** | All three looks | Overlapping light adds up to bright white-hot cores, the signature "neon" look. Works best on dark backgrounds |
| **Bloom** | Soft glow halos | Blur the bright parts and add them back. Costly; the main thing to trim if renders are slow |
| **Seeded randomness** | Sparkles, particle positions | HyperFrames forbids `Math.random()`; use a seeded generator (mulberry32) so every render is identical |
| **Stateless particles** | Sparks flying out on hits | Position must be computed from time alone (`emitTime`, `velocity`, `t - emitTime`), never from the previous frame, because HyperFrames can seek to any frame |

HyperFrames supports Canvas, Three.js and WebGL through its seek protocol: the template
listens for an `hf-seek` event and draws the frame for `e.detail.time`.

---

## 3. The three templates, broken down

### A. Particle horizon (in the style of "Sunlight")
- **Look:** a perspective field of glowing gold/orange particles forming a rolling surface
  toward a horizon; amber haze; dark sky; optional letterbox bars; spaced-out title and
  artist below centre.
- **Technique:** WebGL (Three.js) grid of ~10–20k points. Height of each point = several
  slow sine waves travelling across the field, plus a ripple layer whose amplitude follows
  the music. Additive blending + bloom. Gradient haze behind.
- **Music mapping:** overall loudness → wave height; bass → large swells; treble → sparkle
  brightness on the crest; hits → a ripple travelling outward.
- **Difficulty:** hardest to render fast (most particles + bloom).

### B. Neon strands (in the style of "Violetlight")
- **Look:** 4–6 thin violet/magenta glowing lines across the middle of a deep plum
  background; small serif title below.
- **Technique:** Canvas 2D. Each strand is a line of ~400 points. Its vertical offset =
  a slow base curve + a sum of narrow bell-shaped bumps placed along the x-axis, one per
  frequency band, height = that band's level, mirrored up/down. Each strand uses a slightly
  different band mix and phase so they weave. Glow via layered strokes.
- **Music mapping:** each band → a bump at its own position (bass left or centre, treble
  outward); loudness → glow brightness; quiet → strands relax into gentle curves.
- **Difficulty:** easiest; best one to build first.

### C. Neon burst emblem (in the style of "Neonlight")
- **Look:** black background; green neon emblem: centre ring, two long crossed blades (X),
  a spiky radial spectrum around the ring mirrored 4 ways, sparkles drifting outward.
- **Technique:** Canvas 2D (or WebGL if slow). Radial spectrum = band levels plotted in
  polar coordinates around the ring, interpolated to ~64 spikes, mirrored. Blades are fixed
  shapes scaled by a "kick" envelope. Sparkles are stateless particles emitted at detected
  hits.
- **Music mapping:** bands → spike lengths; bass hits → whole emblem scales up and flares
  (fast attack, slow release); very quiet → collapses to just the ring.
- **Difficulty:** medium; needs good hit detection.

All three share the same editable fields: **song**, **title**, **artist**, **main color**,
**background color**, **intensity**, **letterbox on/off**.

---

## 4. What our test showed

We ran HyperFrames' bundled analyzer (`hyperframes-creative/scripts/extract-audio-data.py`)
on a 51-minute album:

- **Speed: 36 seconds for 51 minutes** (≈ 3 s for a 4-minute song). Analysis is not a bottleneck.
- **Output:** per video frame, `time`, `rms` (loudness, 0–1) and 16 `bands` (0–1).
- **Size:** 16 MB of JSON for 51 min (≈ 1.2 MB for 4 min). Fine, but rounding values to
  2 decimals would roughly halve it.
- **Problem 1: bands are normalized to the single loudest moment.** The bass band sat near
  0 for most of the song and only jumped on the biggest kicks, which would make visuals
  look dead most of the time. **Fix:** normalize to a high percentile (e.g. 95th) instead of the max, then clip.
- **Problem 2: no smoothing and no hit/beat data.** **Fix:** add attack/release smoothing
  and a spectral-flux onset ("hit") signal in our own analysis step.

Conclusion: use the bundled script as the starting point and extend it, rather than
writing an analyzer from scratch.

---

## 5. Build list

### A. Audio analysis (Python, runs on the server)
1. Decode any MP3/WAV/M4A to mono samples (FFmpeg).
2. FFT per video frame into ~32 log-spaced bands (30 Hz–16 kHz), in dB.
3. Percentile normalization per band, clipped to 0–1.
4. Attack/release smoothing (keep a raw copy for sharp effects).
5. Onset ("hit") strength via spectral flux, plus a bass-only "kick" signal, plus peak-picked hit times.
6. Compact output (rounded values) written next to the template as a data file.
7. Tests using generated sounds: a 60 Hz tone must light the bass band only; clicks must produce hits at the right times.

### B. Shared visualizer toolkit (JavaScript, used by all templates)
1. Load the analysis data; `sample(t)` returns interpolated bands/loudness/hit values for any time.
2. Seeded random generator.
3. Glow helpers (layered strokes for Canvas 2D; bloom setup for WebGL).
4. HyperFrames wiring: `hf-seek` listener, reading variables (colors, intensity, text).

### C. The three templates (HyperFrames projects)
Built in order of difficulty: **strands → burst → horizon**.

### D. Web app (Next.js + TypeScript)
1. Gallery page with preview clips.
2. Editor page: song upload → analysis → live preview in `<hyperframes-player>`, with a form generated from the template's variables.
3. Export: start render, show progress, download MP4.

### E. Render pipeline (server)
1. Job folder per export (template copy + song + analysis data + chosen values).
2. Run `hyperframes render --variables-file …`, report progress, clean up afterwards.
3. Song length cap for version 1 (proposal: 10 minutes).

### F. Quality checks
1. `hyperframes check` on every template.
2. Snapshot frames at known loud and quiet moments to confirm the visuals react.
3. Render-speed benchmark on this machine.

---

## 6. Unknowns to test before building (spikes)

1. **Render speed on this PC** (NVIDIA Quadro P500, an entry-level GPU) for a 1080p30
   Canvas scene and a WebGL scene with bloom. This decides whether a 4-minute song
   takes minutes or an hour.
2. **Live preview updates:** can `<hyperframes-player>` take new variable values without
   reloading? If not, reload the player after the user stops typing.
3. **WebGL inside the headless render** (`--browser-gpu`) works with this GPU.
4. **Audio data size** for long songs loads quickly enough in the preview.

---

## 7. Render speed test results (2026-11-04)

Two throwaway HyperFrames scenes, 10 s each, 1920×1080 at 30 fps, driven by real music
data (10 s cut from an AXIOM track):

| Scene | Quality | Total time | Frame capture | Encode |
|---|---|---|---|---|
| Neon strands (Canvas 2D, 5 glowing lines) | delivery | 44.6 s | 28.5 s | 6.7 s |
| Particle horizon (WebGL, 19,200 particles × 2 passes) | delivery | 43.2 s | 28.7 s | 5.5 s |
| Particle horizon | draft | 31.5 s | 23.4 s | 0.1 s |

Findings:

- **About 4.4× slower than real time at delivery quality**, about 12 s of it fixed setup.
  Frame capture (Chrome taking a screenshot of each frame) is the bottleneck, **not** the
  drawing: 19,200 WebGL particles cost the same as 5 lines. So the templates can be rich.
- **Estimated export times on this PC:** 4-minute song ≈ 14 min (delivery) / ≈ 9–10 min
  (draft); 10-minute song ≈ 35 min (delivery).
- Rendering used the **Intel UHD 620** integrated GPU, not the NVIDIA Quadro P500
  (normal on laptops with switchable graphics). Since capture is the bottleneck, the
  NVIDIA GPU probably would not help much.
- Both scenes **visibly react**: on a loud frame the strands spike higher and the horizon
  swells and brightens compared with a quiet frame.
- Bug found and fixed: a WebGL uniform declared with different precision in the two shader
  halves fails to link. Templates must check link status and throw a clear error.
- The spike visuals are rough (particles too dim, strands too busy when quiet); look
  tuning is template work, not a technical risk.

Implications for the design:

- The **live preview** plays in real time in the browser, so editing feels instant; only
  **export** is slow. The export page needs a progress bar and a time estimate.
- Offer a **720p / draft export** for quick checks; keep 1080p delivery for the final.
- For other people later: cloud rendering (HeyGen cloud, AWS Lambda splitting the song
  across many machines) is the way to get fast exports.

---

## 8. Upgraded-look test with T-REX (2026-11-04)

30 s of `T-REX.wav` (3:10–3:40, the build into the big drop), both looks rebuilt for
quality, full 1080p delivery renders:

| Look | Render time | Raw file | After re-encode (CRF 20) |
|---|---|---|---|
| Neon strands (Canvas 2D, 3-layer bloom, white cores, flare, vignette, grain) | 2 m 53 s | 50 MB | 19 MB |
| Particle horizon (WebGL, 67k particles, spectrum-history terrain, kick ripples, bokeh, 2-size bloom, haze, letterbox, grain) | 2 m 48 s | 228 MB | 69 MB |

- ~5.7× real time, so a full 4:12 song ≈ 24 min per look on this PC at delivery quality.
- Quiet vs drop is clearly different in both looks (strands collapse to one glowing line
  when quiet and explode on the drop; the horizon swells and brightens).
- **New prototype analyzer** (`analyze.py`): 32 log bands scaled against the whole song
  (20th–97th percentile), fast-attack/slow-release smoothing, spectral-flux onsets,
  peak-picked hits and a decaying kick envelope. 4 s for a 4-minute song.
- **Bug: half-float render targets draw nothing** on the Intel UHD 620 (ANGLE/D3D11) even
  though the framebuffer reports complete. Templates must use standard 8-bit targets.
- **File size:** per-frame film grain makes the horizon very hard to compress
  (228 MB / 30 s raw). Real templates need lighter or slower-changing grain, and the export
  step should re-encode at a sensible quality (CRF ~20) as standard.
- In the drop, loudness sits near maximum, so the punch has to come from the kick/hit
  signals, not loudness. The analyzer's hit detection is what makes drops feel alive.

---

## Sources

- [raw.org Winamp equalizer demo](https://raw.org/demo/winamp-equalizer/): log-spaced bands, attack/release
- [mpv_audio_kit SpectrumSettings](https://pub.dev/documentation/mpv_audio_kit/0.1.2/mpv_audio_kit/SpectrumSettings-class.html): asymmetric smoothing, dB window
- [ling-audio FFT source](https://docs.rs/ling-audio/latest/src/ling_audio/fft.rs.html): energy-vs-average beat detection
- [terminal-vibes processing source](https://docs.rs/crate/terminal-vibes/latest/source/src/processing.rs)
- [tracklist-link v0.8.0 notes](https://github.com/ALunfb/tracklist-link/releases/tag/v0.8.0): beat detection noise
- [librosa onset detection](https://librosa.org/doc/latest/onset.html): spectral flux onset strength, peak picking, backtracking
- [librosa onset API](https://librosa.org/doc/latest/api/onset.html)
- [wayne-wu WebGL music visualizer](https://github.com/wayne-wu/webgl-music-visualizer): bloom post-process for neon glow
- [vasuala](https://github.com/a-saed/vasuala): Three.js bloom, additive blending, performance drivers
- [Building an audio-reactive 3D visualizer with Three.js (DEV)](https://dev.to/7g3n/how-i-built-an-audio-reactive-3d-visualizer-with-threejs-and-the-web-audio-api-6an)
- [Creative Bloq: WebGL lights case study](https://www.creativebloq.com/3d/behind-scenes-lights-latest-webgl-sensation-11116660): 2D canvas redraw cost
- HyperFrames skills: `hyperframes-creative/references/audio-reactive.md`, `hyperframes/references/runtimes.md`, `hyperframes-cli/references/preview-render.md`
