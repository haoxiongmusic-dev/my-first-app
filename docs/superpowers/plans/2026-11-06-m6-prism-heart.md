# Prism Heart: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Prism Heart: a turning iridescent glass crystal (three.js, our own glass shader)
inside a dotted spectrum ring, over drawn bokeh or your own background, with the artist and
title on the left.

**Architecture:** A three.js template set up like Iron Wraith (`assets/three-kit.js`, renderer
built once, `apply()` on settings, `resize()` on preview scale, an 8-bit `EffectComposer` with
bloom). Each frame has four steps:
1. The backdrop (bokeh discs or the uploaded picture) is drawn into an 8-bit render target.
2. That target is the scene background **and** the texture the glass shader bends.
3. The crystal and its glow sprite are drawn in the main scene.
4. The dotted ring and the grain are drawn in a second, screen-space pass.

The geometry and music maths live in a pure `prism-motion.js`.

**Tech Stack:** HyperFrames 0.9.10, three.js 0.187.0 via `three-kit.js` (no rebuild needed: it
already exports `THREE`, `EffectComposer`, `RenderPass`, `UnrealBloomPass` and `OutputPass`),
and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-m6-prism-heart-design.md`

## Global Constraints

- HyperFrames **0.9.10**; three.js stays at **0.187.0**; no new npm dependencies.
- **Template rules and three.js rules (CLAUDE.md):**
  - Seeded randomness only; no timers.
  - **Every render target is `UnsignedByteType`:** the composer target, every bloom target,
    and the backdrop target.
  - No `HalfFloatType`, `FloatType` or `transmission`.
  - Build the renderer once.
  - Shader errors throw into the error box (`renderer.debug.onShaderError`).
  - Coloured glows use additive sprites (8-bit bloom only catches near-white).
  - `npm run check:templates` passes.
- **Never commit:** `storage/`, `test-renders/`, audio, video, or song-derived data.
- Run `npm run check` before every commit. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Bar lengths are squared** (Halo Rings' ruling).
- **Grain** ≤ 0.02, changing at most 6×/s.

## Corrections to the spec (rulings made while planning)

- **The text block fits 560 px, not 640.** The ring around the crystal reaches x = 740 at full
  bars, and the text starts at x = 140, so 640 px would touch it. Cost if wrong: slightly smaller
  long titles.
- **Ring bar length is `min(110, v²·110·intensity)`** (the spec says `v × 90`), following the
  squared-bars lesson from Halo Rings.
- **Tone mapping is off** (`NoToneMapping`). Colours go in as linear `THREE.Color`s, and
  `OutputPass` converts to sRGB, so the preset colours come out as picked. Iron Wraith's ACES
  would shift them.

## Review Focus

1. **The 360p preview:** dots must stay visible (minimum size of about one screen pixel), and the
   renderer, composer and backdrop target must all be resized, not rebuilt. (Task 2, step 5:
   compare a 360p frame with the render and count WebGL contexts after a few settings changes.)
2. **Changing settings many times in the live preview:** no new WebGL context and no growing
   memory. Only materials and uniforms update. (Task 2 test: `new THREE.WebGLRenderer` appears
   once, inside `setup()`; step 5 changes settings 10 times in the browser.)
3. **Spin 0 and noise 0:** the crystal is still apart from the beat pulse, and the frame is
   exactly identical between renders. (Task 1 test: `turnAngles(t, 0)` gives `y = 0` for any t.)
4. **A long title or artist:** it shrinks to 560 px. (Task 2 test: `var TITLE_SAFE = 560`.)
5. **Own background on, with no upload:** the template's `assets/background.jpg` is used, blurred,
   and the glass bends it. (Task 2, step 5 frame with `showBackground=true`.)

---

### Task 1: Prism Heart's geometry and motion maths

**Files:**
- Create: `templates/prism-heart/assets/prism-motion.js` (UMD, `window.PrismMotion`)
- Test: `src/lib/prism-heart-motion.test.ts`

**Interfaces (`PrismMotion`):**
- `buildCrystal(mulberry32) → { positions: Float32Array, normals: Float32Array, edges: Float32Array }`:
  non-indexed triangles, 24 of them (6 side quads as 2 triangles each, plus 6 top and 6 bottom
  tip triangles).
  - The hexagon has radius 0.75. The prism half-height is 0.85; the tips sit at y = ±1.55.
  - Every corner is nudged by ±0.05 on each axis (seed 9). The tips are nudged on x and z only.
  - `normals` holds the flat face normal, repeated per vertex, pointing outward.
  - `edges` is a vec3 per vertex: the barycentric corner (1,0,0)/(0,1,0)/(0,0,1). A side
    quad's diagonal is hidden by setting that component to 1 on all three vertices.
- `turnAngles(songTime, spinPct) → { y, x }`:
  `y = 12°·songTime·spinPct/100`, `x = 6°·sin(2π·songTime/9)`, both in radians.
- `PULSE_RELEASE = 0.25`
- `crystalScale(env, intensity) = 1 + 0.05·env·intensity`
- `edgeFlash(audio, t)`: the maximum over `recentHits(t, 4)` with age < 0.4 of
  `strength·0.8·(1 − age/0.4)`; otherwise 0.
- `sheenShift(loud) = loud / 3` (turns)
- `glowLevel(loud, intensity) = min(1, 0.5 + 0.5·loud·intensity)`
- `RING = { x: 1180, y: 540, r: 330, max: 110 }` (screen pixels)
- `ringLengths(values, intensity)`: `min(110, v²·110·intensity)`
- `ringCount(V, pct) = V.bandsToRingCount(pct, 160)`
- `dotSize(thicknessPct) = 2 + 6·(pct − 10)/90`, in px
- `buildBokeh(mulberry32) → Float32Array(40·6)`:
  `[x 0..1920, y 0..1080, r 30..160, colourMix 0..1, phase 0..2π, speed 0.05..0.15]`, seed 3.
- `bokehAt(disc, songTime) → [x, y]`:
  `x + 24·sin(songTime·speed + phase)`, `y + 16·cos(songTime·speed·0.8 + phase)`
- `bokehLevel(loud) = 1 + 0.1·loud`
- `grainSeed(songTime) = floor(songTime·6)`

- [ ] **Step 1: Write the failing tests** in `src/lib/prism-heart-motion.test.ts`:
  - `buildCrystal`:
    - the same every time; 24 triangles (positions length 216)
    - **closed:** every edge, by rounded corner positions, is shared by exactly two triangles
    - **outward:** each face normal has unit length and a positive dot product with its
      triangle's centroid
    - the height is between 3.0 and 3.2; every `edges` value is in {0, 1}
    - the 12 side triangles each have exactly one component fixed at 1
  - `turnAngles`:
    - `(1, 100).y` ≈ 12°
    - `(t, 0).y` = 0 for t in {0, 3.3, 100} (Review Focus 3)
    - `x` stays within ±6°, and `(0, 100).x` = 0
  - `crystalScale(1, 1)` = 1.05 and `crystalScale(0, 2)` = 1.
  - `edgeFlash`:
    - 0.8 at a hit of strength 1, at age 0
    - 0.4 at age 0.2
    - 0 at age 0.41
    - a section (`sliceAnalysis`) matches the full song at the same song time
  - `glowLevel(1, 2)` = 1 and `glowLevel(0, 1)` = 0.5. `sheenShift(0.9)` = 0.3.
  - `ringLengths([0, 0.5, 1], 1)` → `[0, 27.5, 110]`, and at intensity 2 → `[0, 55, 110]`.
  - The ring at full length stays inside the frame and right of the text:
    `RING.x − RING.r − RING.max·crystal-free` gives 740 > 140 + 560 = 700.
  - `ringCount(V, 50)` = `bandsToRingCount(50, 160)`. `dotSize(10)` = 2 and `dotSize(100)` = 8.
  - `buildBokeh`: the same every time, 40 discs, all values in range.
  - `bokehAt` depends on time only.
  - `grainSeed(0.99)` = 5 and `grainSeed(1.0)` = 6.
  - **Silence:** `edgeFlash` 0, ring lengths 0, `glowLevel(0, 1)` 0.5, no NaN.
- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `prism-motion.js`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Prism Heart geometry and motion maths`.

