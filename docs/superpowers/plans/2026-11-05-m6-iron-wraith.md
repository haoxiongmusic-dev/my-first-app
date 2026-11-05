# Iron Wraith (M6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Iron Wraith template: a three.js voxel chrome robot skull whose jaw bites on
the beat. It has voxel spectrum towers behind it, two mirrored waveforms and an
"ARTIST – SONG" title, and works in the gallery, live preview and export.

**Architecture:**
- three.js and the add-ons we use are bundled once into a classic script,
  `templates/shared/three-kit.js` (global `THREE_KIT`). It is copied into templates by
  `npm run sync:toolkit`.
- The template keeps its testable logic in two plain browser/Node scripts, unit-tested with
  Vitest the same way as the toolkit:
  - `skull-voxels.js`: the voxel shape
  - `wraith-motion.js`: jaw, eyes, towers and waveform maths from the song time
- `index.html` wires these into a three.js scene with 8-bit bloom, plus a 2D canvas for the
  waveforms.

**Tech Stack:** three.js 0.187.0, esbuild 0.28.2, HyperFrames 0.9.10, Vitest, the existing
viz-toolkit, and @fontsource/orbitron and @fontsource/audiowide 5.3.0.

**Spec:** `docs/superpowers/specs/2026-11-05-m6-iron-wraith-design.md`

**Visual reference:** the approved throwaway sketch
`C:\Users\ydogg\AppData\Local\Temp\claude\f6dd057790b8aac5\18829a53-4854-474a-ad91-36d932f7ca93\scratchpad\voxel\voxel.html`.
It holds the shape functions `upper`, `jaw`, `neck`, the cable paths, the eye cluster, the
lights, and the reflection settings (`RoomEnvironment` at 0.22, rotation −1.4). Port its numbers.
It is not committed.

## Global Constraints

- **Pinned dev dependencies:** `three@0.187.0`, `esbuild@0.28.2`, `@fontsource/orbitron@5.3.0`,
  `@fontsource/audiowide@5.3.0`. Use exact versions, no `^`.
- **8-bit only:** every three.js render target (composer and all bloom targets) uses
  `THREE.UnsignedByteType`. The words `HalfFloatType` and `FloatType` never appear in template
  code.
- **Deterministic drawing:**
  - Draw only from the time passed by `hf-seek` or the timeline's `onUpdate`.
  - No `Math.random()`, `Date.now()`, timers, `requestAnimationFrame` loops or network
    fetches.
  - The seeded `mulberry32` (seed 7) is the only source of randomness.
- **Template contract (spec §6):**
  - `title`, `artist` and `intensity` exist.
  - Every setting sits in exactly one group.
  - `data-song-length` is on every song-length clip.
  - `npx hyperframes check` passes.
  - The template looks identical without the `settings` and `preview` runtime-data channels.
  - Never measure the DOM inside `onUpdate`.
- **Licences:**
  - three.js's MIT notice stays at the top of `three-kit.js`.
  - The fonts ship with their SIL OFL licence text in `assets/fonts/`.
- **Generated files and Prettier:** `three-kit.js` is minified and must never be reformatted.
  Add `templates/shared/three-kit.js` and `templates/*/assets/three-kit.js` to
  `.prettierignore`.
- **Speed:** a Final 1080p export takes ≤ 6× the song length on this PC (spec §9).
- **Privacy:** never commit audio, video, `storage/` or `test-renders/`. Phone copies sent to
  the owner must be < 30 MB.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Run `npm run check` before each commit, and `npm run check:templates` before each commit that
  touches a template.

## Review Focus

1. **A section export that starts mid-song.** The jaw and tower-peak look-backs ask for times
   before the section's 0. The output must be valid numbers that match the full-song render at
   the same moment. The test is in Task 3.
2. **A silent or very quiet song.** The skull must still be visible: eye glow ≥ its base level,
   with no NaN. The test is in Task 3, and the reaction check in Task 4 also covers the quiet
   frame.
3. **Live preview changes.** Switching presets, fonts and `showTowers` repeatedly must update
   the picture without a reload, and GPU memory must not climb. The check is a manual step in
   Task 7, reading `renderer.info.memory` before and after 10 preset changes.
4. **Extreme waveform settings.** At Bands 100 % with Thickness 110 %, and at Bands 10 % with
   Thickness 2 %, the waveform must draw without errors or invisible lines. The test is in
   Task 3, covering `waveformPoints` counts and thickness.
