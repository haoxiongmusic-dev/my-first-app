# Halo Rings and the shared ring kit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared ring kit to the toolkit and the Halo Rings template: three nested
dotted spectrum rings over a drawn dusk sky, pulsing and shaking on the beat.

**Architecture:** The ring kit is a set of pure functions in `templates/shared/viz-toolkit.js`,
synced into every template. Halo Rings is a WebGL 1 template built like Nova Streak, with a
shape layer that is blurred for glow and a composite pass. Its music maths lives in a pure,
Node-loadable `halo-motion.js`.

**Tech Stack:** HyperFrames 0.9.10, WebGL 1 with the toolkit, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-m6-halo-rings-design.md`

## Global Constraints

- HyperFrames stays pinned at **0.9.10**. No new npm dependencies.
- **Template rules (CLAUDE.md):**
  - Draw only from the `hf-seek` time or the timeline's `onUpdate`.
  - No `Math.random()`, `Date.now()` or timers. Use `mulberry32`.
  - 8-bit render targets only. Check compile and link status (the toolkit's `createProgram` does).
  - The picture looks identical without the `settings`/`preview` runtime data.
  - Don't measure the DOM inside `onUpdate`.
  - `npm run check:templates` passes before a template commit.
- Toolkit edits go in `templates/shared/viz-toolkit.js` and `.d.ts`, then `npm run sync:toolkit`.
- **Never commit:** `storage/`, `test-renders/`, audio, video, or song-derived data.
- Run `npm run check` before every commit. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No `.js` scratch files in the repo tree. Use the session scratchpad.
- Every pixel size is in 1080p pixels and scales with `PREVIEW_SCALE` (Nova Streak's `thin()`).

## Review Focus

1. **The 360p preview** (`preview` scale 1/3): dots 3 px wide shrink to 1 px and can vanish or
   shimmer. The minimum-size rule must keep them visible. (Task 3, step 5: compare a 360p
   preview frame with a render frame.)
2. **A very long title or artist** in a 380 px centre: it must shrink to fit and never spill
   over the inner ring. (Task 3 test: `fitTitles` uses a 380 px limit; step 5 looks at a
   60-character title.)
3. **Spectrum low ≥ spectrum high, or a window of a single band:** each ring's third must still
   read valid bands, with no NaN and no empty ring. (Task 2 test.)
4. **Bands at 10 %** (the fewest points): rings must still close and stay evenly spaced. (Task 1
   test on `ringAngles` with small counts; Task 2 test at 10 %.)
5. **Rounded square with shake and pulse at intensity 2:** the outer ring must stay inside the
   frame. (Task 2 test: the outer reach at the maximum is under 520 px from the centre
   vertically.)

---

### Task 1: The ring kit in the toolkit

**Files:**
- Modify: `templates/shared/viz-toolkit.js`, `templates/shared/viz-toolkit.d.ts`
- Test: `src/lib/viz-toolkit.test.ts`
- Then `npm run sync:toolkit` (updates every template's copy)

**Interfaces:**
- Produces (on `VizToolkit`):
  - `ringAngles(count: number, arcDeg: number): Float32Array`: angle k is
    `(-arc/2 + arc·(k + 0.5)/count)` in radians, measured clockwise from the top.
  - `ringPoint(angle: number, shape: "circle" | "rounded"): [number, number, number, number]`:
    `[x, y, nx, ny]` at radius 1, y down.
    - circle: `(sin a, -cos a)`, normal equal to it
    - rounded: scale the circle direction `d` so that `x⁴ + y⁴ = 1`
      (`p = d / (dx⁴ + dy⁴)^(1/4)`). The normal is `(x³, y³)` normalised.
  - `ringValues(spectrum: ArrayLike<number>, angles: ArrayLike<number>, arcDeg: number): Float32Array`:
    - position `f = |a| / (arc/2)` in [0, 1], read at `f·(n−1)` with linear interpolation
    - at `a = 0` this is `spectrum[0]`
  - `beatEnvelope(audio: ToolkitAudio, t: number, release: number): number`: Nova Streak's
    `coverEnvelope`, generalised:
    - 12 look-back steps of 1/60 s
    - `max(beat·exp(−age/release))`, clamped to 0..1
    - never samples before `-(audio.offset || 0)`
  - `bandsToRingCount(pct: number, full: number): number`:
    `Math.round(full·(0.2 + 0.8·(pct − 10)/90))`

- [ ] **Step 1: Write the failing tests** in `src/lib/viz-toolkit.test.ts`, in a new `describe("ring kit")`:
  - `ringAngles(4, 360)` ≈ `[-135°, -45°, 45°, 135°]` in radians.
  - `ringAngles(5, 220)`: symmetric about 0, all within ±110°, with equal gaps.
  - `ringAngles(1, 360)` is `[0]`.
  - For 24 angles, `ringPoint(a, "circle")`:
    - has length 1 and normal equal to the position
    - gives `ringPoint(0, …)` = `[0, -1, 0, -1]` (the top)
  - For 24 angles, `ringPoint(a, "rounded")`:
    - satisfies `x⁴ + y⁴ ≈ 1` (1e-6)
    - has normals of length 1
    - has a normal whose dot product with the position is > 0
    - gives `ringPoint(π/4, "rounded")` with a normal ≈ `(√½, √½)`
  - `ringValues([1, 0.5, 0], ringAngles(4, 360), 360)`:
    - values mirrored (`v[0] === v[3]`, `v[1] === v[2]`)
    - at angle 0 (`ringValues([1,.5,0],[0],360)`) the value is `1`
    - at `±π` it is `0`
  - `beatEnvelope`:
    - silence gives 0
    - a kick at 1.0 s (Nova's `frames()` shape) gives > 0.9 at 1.0
    - `≈ exp(−1)` (1 digit) at `1.0 + release` for `release = 0.18`
  - `bandsToRingCount`: `(10, 120)` → 24, `(100, 120)` → 120, `(100, 72)` → 72.
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/viz-toolkit.test.ts`
  Expected: FAIL (`viz.ringAngles is not a function`).