### Task 2: The Prism Heart template

**Files:**
- Create in `templates/prism-heart/`:
  - `index.html`
  - `template.json`
  - `hyperframes.json`
  - `assets/background.jpg` (copy)
  - `assets/viz-toolkit.js` and `assets/three-kit.js` (via sync)
- Create: `src/lib/prism-heart.test.ts`
- Modify: `src/lib/repo-hygiene.test.ts`

**Settings** (spec §6, in this order):
- title, artist, font
- mainColor `#c38bff`, accentColor `#ff7ac8`
- intensity
- spin 100 (0–200 %)
- bandThickness 50 (10–100 %)
- noiseAmount 0 (0–100 %)
- showBackground false
- backgroundBlur 60
- beatRange `kick`
- spectrumLow 30, spectrumHigh 1000
- spectrumBoost `"1"`
- bandCount 50

**`template.json`:**
- name `Prism Heart`
- description `An iridescent glass crystal turning inside a dotted ring of spectrum bars.`
- groups:
  - Text [title, artist, font]
  - Colors [mainColor, accentColor]
  - Effects [intensity, spin, bandThickness, noiseAmount, showBackground, backgroundBlur]
  - Audio [beatRange, spectrumLow, spectrumHigh, spectrumBoost, bandCount]
- basic [mainColor, accentColor, intensity, bandThickness, noiseAmount, font]
- content [title, artist]
- presets: Original `#c38bff`/`#ff7ac8`, Amber `#ffb547`/`#ff6a2b`, Ice `#8ee9ff`/`#5b7cff`,
  Opal `#9dffd9`/`#ff9df0`, with thumbnails `presets/original.jpg`, `amber.jpg`, `ice.jpg` and
  `opal.jpg`