5. **A very long title.** A 60-character song name must shrink to fit the 80 % title-safe
   width, as in Particle Horizon. This is a manual step in Task 5, step 3.

---

### Task 1: three-kit bundle and syncing shared files

**Files:**
- Create: `scripts/three-kit-entry.js`, `scripts/build-three-kit.ts`,
  `templates/shared/three-kit.js` (generated)
- Modify: `package.json` (dev dependencies, script `build:three`), `.prettierignore`,
  `src/lib/toolkit-sync.ts`, `scripts/sync-toolkit.ts`, `scripts/check-templates.ts` (step 1
  reports any stale shared copy)
- Test: `src/lib/toolkit-sync.test.ts`, `src/lib/three-kit.test.ts`

**Interfaces:**
- Produces:
  - `window.THREE_KIT = { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment }`
    (and `module.exports` the same under Node).
  - `toolkitCopies(templatesRoot) → Promise<ToolkitCopy[]>`, where
    `ToolkitCopy = { template, file: "viz-toolkit.js" | "three-kit.js", path, upToDate }`.
  - `syncToolkit(templatesRoot) → Promise<string[]>`, which copies `viz-toolkit.js` into every
    template, and `three-kit.js` only into templates whose `index.html` contains
    `assets/three-kit.js`.

- [ ] **Step 1: Write the failing tests**
  - In `toolkit-sync.test.ts`:
    - add `shared/three-kit.js` ("// three v1") to the fixture
    - give `beta/index.html` a `<script src="assets/three-kit.js">`
    - give `alpha/index.html` none

  ```ts
  it("three-kit.js goes only to templates that use it", async () => {
    await syncToolkit(root);
    expect(existsSync(path.join(root, "alpha", "assets", "three-kit.js"))).toBe(false);
    expect(await readFile(path.join(root, "beta", "assets", "three-kit.js"), "utf8")).toBe("// three v1");
    const copies = await toolkitCopies(root);
    expect(copies.filter((c) => c.file === "three-kit.js").map((c) => c.template)).toEqual(["beta"]);
  });
  ```

  The existing tests keep passing, with `file: "viz-toolkit.js"` on their copies.
  - `three-kit.test.ts` (load it with `createRequire`, like `viz-toolkit.test.ts`):
    - the kit exposes all six names
    - `THREE.REVISION === "187"`
    - the file's first 400 characters contain "MIT" and "three.js"
    - `new kit.THREE.WebGLRenderTarget(4, 4, { type: kit.THREE.UnsignedByteType }).texture.type === kit.THREE.UnsignedByteType`

- [ ] **Step 2: Run** `npx vitest run src/lib/toolkit-sync.test.ts src/lib/three-kit.test.ts`.
  Expected: FAIL. The three-kit test fails because there is no file, and the sync test fails
  because three-kit is not copied.

- [ ] **Step 3: Install** `npm i -D -E three@0.187.0 esbuild@0.28.2`.
  - `scripts/three-kit-entry.js` re-exports the six names from `three` and
    `three/examples/jsm/...`.
  - `scripts/build-three-kit.ts` calls esbuild's `build` with these options:
    - `bundle: true`, `format: "iife"`, `globalName: "THREE_KIT"`, `minify: true`,
      `target: "es2020"`
    - `platform: "browser"`, `legalComments: "none"`
    - a `banner` holding the three.js MIT notice (copied from `node_modules/three/LICENSE`)
    - a `footer` that sets `module.exports = THREE_KIT` when `module` exists
    - output to `templates/shared/three-kit.js`
  - Add `"build:three": "tsx scripts/build-three-kit.ts"`.
  - Update `.prettierignore`.
  - Generalise `toolkit-sync.ts` to the two files with the rule above.
  - `check-templates.ts` step 1 names the stale file.
  - Wrap scripts in `main()` (CommonJS, no top-level await).

- [ ] **Step 4: Run** `npm run build:three`, then the two test files.
  Expected: PASS, and `three-kit.js` is about 0.5–0.9 MB.

- [ ] **Step 5: Commit**

  ```bash
  git add package.json package-lock.json .prettierignore scripts/three-kit-entry.js scripts/build-three-kit.ts scripts/sync-toolkit.ts scripts/check-templates.ts src/lib/toolkit-sync.ts src/lib/toolkit-sync.test.ts src/lib/three-kit.test.ts templates/shared/three-kit.js
  git commit -m "feat: bundle three.js for templates and sync it where used"
  ```

