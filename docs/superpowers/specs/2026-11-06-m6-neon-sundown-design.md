# Milestone 6d: Neon Sundown: Design Spec

Date: 2026-11-06
Status: **written for the owner's approval (the three remaining M6 designs are approved together)**
Builds on: the template contract (main spec §6), Nova Streak's image setting
([`2026-11-06-m6-nova-streak-design.md`](2026-11-06-m6-nova-streak-design.md) §4), Halo Rings'
ring kit ([`2026-11-06-m6-halo-rings-design.md`](2026-11-06-m6-halo-rings-design.md) §4), and the
catalog note
[`Gridwave Reactor`](../../research/2026-11-04-visualizer-catalog.md#6-gridwave-reactor--tinomotion).

## 1. Summary

**Neon Sundown** is our own retro-synthwave template, in the spirit of Gridwave Reactor. It has:
- a striped retro sun on the horizon, with **your cover art in a circle inside it**
- spectrum bars fanning around the sun
- neon wireframe mountains
- a glowing grid floor rushing toward you
- neon artist and song text
- an optional VHS look (scanlines, colour fringing, a slow tracking band)

All of it is drawn in code. Without a cover, the sun is a plain striped sun.

## 2. Shared understanding

**Settled:** the catalog idea, built with the image setting and the ring kit. No timer.

**Assumed (owner can correct):**
- The name "Neon Sundown" and the preset names below.
- The grid scrolls at a steady speed and flashes brighter on beats. A speed that changed with
  the music would need the whole song's history to work out any one frame.

**Success:** the owner uploads a cover, picks a preset, and exports a song. The result:
- reads instantly as synthwave
- has bars that dance around the sun
- has a grid that pulses on the kick
- comes out identical on every export
- renders no slower than Particle Horizon

## 3. Scope

**In:** `templates/neon-sundown/` with its presets and thumbnails, tests, and CLAUDE.md notes.

**Out:**
- a timer or progress bar
- the CRT-TV frame of the catalog's other synthwave template (a later idea)
- an own-background upload, because the scene *is* the background

## 4. What you see

Drawn with WebGL (toolkit helpers and blur), no three.js. The horizon sits at y = 640.

| Element | Where | Notes |
|---|---|---|
| Sky | Above the horizon | Gradient from `skyColor` at the top to a warm glow of `sunBottomColor` (30 %) at the horizon. 200 faint seeded stars in the top half |
| Sun | Centre (960, 430), radius 200 | Gradient from `sunTopColor` at the top to `sunBottomColor` at the bottom. The lower half has six horizontal gaps that get thicker toward the bottom and drift slowly downward (one gap spacing every 4 s, time only) |
| Cover | Inside the sun, radius 140 | Only when `cover` is set: the square picture clipped to a circle, with a 4 px ring in `sunTopColor`. The gaps don't cross it |
| Spectrum bars | Around the sun | An arc of 220° centred on the top, from the ring kit, so the hidden bottom isn't wasted. `spectrumSide`: **outside** (from r = 212 outward, up to 120 px), **inside** (from the sun's edge inward, up to 50 px, stopping 6 px short of the cover) or **both**. 4 px bars in `sunTopColor` blending to `sunBottomColor` at the tips, glowing |
| Mountains | Left and right, the valley in the centre | Two ridgelines (seed 5): the far one lower and dimmer, the near one taller at the frame edges. The valley floor (x 760–1160) stays below y = 600, so the sun shows. Dark fill (`skyColor` at 40 %), a 2 px neon outline in `gridColor`, and faint vertical wireframe lines inside |
| Grid floor | Below the horizon | Lines converge on (960, 640). Cross lines are spaced in perspective and roll toward the viewer. 2 px lines in `gridColor` with a soft glow. A bright horizon line |
| Text | Lower centre | Artist (26 px, letter-spaced) at top 800, song title (54 px, bold, capitals) under it. Neon glow in `sunBottomColor`. Shrink to fit the 80 % title-safe width |
| VHS look | Full frame, last | When `vhsLook` is on: scanlines every 3 px (12 % darker), a 2 px red/blue fringe, a gentle vignette, a faint tracking band rolling up once every 7 s, and grain ≤ 0.02 changing at most 6×/s |

## 5. How it moves with the music

The maths lives in `templates/neon-sundown/assets/sundown-motion.js`. It is pure, uses the ring
kit, and is unit-tested.