**Drawing**, following Iron Wraith's `setup()`/`apply()`/`resize()`/`render(t)` shape:
- **Renderer.**
  - `WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true})`, with the same
    `onShaderError` that throws.
  - `setPixelRatio(1)`, `toneMapping = NoToneMapping`.
- **Backdrop target.** `WebGLRenderTarget(W, H, {type: UnsignedByteType})`, rendered each frame
  from an orthographic full-screen quad with `BOKEH_FS`:
  - a vertical gradient from deep violet `#14061f` to black
  - 40 soft discs (uniform array `vec4 discs[40]`: x, y, r, mix), each colour
    `mix(main, accent, mix)·0.35·bokehLevel`
  - **soft edge:** `smoothstep(r, r·0.6, distance)`
  - **picture mode:** when `showBackground` is on, the quad samples a `CanvasTexture` of the
    blurred background (Nova Streak's `loadBackground` canvas) × 0.6 instead
- **Main scene.**
  - `scene.background = backdrop.texture`
  - camera `PerspectiveCamera(30, 16/9, 0.1, 100)` at z = 12, looking at the origin
  - the crystal group at x = 1.31 (screen x ≈ 1180)
  - **two meshes** with the same `BufferGeometry` and the glass `ShaderMaterial`:
    - back faces first: `side: BackSide`, uniform `faceGain 0.45`
    - then front faces: `FrontSide`, `transparent: true`, `depthWrite: false`, opacity 0.85
  - **the glass fragment shader** (GLSL 3, WebGL 2, so `fwidth` works):
    - `N` (view-space normal), `V` (view direction)
    - `fres = pow(1 − |N·V|, 3)`
    - `phase = (1 − |N·V|)·5 + sheen`
    - `film = 0.5 + 0.5·cos(2π(phase + vec3(0, .33, .67)))`
    - `tint = mix(film, mix(main, accent, .5 + .5·sin(2π·phase)), .45)`
    - `bg = texture(backdrop, gl_FragCoord.xy/res + N.xy·0.06)`
    - `e = min(edges.x, edges.y, edges.z)`
    - `line = 1 − smoothstep(0, fwidth(e)·1.5, e)`
    - `colour = (bg·0.6 + tint·(0.3 + 0.6·fres))·faceGain + line·(0.5 + flash)·mix(white, main, .3)`
  - the glow sprite behind the crystal (z −1):
    - additive, `mainColor`, 9 units wide
    - opacity `0.35·glowLevel`
  - group rotation from `turnAngles`; scale from `crystalScale`
- **Overlay scene** (`OrthographicCamera(0, 1920, 1080, 0)` in 1080p pixels, y flipped):
  - **ring dots:** `THREE.Points` with a `ShaderMaterial`, attributes `position` and `color`,
    and `size = dotSize·PREVIEW_SCALE` with a floor of 1.2 px.
    - Each ring point gets a base dot and dots every `2·dotSize` px out to its length.
    - The colour runs from main at the base to accent at the tip.
    - Use a preallocated buffer of `160 × 30` points; the draw range is set per frame.
  - **grain:** a full-screen quad, `NormalBlending`, alpha `noiseAmount/100·0.02` from a hash of
    `gl_FragCoord` and `grainSeed`, toward white or black.
- **Composer.**
  - `EffectComposer(renderer, 8-bit target)`
  - `RenderPass(scene, camera)`, then `RenderPass(overlay, ortho)` with `clear = false`
  - `UnrealBloomPass(…, 0.45, 0.4, 0.9)` with every target 8-bit, then `OutputPass`
- **Text (DOM):**
  - `#titles` at left 140, vertically centred: `#songArtist` (26 px, letter-spacing 0.35em,
    capitals, 80 % opacity) above `#songTitle` (60 px, weight 600)
  - then `#loudLine`, 320 × 2 px, whose glow follows `loud` (style set in `render`)
  - each fitted to `var TITLE_SAFE = 560`
- **`apply()`** updates the uniforms, the colours, the audio and the backdrop mode. It never
  creates a renderer, composer or target.

- [ ] **Step 1: Write the failing test** `src/lib/prism-heart.test.ts`:
  - settings, groups, presets and content, as in the other templates' tests
  - `index.html` loads `assets/prism-motion.js`, `assets/three-kit.js` and
    `assets/viz-toolkit.js`
  - no `Math.random`, `Date.now` or timers; no `HalfFloatType`, `FloatType` or `transmission`
  - `UnsignedByteType` appears at least 3 times (composer, bloom and backdrop)
  - `new THREE.WebGLRenderer` appears exactly once (Review Focus 2)
  - it contains `var TITLE_SAFE = 560`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Build the crystal and backdrop first.** Render one draft frame and send the
  still to the owner as the spec's look check. Tune sheen, rim and refraction until it reads as
  glass, then carry on without waiting (the owner approved building through).
- [ ] **Step 4: Finish the ring, grain and text.** Run `npm run sync:toolkit` and
  `npm run template:assets`. Then run the test, `repo-hygiene` and
  `npm run check:templates -- prism-heart`. Expected: pass, with a reaction ≥ 6.
- [ ] **Step 5: Look at it.** Draft frames:
  - default
  - `showBackground=true` (Review Focus 5)
  - `spin=0`
  - `noiseAmount=100`
  - a long title

  Then open `/edit/prism-heart` at 360p and compare it with the render. Change settings 10
  times and confirm a single canvas context (Review Focus 1 and 2).
- [ ] **Step 6: Commit:** `feat: Prism Heart template`.

### Task 3: Presets, real-GPU timing, app check, docs

- [ ] **Step 1: Thumbnails.** Add the test (it FAILS), run `npm run thumbs -- prism-heart`, then
  the test PASSES.
- [ ] **Step 2: Real GPU.** A 30 s Final of T-REX 60–90 s, timed against Particle Horizon and Iron
  Wraith, with `--phone`. Send the phone copy to the owner.
- [ ] **Step 3: App check:** change colours, thickness and noise in the preview; export a Draft;
  check the console.
- [ ] **Step 4: CLAUDE.md.**
  - Tick Prism Heart and **M6 complete**.
  - Add a three.js rule: fake glass with a custom shader that reads an 8-bit backdrop target;
    never `transmission`.
  - Add its render speed.
- [ ] **Step 5:** Run `npm run check` and `npm run check:templates`.
- [ ] **Step 6: Commit:** `feat: Prism Heart presets; docs and timings`.