- [ ] **Step 3: Implement the five functions** in `viz-toolkit.js`, export them, and type them in
  `viz-toolkit.d.ts`. `ringPoint` returns a plain array.
- [ ] **Step 4: Run.** Run `npx vitest run src/lib/viz-toolkit.test.ts`, then `npm run sync:toolkit`.
  Expected: PASS. The sync reports every template updated.
- [ ] **Step 5: Commit:** `feat: ring kit in the toolkit (ring points, mirrored values, beat envelope)`.
  Run `npm run check` first.

### Task 2: Halo Rings' motion maths

**Files:**
- Create: `templates/halo-rings/assets/halo-motion.js` (UMD like `streak-motion.js`:
  `module.exports` under Node, `window.HaloMotion` in the browser)
- Test: `src/lib/halo-rings-motion.test.ts`

**Interfaces:**
- Consumes: the Task 1 ring kit (passed in as `V`, so the file needs no `require`).
- Produces (`HaloMotion`):
  - `RINGS`: `[{radius: 250, full: 72, spin: 2}, {radius: 325, full: 96, spin: -1.5}, {radius: 400, full: 120, spin: 1}]`
    (spin in °/s)
  - `BAR_SCALE = 48`, `BAR_MAX = 56`
  - `ringThird(spectrum: ArrayLike<number>, ring: 0 | 1 | 2): Float32Array`: the ring's third.
    - For n bands, ring r takes indices `floor(r·n/3) .. max(floor((r+1)·n/3), floor(r·n/3)+1) − 1`,
      clamped to `n − 1`. It is never empty.
  - `barLengths(values: ArrayLike<number>, intensity: number): Float32Array`:
    `min(BAR_MAX, v·BAR_SCALE·intensity)`
  - `spinAngle(ring: number, songTime: number, spinPct: number): number`: radians,
    `RINGS[ring].spin·songTime·spinPct/100` in degrees, converted.
  - `pulseScale(env: number, intensity: number, on: boolean): number`:
    `on ? 1 + 0.05·env·intensity : 1`
  - `shakeOffset(env: number, intensity: number, songTime: number, on: boolean, mulberry32): [dx, dy]`:
    - `[0, 0]` when off or env is 0
    - otherwise direction angle `2π·mulberry32(floor(songTime·30))()` and length `8·env·intensity`
  - `PULSE_RELEASE = 0.2`
  - `glowLevel(loud: number): number`: `0.6 + 0.4·loud`
  - `buildSky(mulberry32): { ridges: Float32Array[3], stars: Float32Array }`:
    - three ridgelines of 97 heights each (x every 20 px, 0..1920), seed 7
    - far ridge base y 700, mid 760, near 840; amplitude 60 / 80 / 110 px; smooth value noise
      from the seeded generator
    - 300 stars `[x, y, size 1..2.2, brightness 0.3..1]` with y < 0.6·1080