---

### Task 2: Iron Wraith skeleton: proves three.js renders inside HyperFrames on this GPU

This is the spec's first risk (§10). Nothing else gets built until it passes.

**Files:**
- Create:
  - `templates/iron-wraith/index.html`
  - `templates/iron-wraith/template.json`
  - `templates/iron-wraith/hyperframes.json` (copy Particle Horizon's)
  - `templates/iron-wraith/assets/fonts/` with these files:
    - `orbitron-400.woff2` and `orbitron-700.woff2`, from `@fontsource/orbitron/files/orbitron-latin-{400,700}-normal.woff2`
    - `audiowide-400.woff2`
    - `OFL-orbitron.txt` and `OFL-audiowide.txt`, copied from each package's `LICENSE`
- Modify: `package.json` (`npm i -D -E @fontsource/orbitron@5.3.0 @fontsource/audiowide@5.3.0`),
  `src/lib/repo-hygiene.test.ts`, `src/lib/templates.test.ts`
- Test: `src/lib/iron-wraith.test.ts`

**Interfaces:**
- Consumes: `THREE_KIT` (Task 1), `window.VizToolkit` (`declaredDefaults`, `createAudio`,
  `showError`, `mulberry32`, `hexToRGB`).
- Produces: the full variable list from spec §5, with exact ids, types, defaults and ranges,
  declared now so later tasks only draw:
  - text: `title`, `artist`, `font`
  - colours: `eyeColor`, `lightColor`, `waveColor`
  - effects: `intensity`, `jawStrength`, `glow`, `showTowers`
  - audio: `beatRange`
  - waveform layers: `waveALow`, `waveAHigh`, `waveABoost`, `waveABands`, `waveAThickness`,
    and the five `waveB*` settings
  - The `beatRange` options and the waveform Low/High range (30–16000 Hz) and Boost options
    are copied from Particle Horizon.
  - Groups in this order: Text, Colors, Effects, Audio, Waveform A, Waveform B.
  - `basic`: `eyeColor`, `intensity`, `jawStrength`, `glow`, `font`, `showTowers`.
  - `content`: `title`, `artist`.
  - Presets: only "Original" for now.

- [ ] **Step 1: Write the failing tests** in `iron-wraith.test.ts`:

  ```ts
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(path.join(process.cwd(), "templates", "iron-wraith"));
    expect(validateTemplate(t)).toEqual([]);
    expect(t.variables.map((v) => v.id)).toEqual([
      "title", "artist", "font", "eyeColor", "lightColor", "waveColor", "intensity",
      "jawStrength", "glow", "showTowers", "beatRange",
      "waveALow", "waveAHigh", "waveABoost", "waveABands", "waveAThickness",
      "waveBLow", "waveBHigh", "waveBBoost", "waveBBands", "waveBThickness",
    ]);
    expect(defaults(t)).toMatchObject({ font: "Orbitron", eyeColor: "#3fd0ff", lightColor: "#1f5fff",
      waveColor: "#5fb4ff", intensity: 1, jawStrength: 60, glow: 50, showTowers: true,
      waveALow: 30, waveAHigh: 2000, waveABoost: "2", waveABands: 10, waveAThickness: 7,
      waveBLow: 60, waveBHigh: 12000, waveBBoost: "1", waveBBands: 30, waveBThickness: 110 });
  });
  it("uses 8-bit render targets only", async () => {
    const html = await readFile(path.join(process.cwd(), "templates/iron-wraith/index.html"), "utf8");
    expect(html).not.toMatch(/HalfFloatType|\bFloatType/);
    expect(html.match(/UnsignedByteType/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  ```

  Use the existing helpers `loadTemplate` and `validateTemplate` from `@/lib/templates`. Write
  `defaults` as a tiny local helper over `t.variables`. In `repo-hygiene.test.ts`, also expect
  `templates/iron-wraith/assets/audio-data.js` and `.../song.wav` to be git-ignored.

- [ ] **Step 2: Run** `npx vitest run src/lib/iron-wraith.test.ts`.
  Expected: FAIL (no template).

- [ ] **Step 3: Build the skeleton `index.html`.** Use the Particle Horizon structure:
  - root `#root` with `data-composition-id="main"` and `data-duration="20"`
  - `#titles`, `#fade` and `#music` clips with `data-song-length`
  - settings merge
  - `rebuild()`/`draw(t)`
  - `hf-seek`, the runtime-data handlers, and a gsap timeline with `onUpdate`
  - title fade-in and a 2.5 s fade to black at the end

  Ruling: the end fade matches Particle Horizon. The spec doesn't mention it; it's the house
  look.

  Then add these parts:
  - **Fonts:** `@font-face` for Orbitron (400 and 700) and Audiowide from `assets/fonts/`, plus
    the `#fontPreload` spans.
  - **Scripts:** `assets/audio-data.js`, `assets/viz-toolkit.js`, `assets/three-kit.js`, then
    the main script.
  - **Canvas:** `<canvas id="viz">` (WebGL, owned by three.js) and `<canvas id="waves">` (2D,
    on top).
  - **`setup()`:**
    - create `THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })` at
      1920×1080 × `PREVIEW_SCALE`
    - ACES tone mapping
    - `renderer.debug.onShaderError` → `V.showError`
    - a scene with one chrome `BoxGeometry` and an emissive cube
    - an `EffectComposer` on a `WebGLRenderTarget(w, h, { type: UnsignedByteType, samples: 4 })`
    - `RenderPass`, then `UnrealBloomPass` at half resolution. Set every target's
      `texture.type = UnsignedByteType` before the first render.
    - `OutputPass`
    - `dispose()` frees the renderer, composer, geometries and materials
  - Then:
    - `npm run sync:toolkit`
    - `npm run template:assets`
    - write `template.json`
    - copy the font files

- [ ] **Step 4: Run** `npx vitest run src/lib/iron-wraith.test.ts src/lib/repo-hygiene.test.ts src/lib/templates.test.ts`.
  Expected: PASS.

- [ ] **Step 5: Prove it on the real pipeline**
  - Run `npx hyperframes check templates/iron-wraith --json`. Expected: 0 errors.
  - Run `npm run render -- iron-wraith C:\Users\ydogg\Downloads\AXIOM\T-REX.wav --start 60 --end 65 --preset Original`.
    Expected: an MP4 in `test-renders/`.
  - Check a middle frame with `ffmpeg -ss 2.5 -i <mp4> -frames:v 1 -vf "scale=96:54,format=gray" -f rawvideo -`.
    Expected: mean brightness > 8, meaning not blank, with the chrome cube and glow visible.
    Also look at the frame.
  - If it's blank or fails, stop and debug with superpowers:systematic-debugging before going
    on.

- [ ] **Step 6: Commit**

  ```bash
  git add package.json package-lock.json templates/iron-wraith src/lib/iron-wraith.test.ts src/lib/repo-hygiene.test.ts src/lib/templates.test.ts
  git commit -m "feat: Iron Wraith template skeleton rendering three.js with 8-bit bloom"
  ```

  Check `git status` first: there must be no `song.wav` or `audio-data.js`.

---

### Task 3: Pure logic: skull voxels and motion maths

**Files:**
- Create: `templates/iron-wraith/assets/skull-voxels.js`,
  `templates/iron-wraith/assets/wraith-motion.js`
- Test: `src/lib/iron-wraith-skull.test.ts`, `src/lib/iron-wraith-motion.test.ts`

Both scripts are plain ES5-style JavaScript. Each ends with
`if (typeof module !== "undefined") module.exports = X; else window.X = X;`.

**Interfaces:**
- **`IronWraithSkull.buildSkull()`** returns
  `{ head: Voxel[], jaw: Voxel[], cables: Voxel[], eyes: Voxel[], jawPivot: [0, -10, -3] }`.
  - `Voxel = [x, y, z, shade]` with integer x, y, z. Jaw voxels are in head coordinates
    (`index.html` subtracts the pivot).
  - `shade` ∈ {1 chrome, 2 seam, 3 shadow, 4 bright, 5 gunmetal}, with
    `SHADES = {1: 0.92, 2: 0.28, 3: 0.10, 4: 1.0, 5: 0.42}` exported too.
  - Only surface voxels are kept. The shape functions and cable paths are ported from the
    sketch.
- **`WraithMotion`** (time-only, pure; `audio` is a toolkit `createAudio` result):
  - `jawEnvelope(audio, t) → number in [0, 1]`: the maximum over k = 0…11 of
    `audio.sample(max(t − k/60, −pre)).beat × exp(−(k/60)/0.18)`, where `pre` is how far
    before 0 the data reaches (`audio.offset ?? 0`; if the toolkit doesn't expose it, clamp at
    0).
  - `jawAngle(env, jawStrength, intensity) → radians` = `min(0.45, env × 0.3 × jawStrength/100 × intensity)`.
  - `nodAngle(env, intensity) → radians` = `min(0.06, env × (2π/180) × intensity)`.
  - `eyeLevel(audio, t, glow, intensity) → number` = `0.35 + 0.65 × loud × intensity`, plus the
    hit flare: the sum over `audio.recentHits(t, 3)` with age < 0.4 of
    `strength × (1 − age/0.4) × glow/100`. Clamp to [0.35, 3].
  - `towerColumns(audio, t, maxBlocks = 18) → { heights: number[], peaks: number[] }`. Both are
    integer arrays, one value per spectrum column.
    - `heights[i] = round(value × maxBlocks)`.
    - `peaks[i]` = the maximum over the past 0.6 s, sampled every 1/30 s, of
      `round(value(t − τ) × maxBlocks) − floor(τ × 20)`, and never below `heights[i]`.
  - `waveformPoints(values, width, baseline, amplitude) → Float32Array` of x, y pairs, mirrored:
    - point count = `2 × values.length`
    - x runs from the centre outward to both edges, so the left half mirrors the right
    - y = `baseline − value × amplitude`
  - `bandsToCount(pct) → number` = `round(16 + (pct − 10) / 90 × 144)`.
  - `thicknessToPx(pct) → number` = `max(0.75, pct/100 × 12)`.

- [ ] **Step 1: Write the failing tests**

  ```ts
  // iron-wraith-skull.test.ts
  const s = skull.buildSkull();
  const all = [...s.head, ...s.jaw, ...s.cables];
  const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;
  it("is mirror-symmetric", () => { for (const part of [s.head, s.jaw, s.cables, s.eyes]) {
    const set = new Set(part.map(key)); for (const v of part) expect(set.has(key([-v[0], v[1], v[2]]))).toBe(true); } });
  it("has a sensible size", () => { expect(all.length).toBeGreaterThanOrEqual(3000); expect(all.length).toBeLessThanOrEqual(10000); });
  it("head and jaw don't overlap", () => { const head = new Set(s.head.map(key)); expect(s.jaw.filter((v) => head.has(key(v)))).toEqual([]); });
  it("eyes are visible from the front", () => { for (const e of s.eyes)
    expect(s.head.some((h) => h[0] === e[0] && h[1] === e[1] && h[2] > e[2])).toBe(false); });
  it("is the same every time", () => { expect(skull.buildSkull()).toEqual(s); });
  it("uses only known shades", () => { for (const v of all) expect([1, 2, 3, 4, 5]).toContain(v[3]); });
  ```

  For `iron-wraith-motion.test.ts`, use a fake audio built from the real toolkit's
  `createAudio(fakeAnalysis(frames))` (the same helper pattern as `viz-toolkit.test.ts`).
  Frames run at 30 fps: silent everywhere, `k = 1` at frame 30 only, `l = 0.8` from frame 60,
  and one hit at 2.0 s with strength 1.

  ```ts
  it("jaw is shut in silence and opens on a beat", () => {
    expect(m.jawEnvelope(audio, 0.5)).toBe(0);
    expect(m.jawEnvelope(audio, 1.0)).toBeGreaterThan(0.9);
  });
  it("jaw closes over about 0.18 s", () => {
    const e = m.jawEnvelope(audio, 1.18);
    expect(e).toBeGreaterThan(0.25); expect(e).toBeLessThan(0.5);
    expect(m.jawEnvelope(audio, 1.4)).toBe(0);
  });
  it("jaw angle respects strength, intensity and the cap", () => {
    expect(m.jawAngle(1, 60, 1)).toBeCloseTo(0.18); expect(m.jawAngle(1, 100, 2)).toBe(0.45); expect(m.jawAngle(0, 100, 2)).toBe(0);
  });
  it("looks back safely at the very start (section exports)", () => {
    for (const t of [0, 0.01, 0.1]) expect(Number.isFinite(m.jawEnvelope(audio, t))).toBe(true);
    const tw = m.towerColumns(audio, 0); expect(tw.heights.every(Number.isInteger)).toBe(true);
  });
  it("eyes keep a base glow in silence and flare on a hit", () => {
    expect(m.eyeLevel(audio, 0.5, 50, 1)).toBeCloseTo(0.35);
    expect(m.eyeLevel(audio, 2.1, 100, 1)).toBeGreaterThan(m.eyeLevel(audio, 2.6, 100, 1));
  });
  it("tower peaks hold then fall back to the bars", () => {
    const now = m.towerColumns(audio, 2.0); for (let i = 0; i < now.heights.length; i++) expect(now.peaks[i]).toBeGreaterThanOrEqual(now.heights[i]);
  });
  it("is the same for the same time", () => { expect(m.towerColumns(audio, 2.3)).toEqual(m.towerColumns(audio, 2.3)); });
  it("waveform points are mirrored", () => {
    const p = m.waveformPoints(new Float32Array([0.2, 0.5, 1]), 1920, 900, 100);
    expect(p.length).toBe(12);
    // the pairs at mirrored positions share y, and their x values are symmetric around 960
  });
  it("band and thickness percentages map to the spec's ranges", () => {
    expect(m.bandsToCount(10)).toBe(16); expect(m.bandsToCount(100)).toBe(160);
    expect(m.thicknessToPx(2)).toBe(0.75); expect(m.thicknessToPx(110)).toBeCloseTo(13.2);
  });
  ```

  The mirrored-waveform case also asserts the symmetry in its comment: compare each point on
  the left half with the matching point on the right (y equal, `x_left + x_right = 1920`).
  Write the loudness case so the frames give a different spectrum per frame.

- [ ] **Step 2: Run** `npx vitest run src/lib/iron-wraith-skull.test.ts src/lib/iron-wraith-motion.test.ts`.
  Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** both scripts to the interfaces above, porting the sketch's shape
  code.

- [ ] **Step 4: Run** the same command. Expected: PASS. Then run `npm test`: the whole suite
  passes.

- [ ] **Step 5: Commit**

  ```bash
  git add templates/iron-wraith/assets/skull-voxels.js templates/iron-wraith/assets/wraith-motion.js src/lib/iron-wraith-skull.test.ts src/lib/iron-wraith-motion.test.ts
  git commit -m "feat: Iron Wraith voxel skull and motion maths, unit tested"
  ```

---

### Task 4: The 3D scene: skull, jaw, eyes, lights, towers

**Files:**
- Modify: `templates/iron-wraith/index.html` (load `skull-voxels.js` and `wraith-motion.js`;
  replace the skeleton scene)

**Interfaces:**
- Consumes: `buildSkull()`, `SHADES`, `jawEnvelope`, `jawAngle`, `nodAngle`, `eyeLevel` and
  `towerColumns` from Task 3; `THREE_KIT` from Task 1.
- Audio instances made in `setup()`:
  - `audio = V.createAudio(AUDIO_DATA, { beatRange })`
  - `towerAudio = V.createAudio(AUDIO_DATA, { spectrumLow: 20, spectrumHigh: 16000, spectrumCount: 12 })`

Scene values (from the sketch):
- **Camera:** perspective, fov 30, at (0, 0, 165), looking at (0, −6, 0).
- **Head, jaw and cables:** three `InstancedMesh`es of 0.92 cubes, with instance colours from
  `SHADES` × (0.86 + 0.14 × `mulberry32(7)()`).
  - Chrome material: metalness 1, roughness 0.2.
  - Cable material: colour `#14181d`, metalness 0.4, roughness 0.45.
- **Jaw:** a group at the pivot, with `rotation.x = jawAngle(…)`. The whole skull group gets
  `rotation.x = nodAngle(…)`.
- **Reflections:** `RoomEnvironment` through `PMREMGenerator`, with `environmentIntensity` 0.22
  and `environmentRotation.x = −1.4`.
- **Eyes:** a `MeshBasicMaterial` whose colour is `eyeColor` × `eyeLevel` × 1.8. Two
  `PointLight`s at (±7.5, −0.5, 10), coloured `eyeColor`, intensity 160 × `eyeLevel`/1.35,
  decay 2.
- **Rim lights:** two `DirectionalLight`s coloured `lightColor`, at (±70, 30, −60), intensity
  3.5 + 2.5 × `loud` × `intensity`.
- **Towers:** 12 per side, x = ±(1.5 + i) × 10.5 for i = 0…11 (outermost at ±142, still on
  screen at this depth), z = −150, blocks 3.6 with a 4.2 step from y = −70. One `InstancedMesh` sized for the maximum. Each frame, write the
  matrices for the visible blocks plus each peak block and set `.count`.
  - Material: `MeshBasicMaterial`, colour `lightColor` × 1.2.
  - Bass is in the centre: column i of the spectrum is placed at the i-th position from the
    middle, on both sides.
  - Hidden when `showTowers` is false.
- **Bloom:** strength 0.6 × (0.5 + `glow`/100), radius 0.35, threshold 0.93, at half resolution.
- **Live updates:** colour and number settings update materials in place. `beatRange` and
  `font` changes call `rebuild()`.

- [ ] **Step 1: Write the failing check.** Run `npm run check:templates`. Expected: Iron Wraith
  fails "reacts to the music", because the skeleton's cube doesn't react.

- [ ] **Step 2: Implement** the scene above.

- [ ] **Step 3: Run** `npm run check:templates`. Expected: Iron Wraith passes every step.
  Then check the reaction numbers:
  - quiet ≥ 8 brightness
  - loud brighter by ≥ 3
  - difference ≥ 6

  If they fall short, raise the tower and eye reaction, not the thresholds.

- [ ] **Step 4: Look at it.** Run `npx hyperframes snapshot templates/iron-wraith --at 4,14 --json`
  and compare the frames with the approved sketch:
  - chrome voxel skull
  - plus-shaped glowing eyes
  - jaw open in the loud frame
  - towers bass-centred

- [ ] **Step 5: Commit** (`npm run check` first).

  ```bash
  git add templates/iron-wraith/index.html
  git commit -m "feat: Iron Wraith 3D scene with biting jaw, glowing eyes and voxel towers"
  ```

---

### Task 5: Waveforms and title

**Files:**
- Modify: `templates/iron-wraith/index.html`

**Interfaces:**
- Consumes: `waveformPoints`, `bandsToCount` and `thicknessToPx` (Task 3).
- `waveA` and `waveB` are each
  `V.createAudio(AUDIO_DATA, { beatRange: "kick", spectrumLow, spectrumHigh, spectrumBoost: Number(boost), spectrumCount: bandsToCount(bands) })`,
  built from the `waveA*` and `waveB*` settings.

Drawing on `#waves` (2D, 1920×1080 × `PREVIEW_SCALE`, cleared each frame):
- **Layer A:** baseline y = 1000, amplitude 90, colour `waveColor`.
- **Layer B:** baseline y = 1000, amplitude 60, colour `waveColor` mixed 40 % toward white.
- **Each layer:**
  - A smooth path through `waveformPoints(...)`, using quadratic curves through midpoints, with
    `lineWidth = thicknessToPx(thickness) × PREVIEW_SCALE`.
  - A reflection drawn below the baseline (y mirrored around the baseline) at 35 % alpha.
  - Glow via `shadowBlur` 12 × `PREVIEW_SCALE` in the same colour.
- **Title:**
  - The `#titles` block holds one line, `#artist` + " – " + `#title`, with both spans keeping
    `data-var-text`.
  - Top 880 px, uppercase, letter-spacing 0.35em, 34 px.
  - Weight 700 for Orbitron, 400 for Audiowide. Colour `#e8f4ff` with a `lightColor` text
    shadow.
  - Shrinks to the 1536 px title-safe width with Particle Horizon's `fitTitles`, which is
    measured on `hf-seek` and fonts loading, never in `onUpdate`.

- [ ] **Step 1: Write the failing check.** Snapshot at 14 s
  (`npx hyperframes snapshot templates/iron-wraith --at 14 --json`). Expected: no waveform or
  title visible in the bottom band (y 860–1060).

- [ ] **Step 2: Implement** the waveforms and title.

- [ ] **Step 3: Verify.**
  - Snapshot at 4 and 14 s: both waveform layers are mirrored around the centre, with
    reflections and glow, and "ARTIST NAME – SONG NAME" sits above them.
  - In the editor preview, set the title to a 60-character name: it shrinks and stays inside
    the title-safe width.
  - Set Bands 100 % with Thickness 110 %, then Bands 10 % with Thickness 2 %: both draw, with
    no console errors.

- [ ] **Step 4: Run** `npm run check:templates` and `npm run check`. Expected: all pass.

- [ ] **Step 5: Commit**

  ```bash
  git add templates/iron-wraith/index.html
  git commit -m "feat: Iron Wraith mirrored waveforms and artist – song title"
  ```

---

### Task 6: Presets and thumbnails

**Files:**
- Modify: `templates/iron-wraith/template.json`
- Create: `templates/iron-wraith/presets/*.jpg` (generated)
- Test: `src/lib/iron-wraith.test.ts`

- [ ] **Step 1: Write the failing test**

  ```ts
  it("has the six presets from the spec", async () => {
    const t = await loadTemplate(path.join(process.cwd(), "templates", "iron-wraith"));
    expect(t.manifest.presets.map((p) => p.name)).toEqual(["Original", "Original Speed", "Purple", "Green", "Blue Orange", "Red"]);
    expect(t.manifest.presets.find((p) => p.name === "Blue Orange")?.values).toEqual({ eyeColor: "#ff9a2e", lightColor: "#1f5fff", waveColor: "#ff8a1e" });
    expect(t.manifest.presets.find((p) => p.name === "Original Speed")?.values).toMatchObject({ intensity: 1.5, jawStrength: 85, glow: 70 });
  });
  ```

  Use whatever property `loadTemplate` exposes for `template.json`, as `templates.test.ts`
  does.

- [ ] **Step 2: Run** `npx vitest run src/lib/iron-wraith.test.ts`. Expected: FAIL (only
  Original exists).

- [ ] **Step 3: Write** the six presets with spec §6's exact values (colours for all; the
  Original Speed extras). Then run `npm run thumbs -- iron-wraith`.

