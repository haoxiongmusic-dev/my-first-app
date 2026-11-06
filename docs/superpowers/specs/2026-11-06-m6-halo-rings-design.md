# Milestone 6c: Halo Rings and the shared ring kit: Design Spec

Date: 2026-11-06
Status: **written for the owner's approval (the three remaining M6 designs are approved together)**
Builds on: [`2026-11-04-music-visualizer-app-design.md`](2026-11-04-music-visualizer-app-design.md)
(template contract §6), Nova Streak
([`2026-11-06-m6-nova-streak-design.md`](2026-11-06-m6-nova-streak-design.md)), and the catalog
note [`Astral Pulse`](../../research/2026-11-04-visualizer-catalog.md#1-astral-pulse--pixbolt).
Siblings: [Neon Sundown](2026-11-06-m6-neon-sundown-design.md),
[Prism Heart](2026-11-06-m6-prism-heart-design.md).

## 1. Summary

Two pieces ship together:

1. **The shared ring kit** in `templates/shared/viz-toolkit.js`. All three remaining templates
   place spectrum bars around a centre, so the maths for that lives in one place: where the
   points sit on a ring, which way is "outward", and which part of the spectrum each point
   shows.
2. **Halo Rings**, our own take on the Astral Pulse look:
   - three nested rings of fine dotted spectrum bars, round or rounded-square
   - the song title and artist in the centre
   - a dusk sky with mountain silhouettes drawn in code, or your own background
   - the whole halo pulses and shakes on the beat

## 2. Shared understanding

**What the owner chose (2026-11-06):** the "nested rings" look (not a planet, not a water
ring), so the three templates stay different. Designs are approved once for all three; then
they are planned and built back to back, each in its own pull request.

**Assumed (owner can correct):**
- The name "Halo Rings" and the four preset names below.
- Each ring shows a different part of the spectrum: bass on the inner ring, mids in the middle,
  treble on the outer ring.

**Success:** the owner picks a preset, exports a song, and gets:
- three rings that clearly dance with different parts of the music
- a pulse and shake on the beats
- an identical picture on every export
- a render no slower than Particle Horizon

## 3. Scope

**In:**
- the ring kit in the toolkit
- `templates/halo-rings/` with its presets and thumbnails
- tests
- CLAUDE.md notes

**Out:**
- a timer or progress bar
- a Colors-panel palette picker (M7)
- a cover image in the centre (that is Neon Sundown's idea)

## 4. The shared ring kit (toolkit)

Pure functions added to `viz-toolkit.js` (and its `.d.ts`). No DOM, so Vitest tests them.

| Function | What it does |
|---|---|
| `ringAngles(count, arcDeg)` | `count` angles in radians, measured clockwise from the top. They spread evenly over an arc of `arcDeg` centred on the top (360 = the full ring). Each point sits in the middle of its slot, so a full ring never doubles up the top point |
| `ringPoint(angle, shape)` | `[x, y, nx, ny]` on a ring of radius 1: the position and the outward direction. y points down, as on screen. `shape` is `"circle"` or `"rounded"`. Rounded is a superellipse \|x\|⁴ + \|y\|⁴ = 1, a square with soft corners. Its outward direction comes from the gradient, normalised |
| `ringValues(spectrum, angles, arcDeg)` | One value per angle, read from the spectrum. 0 at the top is `spectrum[0]` (bass). The two ends of the arc are the last band, so the ring is mirrored left and right. It reads between bands by linear interpolation |
| `beatEnvelope(audio, t, release)` | 0..1: the strongest recent `beat`, fading with time constant `release`. It looks back 0.2 s in 1/60 s steps and never reads before the analysis starts. This is Nova Streak's cover-pulse maths made general; Nova Streak keeps its own copy |
| `bandsToRingCount(pct, full)` | The Bands setting (10..100 %) as a point count: from 20 % of `full` up to `full`, rounded |

## 5. Halo Rings: what you see

Drawn in code at 1920×1080 with WebGL (toolkit helpers and blur), no three.js.

| Element | Where | Notes |
|---|---|---|
| Sky | Full frame | Vertical gradient from near-black navy at the top to a dim glow at the horizon (y ≈ 760), tinted with `accentColor` at 25 % |
| Mountains | Bottom, behind the rings | Three ridgelines of silhouettes, made from seeded 1-D noise (`mulberry32`, seed 7). The farthest is lightest. Static |
| Stars | Top 60 % | 300 small stars, seeded, static |
| Own background | Full frame | When `showBackground` is on and a background is uploaded, it replaces the sky, mountains and stars, blurred by `backgroundBlur` (as in Nova Streak) |
| Rings | Centred at (960, 520) | Three rings with base radii 250, 325 and 400 px. Inner, middle and outer show the low, middle and high thirds of the spectrum window |
| Bars | On each ring, pointing outward | Up to 56 px long, so a bar never reaches the next ring. Style set by `spectrumStyle`: **dots** (columns of 3 px dots every 6 px, the default), **bars** (3 px wide strokes) or **line** (a closed line through the bar tips). A base dot, or a base line, always shows, so the ring shape reads in silence |
| Colour | Rings | Inner `mainColor`, middle halfway, outer `accentColor`. Tips brighten toward white with height. Glow through the blur pass |
| Title | Centre | Song title, 44 px, capitals, letter-spaced, and the artist under it, 22 px. Both shrink to fit 380 px (Nova Streak's fit-to-width) |

## 6. Halo Rings: how it moves with the music

The maths lives in `templates/halo-rings/assets/halo-motion.js`. It is pure, uses the ring kit,
and is unit-tested.

| Part | Signal | Behaviour |
|---|---|---|
| Bar length | spectrum (`spectrumLow`/`High`/`Boost`, `bandCount`) | value × 48 px × `intensity`, cap 56 px |
| Points per ring | `bandCount` | `bandsToRingCount(pct, full)`: full = 72, 96 and 120 points for the inner, middle and outer rings |
| Spin | time | Inner +2°/s, middle −1.5°/s, outer +1°/s, × `spin` %. Time only, so any frame can be drawn on its own |
| Pulse | `beatEnvelope` (release 0.2 s) | When `scaleOnBeat` is on, the halo and the title scale `1 + 0.05 × env × intensity` |
| Shake | `beatEnvelope` | When `shakeOnBeat` is on, the halo moves by up to 8 px × env × `intensity`. The direction is seeded by the song frame, `mulberry32(floor(songTime × 30))`, so a section matches the full render |
| Glow | `loud` | Blur-glow strength `0.6 + 0.4 × loud` |

## 7. Settings (generated form)

| Group | Field id | Type | Default | Range / options |
|---|---|---|---|---|
| Text | `title` | string | `SONG NAME` | max 60 |
| | `artist` | string | `ARTIST NAME` | max 60 |
| | `font` | enum | `Montserrat` | the usual eight fonts |
| Colors | `mainColor` | color | `#8fe8ff` | |
| | `accentColor` | color | `#4f7bff` | |
| Effects | `intensity` | number | 1 | 0.2–2, step 0.1 |
| | `spectrumStyle` | enum | `dots` | Dots, Bars, Line |
| | `ringShape` | enum | `circle` | Circle, Rounded square |
| | `spin` | number | 100 | 0–200 % |
| | `scaleOnBeat` | boolean | true | |
| | `shakeOnBeat` | boolean | true | |
| | `showBackground` | boolean | false | |
| | `backgroundBlur` | number | 40 | 0–100 % |
| Audio | `beatRange` | enum | `kick` | the usual options |
| | `spectrumLow` | number | 30 | 30–16000 Hz |
| | `spectrumHigh` | number | 4000 | 30–16000 Hz |
| | `spectrumBoost` | enum | `2` | 1×, 2×, 4×, 8× |
| | `bandCount` | number | 100 | 10–100 % |

- **Basic tab:** `mainColor`, `accentColor`, `intensity`, `spectrumStyle`, `ringShape`, `font`.
- **Content:** `title`, `artist`.
- `spectrumHigh` defaults to 4000 Hz, not 1000. Split three ways, a 1000 Hz window would leave
  the outer "treble" ring with almost nothing.

## 8. Presets

| Preset | `mainColor` | `accentColor` |
|---|---|---|
| Original | `#8fe8ff` (ice cyan) | `#4f7bff` (blue) |
| Ember | `#ffb35c` | `#ff4a3d` |
| Aurora | `#7dffb0` | `#a46bff` |
| Rose | `#ffd1dc` | `#ff7aa8` |

Thumbnails come from `npm run thumbs -- halo-rings`.

## 9. Testing

| What | How |
|---|---|
| Ring kit | Vitest: the angles are even and centred on the top; a full ring has no duplicate point; circle points have length 1 and point outward; rounded points satisfy x⁴ + y⁴ = 1 and their normals have length 1; `ringValues` gives bass at the top, is mirrored left/right and has the last band at the arc ends; `beatEnvelope` gives 0 in silence and about e⁻¹ after one release; the count mapping goes 10 % → 20 % of full and 100 % → full |
| Motion maths | Vitest (`halo-motion.js`): bar lengths are capped at 56 px; each ring reads its own third of the spectrum; spin angles depend on time only; the shake is the same for the same song time, including from a section; silence gives no bars, no shake and no NaN |
| Template | Vitest: the settings and presets match §7–8; every thumbnail exists; no `Math.random`, `Date.now` or timers; only 8-bit targets |
| Template rules | `npm run check:templates` |
| Real GPU | A 30 s Final section of T-REX on this PC: not blank, rings react, timed against Particle Horizon (6 min 11 s). A phone copy is sent to the owner |
| App | Pick the template, switch style and shape in the live preview, export a Draft |

## 10. Risks

| Risk | Plan |
|---|---|
| Thousands of dots are slow | All dots go in one vertex buffer, rebuilt per frame (at most 288 points × 10 dots × 3 rings ≈ 8,600 quads). That is far below what Particle Horizon draws |
| Thin dots shimmer in the 360p preview | Nova Streak's minimum-size rule, scaled by `PREVIEW_SCALE` |
| The rounded square's dots bunch at the corners | Points are even by angle; on a superellipse with n = 4 the spacing varies by under 30 %. Accepted; checked on frames |

## 11. Working practices

- **Branch:** `feat/m6-halo-rings`, then a plan, native execution, a fresh final reviewer, a pull
  request, and a merge when the owner says so.
- **Later branches:** the next two templates branch from this one, because they reuse the ring
  kit. Their pull requests target `main` and should be merged in order.
- **CLAUDE.md:** the ring kit in the toolkit notes, the M6 status line, and the render speed.
