# Milestone 6e: Prism Heart: Design Spec

Date: 2026-11-06
Status: **written for the owner's approval (the three remaining M6 designs are approved together)**
Builds on: the template contract (main spec §6), Iron Wraith's three.js setup
([`2026-11-05-m6-iron-wraith-design.md`](2026-11-05-m6-iron-wraith-design.md)), Halo Rings' ring
kit ([`2026-11-06-m6-halo-rings-design.md`](2026-11-06-m6-halo-rings-design.md) §4), and the
catalog note
[`Glasswave Viz`](../../research/2026-11-04-visualizer-catalog.md#3-glasswave-viz-asked-for-as-glass-wave-viz--motionbox).

## 1. Summary

**Prism Heart** is our own take on the Glasswave look, with:
- a slowly turning **iridescent glass crystal**, made in three.js, right of centre
- a dotted ring of spectrum bars around it, bursting from the top with the bass
- soft out-of-focus bokeh behind, drawn in code, or your own background
- artist and song name on the left

The crystal pulses on the beat. Its edges flash on hits. Its rainbow sheen shifts with the
music's loudness.

## 2. Shared understanding

**Settled:** the catalog idea, built with Iron Wraith's three.js setup and the ring kit. No
timer.

**Assumed (owner can correct):**
- The name "Prism Heart" and the preset names below.
- The glass is **faked** with our own shader: a rainbow sheen that changes with the viewing
  angle, a bright rim, and the background seen slightly bent through the facets. three.js's
  built-in "real" glass needs high-precision render targets, and those draw a blank picture on
  this PC.

**Success:** the owner picks a preset and exports a song. The result has:
- a crystal that reads as glass
- a ring that dances
- pulses on the beats
- an identical picture on every export
- a render no slower than Particle Horizon

## 3. Scope

**In:** `templates/prism-heart/` with its presets and thumbnails, tests, and CLAUDE.md notes.

**Out:**
- a timer or progress line
- a cover image
- other crystal shapes (one good shape first)

## 4. What you see

Made with three.js through `assets/three-kit.js`, following every Iron Wraith rule (CLAUDE.md
"three.js templates").

| Element | Where | Notes |
|---|---|---|
| Bokeh background | Full frame | A dark gradient from deep violet to black, with 40 soft discs (seed 3) of radius 30–160 px in `mainColor` and `accentColor`, drifting slowly (time only) |
| Own background | Full frame | When `showBackground` is on and a background is uploaded, it replaces the bokeh, blurred by `backgroundBlur` |
| Crystal | Centred at (1180, 540), about 520 px tall on screen | A double-ended hexagonal crystal: a six-sided prism with pyramid tips. Corners are nudged by a seeded jitter (seed 9) so the facets look natural. Flat-shaded facets |
| Glass shader | The crystal | A custom `ShaderMaterial`: (1) a thin-film rainbow sheen whose colour depends on the viewing angle, tinted toward `mainColor`/`accentColor`; (2) a Fresnel rim, bright at grazing angles; (3) fake refraction, the background texture read at the screen position nudged along the facet normal; (4) thin bright facet edges. Back faces are drawn first, dimmer, so the far side shows through |
| Glow | Behind the crystal | An additive soft sprite in `mainColor`, because 8-bit bloom only catches near-white. A light `UnrealBloomPass` for the white highlights |
| Spectrum ring | Around the crystal, radius 330 px | The full 360° ring from the ring kit, with bass at the top. Each point is a column of dots extending outward up to 110 px. Dot size comes from `bandThickness`, 2–8 px. Colour runs from `mainColor` at the base to `accentColor` at the tips. Drawn as `THREE.Points` in a screen-space overlay |
| Text | Left, x = 140, centred vertically | Artist (26 px, letter-spaced, capitals) above the song title (60 px), then a 2 px line 320 px long whose glow follows loudness. Shrink to fit 640 px |
| Noise | Full frame | `noiseAmount` 0–100 % maps to grain amplitude 0–0.02, changing at most 6×/s |

## 5. How it moves with the music

The maths lives in `templates/prism-heart/assets/prism-motion.js`. It is pure, uses the ring kit,
and is unit-tested. It touches no three.js.

| Part | Signal | Behaviour |
|---|---|---|
| Turning | time | Around the vertical axis at 12°/s × `spin` %, plus a gentle tilt wobble of ±6° with a 9 s period. Time only |
| Pulse | `beatEnvelope` (release 0.25 s) | Crystal scale `1 + 0.05 × env × intensity` |
| Edge flash | hits | Facet edges brighten by up to 0.8 × hit strength, fading linearly over 0.4 s |
| Sheen | `loud` | The rainbow's hue offset moves with `loud` (a third of a turn at full loudness), so loud passages shimmer |
| Glow sprite | `loud` | Brightness `0.5 + 0.5 × loud × intensity`, capped at 1 |
| Ring | spectrum (`spectrumLow`/`High`/`Boost`, `bandCount`) | Bar length = value × 90 px × `intensity`, cap 110 px. Count `bandsToRingCount(pct, 160)` |
| Bokeh | `loud` | Disc brightness rises 10 % at full loudness |

## 6. Settings (generated form)

| Group | Field id | Type | Default | Range / options |
|---|---|---|---|---|
| Text | `title` | string | `SONG NAME` | max 60 |
| | `artist` | string | `ARTIST NAME` | max 60 |
| | `font` | enum | `Montserrat` | the usual eight fonts |
| Colors | `mainColor` | color | `#c38bff` | |
| | `accentColor` | color | `#ff7ac8` | |
| Effects | `intensity` | number | 1 | 0.2–2, step 0.1 |
| | `spin` | number | 100 | 0–200 % |
| | `bandThickness` | number | 50 | 10–100 % |
| | `noiseAmount` | number | 0 | 0–100 % |
| | `showBackground` | boolean | false | |
| | `backgroundBlur` | number | 60 | 0–100 % |
| Audio | `beatRange` | enum | `kick` | the usual options |
| | `spectrumLow` | number | 30 | 30–16000 Hz |
| | `spectrumHigh` | number | 1000 | 30–16000 Hz |
| | `spectrumBoost` | enum | `1` | 1×, 2×, 4×, 8× (the reference's 1×) |
| | `bandCount` | number | 50 | 10–100 % (the reference's 50 %) |

- **Basic tab:** `mainColor`, `accentColor`, `intensity`, `bandThickness`, `noiseAmount`, `font`.
- **Content:** `title`, `artist`.

## 7. Presets

| Preset | `mainColor` | `accentColor` |
|---|---|---|
| Original | `#c38bff` (violet) | `#ff7ac8` (pink) |
| Amber | `#ffb547` | `#ff6a2b` |
| Ice | `#8ee9ff` | `#5b7cff` |
| Opal | `#9dffd9` | `#ff9df0` |

Thumbnails come from `npm run thumbs -- prism-heart`.

## 8. Testing

| What | How |
|---|---|
| Motion maths | Vitest (`prism-motion.js`): turning and wobble depend on time only; the pulse is capped; edge flashes fade to 0 after 0.4 s and match from a section; the crystal mesh (vertices and faces) is the same every time, closed, with outward faces; ring lengths are capped; silence gives base values and no NaN |
| Template | Vitest: the settings and presets match §6–7; every thumbnail exists; no `Math.random`, `Date.now` or timers; no `HalfFloatType`, `FloatType` or `transmission`; `UnsignedByteType` is forced on the composer and bloom targets; the renderer is built once |
| Template rules | `npm run check:templates` |
| Real GPU | A 30 s Final section of T-REX on this PC: not blank, the crystal reads as glass, timed against Particle Horizon and Iron Wraith. A phone copy is sent to the owner |
| App | Pick the template, change colours, thickness and noise in the live preview, export a Draft |

## 9. Risks

| Risk | Plan |
|---|---|
| The fake glass looks like plastic | The first plan task is a look check: a still frame sent to the owner's phone before the rest is built. Tune sheen, rim and refraction there |
| Fake refraction needs the background as a texture | The bokeh, or the uploaded background, is drawn once per frame into an 8-bit render target. The crystal reads that target; the screen shows it as the backdrop |
| Shader compile errors fail silently | Check compile and link status (template contract); three.js shader errors go to the error box |
| WebGL contexts pile up in the preview | Build the renderer once and update materials on settings changes (Iron Wraith rule) |

## 10. Working practices

- **Branch:** `feat/m6-prism-heart`, from `feat/m6-neon-sundown`. Its pull request targets `main`
  after the earlier two are merged. Then a plan, native execution, a fresh final reviewer, a
  pull request, and a merge when the owner says so.
- **CLAUDE.md:** tick M6 complete, the glass-shader note, and the render speed.
