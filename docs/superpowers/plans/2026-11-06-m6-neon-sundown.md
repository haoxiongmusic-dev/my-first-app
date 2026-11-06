# Neon Sundown: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Neon Sundown template: a synthwave scene with a striped sun holding your
cover art, spectrum bars fanning around the sun, neon wireframe mountains, a scrolling grid
floor, neon text and an optional VHS look.

**Architecture:** A WebGL 1 template built like Halo Rings, with five passes:
1. a **base** pass: a full-screen shader for the sky, sun, gaps and cover, then stars and the
   mountain fills
2. a **light** pass: bars, mountain outlines and grid lines, with mountain fills drawn black to
   hide what is behind them
3. half- and quarter-size blur for glow
4. a **composite** into a target
5. a **VHS** pass to the screen

The music and scene maths live in a pure `sundown-motion.js`. It reuses the ring kit from Halo
Rings (on the branch it starts from).

**Tech Stack:** HyperFrames 0.9.10, WebGL 1 with the toolkit, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-m6-neon-sundown-design.md`

## Global Constraints

- HyperFrames stays pinned at **0.9.10**. No new npm dependencies.
- **Template rules (CLAUDE.md):**
  - Draw only from `hf-seek` or `onUpdate`.
  - No `Math.random`, `Date.now` or timers. Use `mulberry32`.
  - 8-bit targets only.
  - The picture is identical without runtime data.
  - No DOM measuring in `onUpdate`.
  - Grain ≤ 0.02, changing at most 6×/s.
  - `npm run check:templates` passes before a template commit.
- **Image setting rules (CLAUDE.md):**
  - The template receives a picture location or `""`.
  - Set the `<img>` `src` at startup and redraw on `load`.
  - A failed load leaves the cover out.
- **Never commit:** `storage/`, `test-renders/`, audio, video, or song-derived data.
- Run `npm run check` before every commit. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Sizes:** every size is in 1080p pixels and scales with `PREVIEW_SCALE`.
- **Coordinates:** shapes use centre-relative coordinates with y down, as in Halo Rings. The sun
  centre is (0, −110), which is screen (960, 430). The horizon is centre-relative y = 100,
  which is screen 640.
- **Bar lengths are squared** (Halo Rings' ruling: analyzer values sit around 0.5–1 in loud
  music).

## Review Focus

1. **The 360p preview:** grid lines and mountain outlines must stay visible and not crawl. Lines
   are drawn with a minimum width of about one screen pixel. (Task 2, step 5: compare a 360p
   preview frame with the render.)
2. **A cover that fails to load, or no cover:** a plain striped sun with no error box, and inside
   bars running to the sun's centre region. (Task 2: render without `--image`; Task 1 test on
   inner limits without a cover.)
3. **Spectrum side "inside" with a cover:** the bars must never cover the picture. (Task 1 test:
   inside bars end at least 6 px outside the cover radius at the maximum pulse.)
4. **Grid speed 0 and VHS off:** the grid is still, and there are no scanlines or grain. (Task 1
   test: `gridOffset` at 0 % is 0 for any time; Task 2 frame with `vhsLook=false`.)
5. **A long artist or title** at 54 px: it shrinks to the 80 % title-safe width, 1536 px. (Task 2
   test: `var TITLE_SAFE = 1536`; step 5 looks at a long title.)

---

### Task 1: Neon Sundown's motion and scene maths

**Files:**
- Create: `templates/neon-sundown/assets/sundown-motion.js` (UMD, `window.SundownMotion`)
- Test: `src/lib/neon-sundown-motion.test.ts`

**Interfaces:**
- Consumes: the toolkit's `bandsToRingCount`, `beatEnvelope` and `mulberry32` (passed in or used
  by the caller).
- Produces (`SundownMotion`):
  - Constants:
    - `ARC = 220`
    - `SUN = { x: 0, y: -110, r: 200 }`
    - `COVER_R = 140`
    - `HORIZON = 100` (centre-relative y)
    - `OUT_START = 212`, `OUT_SCALE = 120`, `OUT_MAX = 120`
    - `IN_SCALE = 50`, `IN_MAX = 50`, `PULSE_RELEASE = 0.2`
  - `barLengths(values, intensity, side: "outside"|"inside"|"both", hasCover, pulse) → { outer: Float32Array, inner: Float32Array }`
    - `outer = side ≠ "inside" ? min(OUT_MAX, v²·OUT_SCALE·intensity) : 0`
    - `inner = side ≠ "outside" ? min(innerMax, v²·IN_SCALE·intensity) : 0`, where
      `innerMax = hasCover ? min(IN_MAX, SUN.r − COVER_R − 6) : IN_MAX`. Lengths are in
      un-pulsed pixels; the caller scales by `pulse`.
  - `barCount(pct) = bandsToRingCount(pct, 96)`. It takes the toolkit as an argument:
    `barCount(V, pct)`.
  - `sunPulse(env, intensity) = 1 + 0.04·env·intensity`
  - `gridOffset(songTime, speedPct)`: the fractional part of `songTime·2·speedPct/100`, in
    [0, 1)
  - `gridBrightness(env) = 0.55 + 0.45·env`
  - `mountainLevel(loud) = 0.6 + 0.4·loud`
  - `stripeOffset(songTime)`: the fractional part of `songTime / 4`
  - `sunGaps(offset) → Array<[top, bottom]>`: in sun units (0 = centre, 1 = bottom edge).
    - Gap centres sit at `(i + offset)/6` for i = 0..6.
    - Keep those with a centre in (0, 1).
    - The half-thickness is `0.008 + 0.035·centre`.
  - `buildMountains(mulberry32) → { far: Float32Array(97), near: Float32Array(97) }`: screen y
    (top-left coordinates) of the ridge tops at x = 0, 20, …, 1920. Seed 5.
    - The height above the horizon (640) is `envelope(x)·maxH·(0.55 + 0.45·noise)`, where
      noise is the seeded smooth value noise (Halo Rings' 160 px + 40 px octaves, mapped to
      0..1).
    - `envelope = clamp((|x − 960| − 160)/600, 0, 1)^0.8`
    - maxH is 150 for the far ridge and 230 for the near one.
  - `buildStars(mulberry32) → Float32Array(200·4)`: `[x, y, size 1..2, brightness 0.2..0.7]`, with
    y < 540 (top half). Seed 13.

- [ ] **Step 1: Write the failing tests** in `src/lib/neon-sundown-motion.test.ts` (load like
  `halo-rings-motion.test.ts`):
  - `barLengths([0, 0.5, 1], 1, "outside", false, 1)` gives outer `[0, 30, 120]` and inner all 0.
  - `"inside"` gives outer all 0 and inner `[0, 12.5, 50]`.
  - `"both"` fills both.
  - At intensity 2 the outer caps at 120.
  - **With a cover (Review Focus 3):** inner caps at `min(50, 54) = 50`, and
    `SUN.r·pulse − inner·pulse ≥ COVER_R·pulse + 6` at `pulse = sunPulse(1, 2)`.
  - **Without a cover:** inner caps at 50 (Review Focus 2).
  - `barCount(V, 70)` = `bandsToRingCount(70, 96)`. The angles `V.ringAngles(barCount, ARC)`
    stay within ±110°.
  - `sunPulse(1, 1)` = 1.04 and `sunPulse(0, 2)` = 1.
  - `gridOffset`:
    - `gridOffset(0.25, 100)` = 0.5
    - `gridOffset(1.0, 100)` = 0
    - in [0, 1) for 100 random-free sample times
    - `gridOffset(t, 0)` = 0 for any t (Review Focus 4)
  - `gridBrightness(0)` = 0.55 and `gridBrightness(1)` = 1.
  - `mountainLevel(0)` = 0.6.
  - `stripeOffset(5)` = 0.25.
  - `sunGaps(0)`: centres at 1/6..5/6, thicker as they go down, all inside (0, 1).
    `sunGaps(0.5)` has its first centre at 1/12.
  - `buildMountains`:
    - the same every time; each 97 long
    - every y ≤ 640 and ≥ 640 − maxH
    - for x in [760, 1160] (indices 38..58), y ≥ 600
  - `buildStars`: the same every time, 200 stars, y < 540.
  - **Silence:** zero spectrum gives all-zero bars, `beatEnvelope` 0, `sunPulse` 1 and
    `gridBrightness` 0.55, with no NaN.
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/neon-sundown-motion.test.ts`
  Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `sundown-motion.js` to the interfaces.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Neon Sundown motion and scene maths`.

### Task 2: The Neon Sundown template

**Files:**
- Create in `templates/neon-sundown/`:
  - `index.html`
  - `template.json`
  - `hyperframes.json` (copy)
  - `assets/viz-toolkit.js` (via sync)
- Create: `src/lib/neon-sundown.test.ts`
- Modify: `src/lib/repo-hygiene.test.ts` (the template's `audio-data.js` and `song.wav`)

**Settings** (spec §6, in this order):

| id | declaration |
|---|---|
| `title` | string `SONG NAME`, max 60 |
| `artist` | string `ARTIST NAME`, max 60 |
| `font` | enum `Montserrat`, the usual eight fonts |
| `cover` | image, `""`, fit `square`, label "Cover art" |
| `skyColor` | color `#1a0533`, label "Sky color" |
| `sunTopColor` | color `#ffd23f`, label "Sun top color" |
| `sunBottomColor` | color `#ff2e88`, label "Sun bottom color" |
| `gridColor` | color `#00e5ff`, label "Grid color" |
| `intensity` | number 1, 0.2–2, step 0.1 |
| `spectrumSide` | enum `outside`: `outside` "Outside", `inside` "Inside", `both` "Both" |
| `gridSpeed` | number 100, 0–200, step 1, % |
| `vhsLook` | boolean true, label "VHS look" |
| `beatRange` | enum `kick`, the usual options |
| `spectrumLow` | 30, 30–16000, step 10, Hz |
| `spectrumHigh` | 1000, 30–16000, step 10, Hz |
| `spectrumBoost` | enum `2`, 1×/2×/4×/8× |
| `bandCount` | 70, 10–100, step 1, % |