- [ ] **Step 4: Run** the test, `npm run check:templates` and `npm run check`. Expected: PASS.
  Look at the six thumbnails: each one has the right colours.

- [ ] **Step 5: Commit**

  ```bash
  git add templates/iron-wraith/template.json templates/iron-wraith/presets src/lib/iron-wraith.test.ts
  git commit -m "feat: Iron Wraith presets and thumbnails"
  ```

---

### Task 7: Real-world verification, speed and docs

**Files:**
- Modify: `CLAUDE.md` (Template rules + Machine facts)

- [ ] **Step 1: Measure speed.** Run
  `npm run render -- iron-wraith C:\Users\ydogg\Downloads\AXIOM\T-REX.wav --start 60 --end 90`
  (Final 1080p) and time it.
  - Expected: ≤ 180 s for the 30 s section, which is 6×.
  - If it's slower, apply spec §9's cuts in order, re-measuring after each one, and ledger
    each cut:
    1. Bloom at one third of the resolution.
    2. Thin out the cables.
    3. Fewer towers.

- [ ] **Step 2: Check the result.**
  - Pull frames at several seconds: none are blank, the jaw is visibly open on kicks and shut
    between them, and the eyes flare.
  - Make a phone copy with `--phone` (< 30 MB) and send it to the owner.