- [ ] **Step 1: Write the failing tests** in `src/lib/halo-rings-motion.test.ts` (load the toolkit
  and the motion file like `nova-streak-motion.test.ts`):
  - `ringThird` on 12 values gives indices 0–3, 4–7, 8–11. On 2 values every ring is non-empty
    with no NaN (Review Focus 3). On 1 value all three rings read that value.
  - `barLengths([0, 0.5, 2], 1)` → `[0, 24, 56]`. At intensity 2: `[0, 48, 56]`.
  - `spinAngle(0, 1, 100)` ≈ 2° in radians. `spinAngle(1, 1, 100)` ≈ −1.5°. At `spinPct` 0
    it is 0. The same inputs give the same output.
  - `pulseScale(1, 1, true)` = 1.05; `pulseScale(1, 2, false)` = 1.
  - `shakeOffset`:
    - `[0, 0]` when off, or when env is 0
    - length 8 at env 1, intensity 1
    - identical for the same songTime
    - a section (`sliceAnalysis(full, 1.5, 3)`) at t = 0.6 matches the full song at 2.1, by
      passing `t + audio.songStart`
  - **Frame bounds (Review Focus 5):** for the outer ring, with rounded shape and the worst-case
    radius `400·pulseScale(1, 2, true) + BAR_MAX·1.1 + 8·2` (≈ 517.6), the reach is < 520. The
    centre is at y = 520 and the frame is 1080 tall.
  - **10 % bands (Review Focus 4):** `bandsToRingCount(10, full)` for each ring is ≥ 14, and
    its `ringAngles` have equal gaps.
  - `buildSky`:
    - the same every time
    - 3 ridges of 97 heights, each within base ± amplitude
    - 300 stars, all with y < 648
  - **Silence:** with the toolkit's silent audio, `barLengths(ringThird(spectrum))` are all 0,
    `beatEnvelope` is 0 and `shakeOffset` is `[0, 0]`, with no NaN anywhere.
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/halo-rings-motion.test.ts`
  Expected: FAIL (cannot find `halo-motion.js`).
- [ ] **Step 3: Implement `halo-motion.js`** with the interfaces above. Ridge noise: seeded
  values every 160 px, smoothstep-interpolated, plus a second octave every 40 px at a third of
  the amplitude.
- [ ] **Step 4: Run.** Run: `npx vitest run src/lib/halo-rings-motion.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Halo Rings motion maths`.

### Task 3: The Halo Rings template

**Files:**
- Create in `templates/halo-rings/`:
  - `index.html`
  - `template.json`
  - `hyperframes.json` (copy Nova Streak's)
  - `assets/background.jpg` (copy Nova Streak's)
  - `assets/viz-toolkit.js` (via sync)
- Create: `src/lib/halo-rings.test.ts`
- Modify: `src/lib/repo-hygiene.test.ts`, adding `templates/halo-rings/assets/audio-data.js`
  and `templates/halo-rings/assets/song.wav`

**Interfaces:**
- Consumes: Task 1 (`ringAngles`, `ringPoint`, `ringValues`, `beatEnvelope`,
  `bandsToRingCount`) and Task 2 (`HaloMotion`).
- Produces: a template with the spec §7 settings, in the spec's order:
  - title, artist, font
  - mainColor `#8fe8ff`, accentColor `#4f7bff`
  - intensity
  - spectrumStyle: enum `dots`, options `dots` "Dots", `bars` "Bars", `line` "Line"
  - ringShape: enum `circle`, options `circle` "Circle", `rounded` "Rounded square"
  - spin: 100, 0–200, step 1, %
  - scaleOnBeat: true; shakeOnBeat: true
  - showBackground: false; backgroundBlur: 40
  - beatRange `kick`, spectrumLow 30, spectrumHigh 4000, spectrumBoost `"2"`, bandCount 100

  The font and beatRange options are copied verbatim from Nova Streak.