| Part | Signal | Behaviour |
|---|---|---|
| Bars | spectrum (`spectrumLow`/`High`/`Boost`, `bandCount`) | value × max length × `intensity`, capped at the side's maximum. Count: `bandsToRingCount(pct, 96)` over the 220° arc |
| Sun pulse | `beatEnvelope` (release 0.2 s) | Sun, cover and bars scale `1 + 0.04 × env × intensity` |
| Grid | time + `beatEnvelope` | Scrolls `gridSpeed` % × 2 cells/s (time only). Line brightness `0.55 + 0.45 × env` |
| Mountains | `loud` | Outline brightness `0.6 + 0.4 × loud` |
| Stars | none | Static |

## 6. Settings (generated form)

| Group | Field id | Type | Default | Range / options |
|---|---|---|---|---|
| Text | `title` | string | `SONG NAME` | max 60 |
| | `artist` | string | `ARTIST NAME` | max 60 |
| | `font` | enum | `Montserrat` | the usual eight fonts |
| Images | `cover` | image (square) | `""` | |
| Colors | `skyColor` | color | `#1a0533` | |
| | `sunTopColor` | color | `#ffd23f` | |
| | `sunBottomColor` | color | `#ff2e88` | |
| | `gridColor` | color | `#00e5ff` | |
| Effects | `intensity` | number | 1 | 0.2–2, step 0.1 |
| | `spectrumSide` | enum | `outside` | Outside, Inside, Both |
| | `gridSpeed` | number | 100 | 0–200 % |
| | `vhsLook` | boolean | true | |
| Audio | `beatRange` | enum | `kick` | the usual options |
| | `spectrumLow` | number | 30 | 30–16000 Hz |
| | `spectrumHigh` | number | 1000 | 30–16000 Hz |
| | `spectrumBoost` | enum | `2` | 1×, 2×, 4×, 8× |
| | `bandCount` | number | 70 | 10–100 % (the reference's 70 %) |

- **Basic tab:** `skyColor`, `sunTopColor`, `sunBottomColor`, `gridColor`, `intensity`,
  `spectrumSide`, `vhsLook`, `font`.
- **Content:** `title`, `artist`, `cover`.

## 7. Presets

| Preset | `skyColor` | `sunTopColor` | `sunBottomColor` | `gridColor` |
|---|---|---|---|---|
| Original | `#1a0533` | `#ffd23f` | `#ff2e88` | `#00e5ff` |
| Flamingo | `#2a0638` | `#ffb3e6` | `#ff3fa4` | `#ff7ad9` |
| Red Desert | `#2b0a0a` | `#ffcf5a` | `#ff3b1f` | `#ff6a3d` |
| Midnight | `#02040f` | `#9fd8ff` | `#3f5bff` | `#5ef0ff` |

Thumbnails come from `npm run thumbs -- neon-sundown`, with no cover.

## 8. Testing

| What | How |
|---|---|
| Motion maths | Vitest (`sundown-motion.js`): bar lengths are capped per side and inside bars stop short of the cover; the arc is 220° and centred on the top; the grid offset depends on time only and wraps per cell; the sun gaps drift with time only; mountain ridges are the same every time, with the valley below y = 600; silence gives no bars and base brightness, with no NaN |
| Template | Vitest: the settings and presets match §6–7; every thumbnail exists; no `Math.random`, `Date.now` or timers; only 8-bit targets |
| Template rules | `npm run check:templates` |
| Real GPU | A 30 s Final section of T-REX **with a cover** on this PC: not blank, bars and grid react, timed against Particle Horizon. Also a few frames without a cover. A phone copy is sent to the owner |
| App | Upload a cover in the live preview, switch Spectrum side and VHS look, export a Draft |

## 9. Risks

| Risk | Plan |
|---|---|
| Thin grid lines alias and crawl while scrolling | Lines are drawn in the shader with a 1-pixel smoothstep and a minimum width, so they stay smooth at any distance |
| Scanlines and grain bloat the file | Scanlines are static; grain follows the ≤ 0.02, ≤ 6×/s rule |
| The VHS fringe smears the small text | The fringe is 2 px and fades to 0 in the middle third of the frame |

## 10. Working practices

- **Branch:** `feat/m6-neon-sundown`, from `feat/m6-halo-rings` (it needs the ring kit). Its pull
  request targets `main` after Halo Rings is merged. Then a plan, native execution, a fresh
  final reviewer, a pull request, and a merge when the owner says so.
- **CLAUDE.md:** the M6 status line and the render speed.