- [ ] **Step 3: Check the app.** With `npm run dev`:
  - Iron Wraith appears in the gallery.
  - The editor's live preview plays and follows the jaw.
  - Switching through all six presets ten times updates instantly, and
    `renderer.info.memory.geometries` and `textures` don't grow. Expose `renderer` for this
    check on `window.__ironWraith` in preview only, or read the values with the browser
    console via a temporary log, then remove it.
  - Toggle `showTowers` and change the font: the picture updates.
  - Export a 10 s Draft through the app's Export panel: the download plays.

- [ ] **Step 4: Update `CLAUDE.md`.**
  - Template rules gains this line: "three.js templates load `assets/three-kit.js`
    (`npm run build:three`, then `npm run sync:toolkit`); force `UnsignedByteType` on every
    `EffectComposer`/`UnrealBloomPass` target (three.js defaults to half-float)."
  - Commands table gains `npm run build:three`.
  - Machine facts gains the measured Iron Wraith speed ("≈ N× song length").

- [ ] **Step 5: Run** `npm run check` and `npm run check:templates`. Expected: all pass.

- [ ] **Step 6: Commit**

  ```bash
  git add CLAUDE.md
  git commit -m "docs: Iron Wraith speed, three.js template rules"
  ```

Then run the final whole-branch review (fresh reviewer), followed by the PR. The owner says
when to merge.