**`template.json`:**
- name `Halo Rings`
- description `Three nested rings of dotted spectrum bars around your title, pulsing on the beat.`
- groups:
  - Text [title, artist, font]
  - Colors [mainColor, accentColor]
  - Effects [intensity, spectrumStyle, ringShape, spin, scaleOnBeat, shakeOnBeat, showBackground, backgroundBlur]
  - Audio [beatRange, spectrumLow, spectrumHigh, spectrumBoost, bandCount]
- basic [mainColor, accentColor, intensity, spectrumStyle, ringShape, font]
- content [title, artist]
- presets (spec §8):
  - Original `#8fe8ff`/`#4f7bff`
  - Ember `#ffb35c`/`#ff4a3d`
  - Aurora `#7dffb0`/`#a46bff`
  - Rose `#ffd1dc`/`#ff7aa8`

  The thumbnails are `presets/original.jpg`, `ember.jpg`, `aurora.jpg` and `rose.jpg`.

**Drawing:** copy Nova Streak's `index.html` structure: settings merge, `rebuild()`/`draw()`,
the runtime-data handlers, `thin()`, the shape buffer, half- and quarter-size blur, and the
composite. Change these parts:
- **Audio.** `createAudio` is built with `spectrumCount = 30` (fine bands, so each third has
  ten). For each ring: `ringValues(ringThird(spectrum, r), angles, 360)`, where
  `angles = ringAngles(bandsToRingCount(bandCount, full), 360)` plus the ring's `spinAngle`.
  The ring kit only needs the angle relative to the top for its values, so compute values from
  the un-spun angles and positions from the spun ones.
- **Ring centre.** `(0, −20)` in centre-relative pixels (screen y = 520), plus the shake offset.
  Every radius is multiplied by `pulseScale`.
- **Styles:**
  - **dots:** for each point, quads of 3 px every 6 px from the radius out to the bar length.
    The base dot is always drawn. Colour goes from the ring colour at the base to 75 % white at
    a 56 px tip.
  - **bars:** a `segment` of width 3 from the radius to radius + length, plus a 3 px base dot.
  - **line:** segments joining the tips of neighbouring points (closing the ring), width 2.5,
    with a base line at 1.5 px and 40 % brightness.
  - Ring colours: inner `MAIN`, middle `mix(MAIN, ACC, 0.5)`, outer `ACC`.
  - Dot quads use `thin()` for both width and height (Review Focus 1).
- **Sky.** Draw it into its own target once per `setup()`, not per frame, because it is static:
  - the gradient
  - the ridges as filled triangle strips: far `mix(skyTop, ACC, 0.18)`, mid darker, near
    near-black
  - the stars as points
  - When `showBackground` is on, the blurred picture replaces the sky (Nova Streak's
    `loadBackground`, blur `backgroundBlur`).
- **Composite.** The sky, then the light layer screened on top as in Nova Streak, with the
  bloom gain multiplied by `glowLevel(loud)`. Add a horizon glow that brightens with `loud`
  (`ACC × 0.10 × (0.6 + 0.8·loud)`, a Gaussian around y = 760), so the quiet-vs-loud check has
  enough to see.