**`template.json`:**
- name `Neon Sundown`
- description `A synthwave sunset: your cover in a striped sun, bars fanning around it, a neon grid rushing toward you.`
- groups:
  - Text [title, artist, font]
  - Images [cover]
  - Colors [skyColor, sunTopColor, sunBottomColor, gridColor]
  - Effects [intensity, spectrumSide, gridSpeed, vhsLook]
  - Audio [beatRange, spectrumLow, spectrumHigh, spectrumBoost, bandCount]
- basic [skyColor, sunTopColor, sunBottomColor, gridColor, intensity, spectrumSide, vhsLook, font]
- content [title, artist, cover]
- presets (spec §7), thumbnails `presets/original.jpg`, `flamingo.jpg`, `red-desert.jpg` and
  `midnight.jpg`

**Drawing** (all sizes × `PREVIEW_SCALE` where they are pixel widths):
- **Base pass (into `base`):**
  - `BASE_FS`, full screen:
    - sky gradient from `skyColor` at the top to `mix(skyColor, sunBottomColor, 0.3)` at the
      horizon, with dark floor below the horizon (`skyColor` × 0.35)
    - the sun disc at its pulsed radius, a vertical gradient from top to bottom colour, with
      soft 1 px edges
    - the `sunGaps(stripeOffset)` cut to the sky colour in the lower half
    - the cover inside `COVER_R·pulse` when loaded, with a 4 px `sunTopColor` ring (the gaps
      don't cross it)
    - a soft sun halo `sunBottomColor × 0.25`, falling off over 260 px outside the disc
  - Then the stars, as additive points.
  - Then the mountain fills, far then near, from the ridge to the horizon:
    - far `mix(skyColor, black, 0.6)` lifted 30 % toward `gridColor` × 0.08
    - near `skyColor × 0.4`
- **Light pass (into `scene`):**
  1. The bars, additive. Use `ringAngles(barCount, 220)` and `ringPoint(a, "circle")`;
     `ringValues` of the spectrum; lengths from `barLengths` × pulse.
     - Outer bars run from `OUT_START·pulse` outward, inner from `SUN.r·pulse` inward.
     - Width 4 px. The colour runs from `sunTopColor` at the base to `sunBottomColor` at the
       tip.
  2. The mountain fills again, drawn **black with blending off**, so bars behind the mountains
     disappear.
  3. The mountain outlines, additive:
     - 2 px strokes in `gridColor` × `mountainLevel(loud)`
     - every 3rd ridge point gets a faint vertical wire line to the horizon, 1 px × 0.25
  4. The grid: `GRID_FS`, full-screen and additive, below the horizon only.
     - `u = (x − 960)/(y − 640)·k`, with k = 6 cells across the near edge.
     - `v = 440/(y − 640) + gridOffset`.
     - The line coverage is computed analytically in pixels:
       `distU / |du/dx|`, `distV / |dv/dy|`, each through `1 − smoothstep(w − 0.5, w + 0.5, d)`
       with `w = max(1, 1.2/PREVIEW_SCALE)/2`.
     - Fade toward the horizon.
     - Colour `gridColor` × `gridBrightness(env)`, plus a 3 px bright horizon line.
- **Glow:** Halo Rings' half- and quarter-size blur chain on `scene`.
- **Composite (into `final`):** base screened with (scene + bloom), as in Halo Rings, with no
  vignette yet.
- **VHS pass (to the screen):** when `vhsLook` is on:
  - **fringe:** red read at x + f, blue at x − f, where
    `f = 2 px·(1 − 0.8·exp(−((x−960)/320)²))`
  - **scanlines:** `1 − 0.12·step(fract(y_px/3), 0.34)`, with y_px in 1080p units
  - **tracking band:** brightness +4 % in a 40 px band at
    `y = 1080·(1 − fract(songTime/7))`
  - **grain:** `mulberry32`-free hash noise on the pixel and `floor(songTime·6)`, amplitude
    0.015
  - **vignette:** as Halo Rings
  
  When `vhsLook` is off: a plain copy with the vignette.
- **Cover:** copied from Nova Streak:
  - `coverImg`, `setCover`, `uploadCover`
  - redraw on `load`; `error` leaves the cover out
  - accept a string or `{url}`
- **Text:**
  - `#titles` at top 800, centred: `#songArtist` (26 px, letter-spacing 0.4em) over
    `#songTitle` (54 px, weight 700, capitals)
  - colour `#fff6fb`, glow `0 0 12px sunBottomColor, 0 0 32px sunBottomColor` at 60 %
  - each fitted to `var TITLE_SAFE = 1536`
- **Timeline:** the titles fade in and the picture fades out at the end, as in Halo Rings.

- [ ] **Step 1: Write the failing test** `src/lib/neon-sundown.test.ts`, shaped like
  `halo-rings.test.ts`:
  - `validateTemplate` gives `[]`
  - the ids and defaults from the table
  - `cover` is `{type:"image", fit:"square", default:""}`
  - the `spectrumSide` options
  - the groups, basic and content lists
  - the presets
  - `index.html` loads `assets/sundown-motion.js` and `assets/viz-toolkit.js`
  - no `Math.random`, `Date.now`, `setTimeout` or `setInterval`; no `HALF_FLOAT` or
    `OES_texture`
  - it contains `V.createTarget(`, `var TITLE_SAFE = 1536`, and `coverImg.addEventListener("error"`
- [ ] **Step 2: Run.** Expected: FAIL (no template).
- [ ] **Step 3: Build the template.** Run `npm run sync:toolkit` and `npm run template:assets`.
- [ ] **Step 4: Check.** Run the template test, `repo-hygiene`, and
  `npm run check:templates -- neon-sundown`. Expected: pass, with a reaction ≥ 6. Raise the
  reaction if needed, never the check.
- [ ] **Step 5: Look at it.** Draft renders of T-REX 60–63 s, each with a distinct
  `--set title=…`. Read a beat frame and a between-beats frame of each:
  - default, with `--image cover=<generated test pattern>`
  - no cover, with `spectrumSide=both`
  - `vhsLook=false`, `gridSpeed=0`, with a 50-character title (Review Focus 4 and 5)
- [ ] **Step 6: Commit:** `feat: Neon Sundown template`.

### Task 3: Presets, real-GPU timing, app check, docs

- [ ] **Step 1: Thumbnails.** Add the "every preset has its thumbnail" test (it FAILS), run
  `npm run thumbs -- neon-sundown`, then the test PASSES.
- [ ] **Step 2: Real GPU.**
  - A 30 s Final of T-REX 60–90 s **with a cover** (generated test pattern), timed, with
    `--phone`. Check its frames.
  - Send the phone copy to the owner.
- [ ] **Step 3: App check:**
  - open `/edit/neon-sundown`
  - upload a cover through the Content card (Nova Streak's `DataTransfer` method) and see it in
    the preview
  - compare a 360p frame with a render frame (Review Focus 1)
  - switch Spectrum side and VHS
  - export a Draft through the API with the cover
  - check the console for errors
- [ ] **Step 4: CLAUDE.md.** Tick Neon Sundown with its plan path, and add its render speed.
- [ ] **Step 5:** Run `npm run check` and `npm run check:templates`. Both green.
- [ ] **Step 6: Commit:** `feat: Neon Sundown presets; docs and timings`.