- **Titles.** `#titles` sits centred at screen y = 520:
  - `#songTitle` (`data-var-text="title"`, 44 px, weight 600, letter-spacing 0.24em, capitals)
  - `#songArtist` (`data-var-text="artist"`, 22 px, letter-spacing 0.3em, 75 % opacity)
  - Each is fitted to **380 px** with Nova Streak's shrink loop, applied to each line on its own.
  - The block's CSS `transform: scale(pulse) translate(shake)` is set in `draw()`. Setting a
    style is allowed in `onUpdate`; measuring is not.
  - The text-shadow glow is in `mainColor`.
- **Fade.** The same fade-in of the titles and fade to black at the end as Nova Streak.

- [ ] **Step 1: Write the failing test** `src/lib/halo-rings.test.ts`, shaped like
  `nova-streak.test.ts`:
  - `validateTemplate` gives `[]`
  - ids in order, and defaults exactly as above
  - the groups, basic and content lists
  - the presets' names, colours and thumbnail paths
  - `index.html` loads `assets/halo-motion.js` and `assets/viz-toolkit.js`
  - it contains no `Math.random`, `Date.now`, `setTimeout` or `setInterval`, and no
    `HALF_FLOAT`/`OES_texture`
  - it contains `V.createTarget(`
  - it contains `var TITLE_SAFE = 380` (Review Focus 2)
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/halo-rings.test.ts`. Expected: FAIL (no
  template folder).
- [ ] **Step 3: Build the template.** Then run `npm run sync:toolkit` and
  `npm run template:assets`.
- [ ] **Step 4: Check.** Run `npx vitest run src/lib/halo-rings.test.ts src/lib/repo-hygiene.test.ts`,
  then `npm run check:templates`.
  Expected: all pass, including the reaction check (difference ≥ 6). If the reaction is too
  small, raise the template's reaction (bar scale, horizon glow, ring glow); never lower the
  check.
- [ ] **Step 5: Look at it.**
  - Render frames with
    `npm run render -- halo-rings "C:\Users\ydogg\Downloads\AXIOM\Hardlight\T-REX.wav" --start 60 --end 64 --preview`.
  - Read 3 frames: one on a beat, one between beats, and one with
    `--set ringShape=rounded --set spectrumStyle=bars`.
  - Also read one with `--set spectrumStyle=line` and a 60-character `--set title=…`
    (Review Focus 2).
  - Then open `/edit/halo-rings` in the built-in browser at 360p, and compare it with the render
    frame at the same time (Review Focus 1).
- [ ] **Step 6: Commit:** `feat: Halo Rings template`.

### Task 4: Presets, real-GPU timing, app check, docs

**Files:**
- Create: `templates/halo-rings/presets/*.jpg` (`npm run thumbs -- halo-rings`)
- Modify: `src/lib/halo-rings.test.ts`, `CLAUDE.md`

- [ ] **Step 1: Thumbnails.** Add `it("every preset has its thumbnail")`, run it (FAIL), run
  `npm run thumbs -- halo-rings`, then run it again (PASS).
- [ ] **Step 2: Real GPU.**
  - Run `npm run render -- halo-rings "C:\Users\ydogg\Downloads\AXIOM\Hardlight\T-REX.wav" --start 60 --end 90`,
    in the background, and time it against Particle Horizon's 6 min 11 s.
  - Check frames: not blank, and the three rings react differently.
  - Make a `--phone` copy under 30 MB and send it to the owner.
- [ ] **Step 3: App check** (dev server, built-in browser):
  - open `/edit/halo-rings`
  - switch style and shape in Customize and see the preview change
  - export a Draft through `POST /api/exports`
  - check the console for errors
- [ ] **Step 4: CLAUDE.md:**
  - a template-rules bullet on the ring kit (`ringAngles`/`ringPoint`/`ringValues`/
    `beatEnvelope`/`bandsToRingCount`; bass at the top, mirrored)
  - tick Halo Rings in the M6 status, with spec and plan paths
  - Halo Rings' render speed in machine facts
- [ ] **Step 5: Run** `npm run check` and `npm run check:templates`. Expected: both green.
- [ ] **Step 6: Commit:** `feat: Halo Rings presets; docs and timings`.
