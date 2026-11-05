# Milestone 3: Particle Horizon Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved Particle Horizon prototype into the app's first real template: the Sunlight-style look,
with every §4.1 setting and six presets, built on a shared toolkit, and a command that renders it with any real song.

**Architecture:**
- **Toolkit:** a shared browser script (`templates/shared/viz-toolkit.js`) holds the audio, colour and WebGL helpers. It is copied into each template's `assets/`.
- **Template:** `templates/particle-horizon/` is a HyperFrames project ported from the prototype onto the toolkit. It declares its settings as HyperFrames variables and describes them in `template.json`.
- **Server code:** reads and validates templates (`src/lib/templates.ts`) and builds a job folder from a template plus a song (`src/lib/jobs.ts`).
- **Dev commands:** `npm run render` and `npm run check:templates` use that server code. The editor (M4) and export (M5) will use the same code later.

**Tech Stack:** HyperFrames 0.9.10 (WebGL 1 in a HyperFrames composition, GSAP for the title and fade), TypeScript + Vitest, Python + NumPy for the sample song, FFmpeg.

**Spec:** `docs/superpowers/specs/2026-11-04-music-visualizer-app-design.md` (§3, §4.1, §6, §9, §10, §11, §13 row 3)

**Prototype:** `docs/research/prototypes/particle-horizon-prototype.html` is the T-REX render the owner saw (research §8). This is our starting point, not a reference to be redesigned.

**Branch:** `feat/m3-particle-horizon`, cut from `feat/m2-analyzer` (PR #3, not yet merged). Open the M3 PR only after PR #3 is merged.

## Global Constraints

- HyperFrames is pinned at **0.9.10**. Run it as `npx hyperframes …`.
- Drawing uses only the `hf-seek` time. No `Math.random()`, `Date.now()` or timers. Random-looking values come from the toolkit's `mulberry32`.
- **WebGL: 8-bit (`UNSIGNED_BYTE`) render targets only.** Check shader compile **and** link status, and throw a clear error.
- Grain stays subtle and slow: amplitude ≤ 0.02, updated ≤ 6×/s.
- Song-length elements carry `data-song-length`. The job builder sets their `data-duration` and the root's. The end fade reads the root `data-duration` at load.
- Every template passes `npx hyperframes check` with **0 errors**. Warnings are reviewed, not required to be zero.
- Variable types: `string`, `number`, `color`, `boolean`, `enum` (`options: [{value,label}]`). Every template has `title`, `artist`, `intensity`.
- Every declared variable appears in **exactly one** `template.json` group. A check enforces this.
- Fixed asset paths:
  - `assets/song.wav`
  - `assets/audio-data.js` (`window.AUDIO_DATA=…`)
  - `assets/viz-toolkit.js`
  - `assets/background.jpg`
- **Never commit music, video or song-derived data.** `templates/*/assets/audio-data.js` is git-ignored. `*.wav` already is.
- Test renders go to `test-renders/` (git-ignored). Copies sent to the owner's phone must be **under 30 MB**.
- Final encode: H.264 CRF 20, AAC 320 kb/s, `+faststart`.
- Code style: TypeScript strict. `npm run check` must pass before every commit, and `npm run check:templates` too once Task 6 exists. tsx scripts wrap their code in `main()` (CommonJS, so no top-level `await`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions this plan makes (spec silent or deferred)

1. **Toolkit scope:** only what Particle Horizon uses. `bandCount`, `bandThickness`, `spectrumStyle`, `scaleOnBeat`, `shakeOnBeat`, the song timer and the Canvas 2D glow helpers arrive with the first template that needs them.
2. **`beatRange`** gets an extra first option, `kick`: "Kick (auto)". It is the default and uses the analyzer's own `k` and `hits`, so the look matches the prototype exactly. The spec's Hz ranges are computed in the toolkit from the band levels.
3. **`spectrumBoost`** (1/2/4/8×) maps a level `v` to `1 − (1 − v)^boost`. Plain multiplication would clip almost everything to full at 4× and 8×, because levels are already scaled to the song.
4. **Settings reach the render in two places:**
   - The job folder's `index.html` gets the chosen values as its variable defaults.
   - The same values are also written to `variables.json` and passed as `--variables-file … --strict-variables`.

   Baking in the defaults means `hyperframes snapshot` (which has no variables option) and the Studio preview show the chosen look too.
5. **Sections in M3** use HyperFrames' own `render --start/--end`. Slicing the WAV and analysis for a section stays in M5, if it is still needed.
6. **Background image:** the job builder converts it to JPEG at the fixed path `assets/background.jpg`, no wider than 1920 px. The template ships a small generated dark placeholder there. `showBackground` is off by default.
7. **`template.json` `preview`** (the gallery clip) is optional until M7.
8. **Waves:** at the defaults (all 100 %), the wave constants equal the prototype's (flow 1.6, third-wave evolution 0.4). `waveSpeed` also adds a slow evolution term (`0.15 × waveSpeed/100`) to the first two waves, so the pattern visibly changes. That is a small, intended change from the prototype.

## Review Focus

1. **Album-length songs (60 min).** Every song-length element and the root get the song's duration. The end fade starts at duration − 2.5 s. A ~22 MB `audio-data.js` loads before the first frame. Pinned by `prepareJob sets a 3600 s duration everywhere` (Task 4) and the 60-minute render step (Task 7).
2. **Settings at their extremes.** Examples: density 25 % and 200 % (≈ 269k particles), wave values 0 and 300, intensity 0.2 and 2, `spectrumLow ≥ spectrumHigh`. The result must render with no blank or broken frame. Pinned by `spectrum with low ≥ high falls back to a valid range` (Task 1) and the extremes sheet (Task 8).
3. **Unusual text.** A 60-character title, an empty artist, accented and Japanese characters: the title stays on one line inside the 80 % title-safe width (it shrinks to fit), and an empty line takes no space. Pinned by the text sheet (Task 8).
4. **Odd background images.** Portrait, tiny, 8000 px wide, PNG with transparency, or not an image at all. Expected: cover-cropped, never stretched; the converter caps the width; a bad file gives "Couldn't read this image. Try JPG or PNG." Pinned by `prepareJob converts the background image` and `prepareJob reports an unreadable image` (Task 4), plus the background sheet (Task 8).
5. **Quiet or silent stretches.** The field keeps moving and stays visible, never frozen or black. Pinned by the `check:templates` minimum brightness on the quiet frame (Task 6).

---

### Task 1: Toolkit: audio and colour helpers

**Files:**
- Create: `templates/shared/viz-toolkit.js`, `templates/shared/viz-toolkit.d.ts`
- Test: `src/lib/viz-toolkit.test.ts`

**Interfaces:**
- Consumes: the analysis format in `src/lib/analysis.ts` (`{version, fps, bands, duration, frames:[{b,l,k,f}], hits:[[t,s]]}`); band edges as in `analyzer/bands.py` (`geomspace(30, 16000, 33)`).
- Produces (the global `VizToolkit` in the browser, `module.exports` under Node, via a UMD wrapper):
  - `mulberry32(seed: number): () => number`: values in [0, 1), the same algorithm as the prototype.
  - `hexToRGB(hex: string): [number, number, number]`: 0..1 values from `#rgb` or `#rrggbb`. Throws `Error("Not a colour: <hex>")` otherwise.
  - `bandEdges(): number[]`: the 33 edges.
  - `bandIndexForHz(hz: number): number`: fractional band position, clamped to `[0, 31]`.
  - `BEAT_RANGES: {value: string, label: string, low?: number, high?: number}[]`, in this order:
    - `kick` "Kick (auto)"
    - `20-90` "20–90 Hz"
    - `90-200`
    - `20-200`
    - `200-600`
    - `600-3000`
    - `3000-8000`
    - `8000-20000`
    - `20-20000`
  - `beatTrack(frames, fps, firstBand, lastBand): {hits: [number, number][], pulse: Float32Array}`: the analyzer's `onsets` rule, run on the summed rise of the chosen bands. Rules:
    - normalize to the 99th percentile
    - threshold = mean over ±0.5 s × 1.4 + 0.12
    - local peak over ±2 frames
    - hits ≥ 0.15 s apart
    - pulse = strength × exp(−age / 0.22)
  - `createAudio(data, opts?) → audio`, where `opts = {beatRange?: string, spectrumLow?: number, spectrumHigh?: number, spectrumBoost?: number, spectrumCount?: number}` (defaults `kick`, 30, 16000, 1, 32). Its members:
    - `audio.fps`, `audio.duration`
    - `audio.sample(t): {bands: Float32Array(32), loud, kick, flux, beat}`: linearly interpolated, with t clamped to the song. `beat` is the analyzer's `k` for `kick`, otherwise the toolkit's pulse.
    - `audio.spectrum(t, out?: Float32Array): Float32Array`: `spectrumCount` values, log-spaced from `spectrumLow` to `spectrumHigh`, boosted. If low ≥ high, the two are swapped. If they are within one band of each other, they are widened to one band.
    - `audio.recentHits(t, n): [age, strength][]`: up to n hits at or before t, newest first, from the beat source.

- [ ] **Step 1: Write the failing tests** in `src/lib/viz-toolkit.test.ts`. Load the toolkit with `createRequire(import.meta.url)("../../templates/shared/viz-toolkit.js") as VizToolkit` (type imported from the `.d.ts`). Build analyses in the test with a helper `fakeAnalysis(frames, hits)`. Tests:
  - `mulberry32 repeats for the same seed and stays in [0,1)`: seed 777, 1000 values, two runs equal.
  - `hexToRGB reads #rrggbb and #rgb`: `#ff6a12` → `[1, 106/255, 18/255]`; `#fff` → `[1,1,1]`; `"orange"` throws `/Not a colour/`.
  - `bandEdges match the analyzer`: length 33, `[0]` = 30, `[32]` = 16000, `[8]` ≈ 144.3 (±0.1).
  - `sample interpolates between frames and clamps time`: frames with `l` 0 and 1 at fps 30; `sample(0.5/30).loud` = 0.5; `sample(-1)` equals frame 0; `sample(999)` equals the last frame.
  - `kick beat range uses the analyzer's kick and hits`: `beat` = interpolated `k`, and `recentHits(2.0, 4)` returns the analysis hits before 2.0 as `[age, s]`, newest first.
  - `a Hz beat range finds pulses in its own bands`: 60 frames where bands 0–5 jump from 0 to 1 at frame 30. With `beatRange "20-90"` there is one hit at 1.0 s (±1 frame). With `"3000-8000"` there are none.
  - `default spectrum equals the bands`: with defaults, `spectrum(t)` equals `sample(t).bands` (±1e-6).
  - `spectrum range and boost`: low 30 / high 144.3 gives 32 values that all come from bands 0–8; boost 2 maps 0.5 → 0.75.
  - `spectrum with low ≥ high falls back to a valid range`: low 5000 / high 100 behaves like low 100 / high 5000; low = high = 1000 returns finite values in [0, 1].
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/viz-toolkit.test.ts`. Expected: FAIL, "Cannot find module …viz-toolkit.js".
- [ ] **Step 3: Implement the toolkit** in `templates/shared/viz-toolkit.js`. Use plain ES2017 browser JS in a UMD wrapper `(function (root, factory) {…})(typeof self !== "undefined" ? self : this, …)`, with no imports. Write the `.d.ts` to match the Interfaces block. Per-range beat tracks are computed once, on first use.
- [ ] **Step 4: Run them, expect pass.** Run: `npx vitest run src/lib/viz-toolkit.test.ts`. Expected: all pass.
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat(toolkit): audio sampling, beat ranges, spectrum and colour helpers`.

### Task 2: Toolkit: WebGL helpers and copying into templates

**Files:**
- Modify: `templates/shared/viz-toolkit.js`, `templates/shared/viz-toolkit.d.ts`
- Create: `scripts/sync-toolkit.ts`, `src/lib/toolkit-sync.ts`
- Test: `src/lib/viz-toolkit.test.ts`, `src/lib/toolkit-sync.test.ts`
- Modify: `package.json` (add the `sync:toolkit` script)

**Interfaces:**
- Produces (toolkit):
  - `createProgram(gl, vertexSrc, fragmentSrc): WebGLProgram & {u: Record<string, WebGLUniformLocation>}`. Throws `Error("Shader didn't compile (vertex|fragment): <log>")` or `Error("Shaders didn't link: <log>")`. Collects uniforms as in the prototype.
  - `createTarget(gl, w, h): {tex, fb, w, h}`: always `UNSIGNED_BYTE`. Throws `Error("Render target incomplete")`.
  - `drawQuad(gl, program)`
  - `blur(gl, program, a, b, scale)`: two-pass separable blur, as in the prototype.
  - `showError(message: string)`: puts a full-frame `#viz-error` element on `document.body` with the message in a red monospace font, so a broken template never renders a silent black frame (spec §10).
- Produces (TS):
  - `toolkitCopies(templatesRoot: string): Promise<{template: string, path: string, upToDate: boolean}[]>`
  - `syncToolkit(templatesRoot: string): Promise<string[]>`: returns the paths it wrote.
  - The rule: every `templates/<id>/` that has a `template.json` gets `assets/viz-toolkit.js`, identical to `templates/shared/viz-toolkit.js`.

- [ ] **Step 1: Write the failing tests.**
  - In `viz-toolkit.test.ts`, use a fake `gl` object whose `getShaderParameter`/`getProgramParameter` return chosen values:
    - `createProgram throws a clear error when shaders fail to link`: link status false, info log "precision mismatch" → throws `/didn't link: precision mismatch/`.
    - `createProgram throws when a shader fails to compile`: compile false → throws `/didn't compile \(fragment\)/`.
    - `createTarget uses 8-bit textures`: records the `texImage2D` type argument; expects `gl.UNSIGNED_BYTE`.
  - In `toolkit-sync.test.ts`, using a temp dir with `shared/viz-toolkit.js` and two template folders:
    - `syncToolkit copies the toolkit into every template`
    - `toolkitCopies reports a stale copy`
    - `folders without template.json are skipped`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/viz-toolkit.test.ts src/lib/toolkit-sync.test.ts`. Expected: FAIL (`createProgram` is not a function; module not found).
- [ ] **Step 3: Implement the helpers, `src/lib/toolkit-sync.ts`, and `scripts/sync-toolkit.ts`** (`npm run sync:toolkit` prints each path it wrote).
- [ ] **Step 4: Run them, expect pass.**
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat(toolkit): WebGL helpers with clear errors; sync command`.

### Task 3: Reading and validating templates

**Files:**
- Create: `src/lib/templates.ts`
- Test: `src/lib/templates.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type VariableBase = { id: string; label: string };
  export type TemplateVariable =
    | (VariableBase & { type: "string"; default: string; maxLength?: number; placeholder?: string })
    | (VariableBase & { type: "number"; default: number; min?: number; max?: number; step?: number; unit?: string })
    | (VariableBase & { type: "color"; default: string })
    | (VariableBase & { type: "boolean"; default: boolean })
    | (VariableBase & { type: "enum"; default: string; options: { value: string; label: string }[] });
  export type TemplateValues = Record<string, string | number | boolean>;
  export type TemplatePreset = { name: string; thumbnail?: string; values: TemplateValues };
  export type TemplateManifest = { name: string; description: string; preview?: string;
    groups: { name: string; fields: string[] }[]; basic: string[]; content: string[]; presets: TemplatePreset[] };
  export type Template = { id: string; dir: string; manifest: TemplateManifest; variables: TemplateVariable[] };
  export class TemplateError extends Error {}
  export function parseVariables(html: string): TemplateVariable[];      // throws TemplateError
  export function validateValue(v: TemplateVariable, value: unknown): string | null;
  export function validateValues(vars: TemplateVariable[], values: Record<string, unknown>): string[];
  export function validateTemplate(t: Template): string[];               // [] = valid
  export function defaultValues(vars: TemplateVariable[]): TemplateValues;
  export function resolveValues(t: Template, opts: { preset?: string; overrides?: Record<string, string> }): TemplateValues; // throws TemplateError
  export async function loadTemplate(dir: string): Promise<Template>;
  export async function listTemplates(root: string): Promise<Template[]>; // skips `shared` and folders without template.json
  ```
- `parseVariables` reads the single-quoted `data-composition-variables='…'` attribute on `<html>`. It decodes `&#39;`, `&quot;` and `&amp;`, then checks each entry's shape.
- `validateValue` rules:
  - colours match `#rrggbb` or `#rgb`
  - numbers are finite and within `min`/`max`
  - enum values are one of the options
  - strings respect `maxLength`
  - booleans are booleans
- `resolveValues` merges in this order: defaults ← the preset's values ← overrides. Override strings are parsed by type: numbers with `Number`, booleans as `true`/`false`. Errors name the valid ids or preset names.

- [ ] **Step 1: Write the failing tests** (use HTML strings and temp dirs):
  - `parseVariables reads every type`: one variable of each of the five types round-trips.
  - `parseVariables decodes entities`: a label `It&#39;s` → `It's`.
  - `parseVariables rejects bad declarations`: missing `default`, unknown type, enum without options. Each throws `TemplateError` naming the variable id.
  - `validateValue checks each type`: `#12345g` bad; 250 bad when max is 200; enum `"9"` bad; `"yes"` bad for a boolean.
  - `validateTemplate requires every variable in exactly one group`: a missing variable and a variable listed twice give two messages naming them.
  - `validateTemplate checks basic, content and presets`: an unknown id in `basic`, and a preset value outside its range, are both reported.
  - `validateTemplate requires title, artist and intensity`
  - `resolveValues applies preset then overrides`: preset sets `mainColor`; override `intensity=1.5` becomes the number 1.5; `--set nope=1` throws `/Unknown setting "nope"/`; preset `"Nope"` throws `/Unknown preset/` and lists the names.
  - `listTemplates skips shared and folders without template.json`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/templates.test.ts`.
- [ ] **Step 3: Implement `src/lib/templates.ts`.**
- [ ] **Step 4: Run them, expect pass.**
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: read and validate templates and their settings`.

### Task 4: Job folders and encode settings

**Files:**
- Create: `src/lib/jobs.ts`, `src/lib/encode.ts`
- Test: `src/lib/jobs.test.ts`, `src/lib/encode.test.ts`

**Interfaces:**
- Consumes:
  - `Template`, `TemplateValues`, `validateValues`, `parseVariables` (Task 3)
  - `isCurrentAnalysis`, `toAudioDataJs`, `Analysis` (`src/lib/analysis.ts`)
  - `RunCommand` (`src/lib/run-command.ts`)
- Produces:
  ```ts
  export class JobError extends Error {}
  export function setSongLength(html: string, seconds: number): string;
  export function withVariableDefaults(html: string, values: TemplateValues): string;
  export type PrepareJobOptions = { template: Template; song: { wavPath: string; analysisPath: string };
    values: TemplateValues; jobDir: string; backgroundPath?: string; run: RunCommand };
  export type PreparedJob = { jobDir: string; indexPath: string; variablesPath: string; duration: number };
  export async function prepareJob(opts: PrepareJobOptions): Promise<PreparedJob>;
  // encode.ts
  export function finalEncodeArgs(input: string, output: string): string[];
  export function phoneVideoKbps(seconds: number): number;
  export function phoneCopyArgs(input: string, output: string, seconds: number): string[];
  ```
- `setSongLength` changes:
  - the `data-duration` of the first element with `data-composition-id`
  - the `data-duration` of every element with `data-song-length`

  The value is written with 3 decimals. It throws `JobError` if there is no root, or if a song-length element has no `data-duration`.
- `withVariableDefaults` rewrites the `default` of each given id in the declaration JSON. It escapes `'` as `&#39;` so the attribute stays valid.
- `prepareJob` steps, in order:
  1. Validate the values. Invalid values → `JobError` listing the problems.
  2. Copy the template folder, except `assets/song.wav`, `assets/audio-data.js`, `presets/` and `.hyperframes/`.
  3. Copy the song to `assets/song.wav`.
  4. Read the analysis (if it is not current → `JobError`) and write `assets/audio-data.js` with `toAudioDataJs`.
  5. Rewrite `index.html` with `setSongLength(…, analysis.duration)` and then `withVariableDefaults`.
  6. Write `variables.json`.
  7. If `backgroundPath` is given, run `ffmpeg -y -v error -i <src> -vf "scale='min(1920,iw)':-2" -frames:v 1 -q:v 2 <job>/assets/background.jpg`. A nonzero exit → `JobError("Couldn't read this image. Try JPG or PNG.")`.
- `finalEncodeArgs`: `-y -i in -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 320k -movflags +faststart out`.
- `phoneVideoKbps(s) = max(300, min(4000, floor(26 * 8 * 1000 / s) - 128))`.
- `phoneCopyArgs`: 720p (`-vf scale=-2:720`), libx264 at that bitrate with `-maxrate` 1.5× and `-bufsize` 2×, AAC 128k, `+faststart`.

- [ ] **Step 1: Write the failing tests:**
  - `setSongLength sets the root and every song-length element`, with a 3-element HTML string.
  - `setSongLength throws when a song-length element has no duration`
  - `withVariableDefaults round-trips through parseVariables`: `title` → `It's "big"`, `intensity` → 1.5.
  - `prepareJob builds a ready job folder`. Use a temp template (index.html with root and 2 song-length elements, template.json, `assets/viz-toolkit.js`, a stale `assets/audio-data.js`), a 3-frame analysis with duration 12.345, and a fake wav. Expect:
    - `assets/song.wav` copied
    - `audio-data.js` starts with `window.AUDIO_DATA=` and holds this analysis, not the stale one
    - durations are `12.345`
    - `variables.json` equals the values
    - `presets/` is not copied
  - `prepareJob sets a 3600 s duration everywhere`
  - `prepareJob rejects invalid values`: `mainColor: "red"` → `JobError` naming `mainColor`.
  - `prepareJob converts the background image`: a fake `run` records its args (they include `-frames:v` and `background.jpg`) and returns code 0.
  - `prepareJob reports an unreadable image`: the fake `run` returns code 1 → the message above.
  - `phoneVideoKbps keeps a full song under 30 MB`: `phoneVideoKbps(252)` ≈ 697; `(252 × (697 + 128) kb/s) / 8` < 30 MB; `phoneVideoKbps(30)` = 4000.
  - `finalEncodeArgs uses CRF 20, AAC 320k and faststart`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/jobs.test.ts src/lib/encode.test.ts`.
- [ ] **Step 3: Implement `jobs.ts` and `encode.ts`.**
- [ ] **Step 4: Run them, expect pass.**
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: build render job folders; final and phone encode settings`.

### Task 5: Sample song and template dev assets

**Files:**
- Create: `analyzer/sample_song.py`, `analyzer/tests/test_sample_song.py`
- Create: `src/lib/sample-song.ts`, `scripts/template-assets.ts`
- Modify: `.gitignore`, `src/lib/repo-hygiene.test.ts`, `package.json` (add the `template:assets` script)

**Interfaces:**
- Produces:
  - `analyzer/sample_song.py`:
    - `make_sample_song() -> np.ndarray` (mono float32, 44.1 kHz, exactly 20.0 s, deterministic)
    - command line `python analyzer/sample_song.py --out <wav>` (16-bit mono)
    - Layout:
      - 0–8 s: quiet pad (80 / 700 / 4000 Hz tones at ≈ −30 dBFS, slow swells, no kicks)
      - 8–20 s: loud section (the same tones ≈ −10 dBFS plus kicks every 0.5 s from 8.25 s)
      - 50 ms fades at both ends
  - `src/lib/sample-song.ts`: `SAMPLE_SONG = { duration: 20, quietAt: 4, loudAt: 14 }`.
  - `npm run template:assets`:
    1. Writes `storage/sample/sample-song.wav`.
    2. Runs `prepareSong` on it.
    3. For each template from `listTemplates("templates")`, copies `song.wav` → `templates/<id>/assets/song.wav` and writes `templates/<id>/assets/audio-data.js`.
    4. Runs `syncToolkit`.

    It does nothing if the assets are already current.
- `.gitignore`: add `templates/*/assets/audio-data.js` with the comment "made from a song: never commit".

- [ ] **Step 1: Write the failing tests:**
  - pytest `test_sample_song_is_20_seconds_and_repeatable`
  - pytest `test_loud_section_is_much_louder`: RMS of 10–20 s ≥ 6 × the RMS of 0–8 s.
  - pytest `test_sample_song_analysis_has_a_quiet_and_a_loud_part`: `analyze_samples` mean `l` over 2–7 s ≤ 0.3; over 10–19 s ≥ 0.6; at least 15 hits after 8 s.
  - Vitest repo hygiene: ignores `templates/particle-horizon/assets/audio-data.js` and `templates/particle-horizon/assets/song.wav`; still tracks `templates/particle-horizon/assets/viz-toolkit.js` and `templates/particle-horizon/template.json`.
- [ ] **Step 2: Run them, expect failure.** Run: `npm run test:py` and `npx vitest run src/lib/repo-hygiene.test.ts`.
- [ ] **Step 3: Implement** `sample_song.py`, `sample-song.ts`, `scripts/template-assets.ts`, the `.gitignore` line and the npm script.
- [ ] **Step 4: Run them, expect pass.**
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: generated sample song and dev assets for templates`.

### Task 6: Particle Horizon: core port, contract check and reaction check

**Files:**
- Create: `templates/particle-horizon/index.html`, `template.json`, `hyperframes.json` (copied from the prototype project), `assets/viz-toolkit.js` (from sync), `assets/background.jpg`
  - The placeholder `background.jpg` is a 1920×1080 dark amber radial gradient, < 60 KB: `ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x1a0b04:c1=0x000000:type=radial" -frames:v 1 -q:v 4`.
- Create: `scripts/check-templates.ts`, `src/lib/frames.ts`
- Test: `src/lib/frames.test.ts`, `src/lib/templates.test.ts` (adds a test over the real folder)
- Modify: `package.json` (add the `check:templates` script)

**Interfaces:**
- Consumes:
  - the toolkit (Tasks 1–2)
  - `loadTemplate`, `validateTemplate` (Task 3)
  - `SAMPLE_SONG`, `npm run template:assets` (Task 5)
- Produces:
  - Template variables in this task (Task 8 adds the rest):

    | id | type | default | range / options |
    | --- | --- | --- | --- |
    | `title` | string | `SUNLIGHT` | maxLength 60 |
    | `artist` | string | `AXIOM` | maxLength 60 |
    | `mainColor` | color | `#ff6a12` | |
    | `highlightColor` | color | `#ffd38a` | |
    | `intensity` | number | 1 | min 0.2, max 2, step 0.1 |
    | `letterbox` | boolean | `true` | |
    | `beatRange` | enum | `kick` | options = toolkit `BEAT_RANGES` (value, label) |
    | `spectrumLow` | number | 30 | min 30, max 16000, unit Hz |
    | `spectrumHigh` | number | 16000 | min 30, max 16000, unit Hz |
    | `spectrumBoost` | enum | `1` | `1` "1×", `2` "2×", `4` "4×", `8` "8×" |
  - `template.json` for this task:
    - name "Particle Horizon"
    - description "A glowing particle sea rolling toward a warm horizon."
    - groups: Text [title, artist], Colors [mainColor, highlightColor], Effects [intensity, letterbox], Audio [beatRange, spectrumLow, spectrumHigh, spectrumBoost]
    - `basic` [mainColor, intensity]
    - `content` [title, artist]
    - `presets` []
  - `frames.ts`:
    - `grayFrameArgs(png: string, out: string): string[]`: ffmpeg → 192×108 8-bit gray raw.
    - `grayStats(a: Uint8Array, b: Uint8Array): {meanA: number, meanB: number, meanAbsDiff: number}`
  - `npm run check:templates`, for each template:
    1. Fail if the toolkit copy is stale ("run npm run sync:toolkit").
    2. Make sure the dev assets exist (the `template:assets` logic).
    3. Run `validateTemplate`. Any problems → fail and list them.
    4. Run `npx hyperframes check <dir> --json`. `errorCount` > 0 in any section → fail and print the findings; print the warning count.
    5. Reaction check: `npx hyperframes snapshot <dir> --at 4,14 --no-end --json -o storage/checks/<id>`, then `grayStats(quiet, loud)`.
       - Fail unless `meanAbsDiff ≥ 6`, `meanB ≥ meanA + 3` (loud is brighter) and `meanA ≥ 8` (quiet is still visible).
       - Print the three numbers.
- Template behaviour (port of the prototype, same look at the defaults):
  - Load order: `assets/audio-data.js`, `assets/viz-toolkit.js`, then GSAP (the prototype's pinned CDN script).
  - Read the variables once at init.
  - `audio = VizToolkit.createAudio(window.AUDIO_DATA, {beatRange, spectrumLow, spectrumHigh, spectrumBoost: Number(spectrumBoost)})`.
  - Spectrum history rows come from `audio.spectrum(t − r·0.05)`; zero before 0.
  - Ripples come from `audio.recentHits(t, 4)`; the `kick` uniform from `sample(t).beat`.
  - All programs and targets use the toolkit helpers. The prototype's half-float extension lines are removed.
  - The whole setup runs in `try { … } catch (e) { VizToolkit.showError(String(e.message || e)); }`.
  - Title and artist use `data-var-text`.
  - Song-length elements are `#titles`, `#fade` and `#music`, each with `data-song-length`.
  - The fade-out tween starts at `root data-duration − 2.5`. Both `fromTo` calls on one target get `immediateRender: false` after the first one (fixes the prototype's lint warning).
  - The root `data-duration` is 20 (the sample song).

- [ ] **Step 1: Write the failing tests:**
  - `grayStats measures brightness and difference`: [0,10] vs [10,30] → meanA 5, meanB 20, meanAbsDiff 15.
  - `grayFrameArgs scales to 192×108 gray raw`
  - In `templates.test.ts`, `every template in templates/ is valid`: `listTemplates("templates")` is non-empty and `validateTemplate` returns `[]` for each.
  - In `templates.test.ts`, `Particle Horizon's beatRange options match the toolkit`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/frames.test.ts src/lib/templates.test.ts`. Expected: FAIL (no templates found; module missing).
- [ ] **Step 3: Build the template, `frames.ts` and `scripts/check-templates.ts`.** Start from a copy of the prototype and change only what the bullets above say.
- [ ] **Step 4: Run the unit tests, expect pass.** Then run `npm run check:templates`. Expected:
  - validation passes
  - `hyperframes check` reports 0 errors (warnings listed)
  - the reaction check prints three numbers that meet the thresholds
- [ ] **Step 5: Error display check.** In a scratch copy of the template, break one line of `PARTICLE_FS` and run `npx hyperframes snapshot <copy> --at 1 --no-end`. Expected: the still shows the red "Shader didn't compile (fragment)…" text, not a black frame. Delete the copy.
- [ ] **Step 6: Run `npm run check` and commit.** Message: `feat(templates): Particle Horizon on the shared toolkit, with template checks`.

### Task 7: `npm run render`: real songs through a job folder

**Files:**
- Create: `scripts/render.ts`, `src/lib/render-args.ts`
- Test: `src/lib/render-args.test.ts`
- Modify: `package.json` (add the `render` script)

**Interfaces:**
- Consumes: `prepareSong` (M2), `loadTemplate`, `resolveValues` (Task 3), `prepareJob`, `finalEncodeArgs`, `phoneCopyArgs` (Task 4).
- Produces:
  - `parseRenderArgs(argv: string[]): RenderArgs`, which throws `Error(USAGE)` on bad input:
    ```ts
    type RenderArgs = { templateId: string; song: string; preset?: string; overrides: Record<string, string>;
      background?: string; start?: number; end?: number; quality: "draft" | "final"; phone: boolean;
      preview: boolean; keepJob: boolean };
    ```
  - `outputName(values: TemplateValues, templateName: string, start?: number, end?: number): string` → `"<artist> - <title> (<Template name>)[ <m.ss>-<m.ss>].mp4"`. Characters `\/:*?"<>|` become `_`.
  - Usage: `npm run render -- <template> <song> [--preset <name>] [--set id=value]... [--background <image>] [--start <s>] [--end <s>] [--quality draft|final] [--phone] [--preview] [--keep-job]`
  - Flow:
    1. `prepareSong`
    2. `prepareJob` into `storage/jobs/<YYYYMMDD-HHMMSS>-<template>/`
    3. With `--preview`: run `npx hyperframes preview <jobDir>` with inherited output and stop there (the job folder is kept).
    4. Otherwise render: `npx hyperframes render <jobDir> --variables-file <variables.json> --strict-variables --quality <draft|delivery> [--start s] [--end s] -o <jobDir>/raw.mp4`, with inherited output so progress shows.
    5. FFmpeg `finalEncodeArgs` → `test-renders/<outputName>`.
    6. With `--phone`, also write `… (phone).mp4`.
    7. Print each output's path, size and duration (ffprobe).
    8. Delete the job folder unless `--keep-job`.

    A render failure keeps the job folder and says where it is.
  - For spawning with live output, use `spawnSync` with `stdio: "inherit"` (and `shell: true` for `npx` on win32, as `run-command.ts` does).

- [ ] **Step 1: Write the failing tests:**
  - `parseRenderArgs reads every option`
  - `parseRenderArgs collects repeated --set`
  - `parseRenderArgs rejects a missing song and an unknown quality`
  - `outputName builds the export name`: `AXIOM - T-REX (Particle Horizon) 3.10-3.40.mp4` for start 190, end 220.
  - `outputName replaces characters Windows forbids`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/render-args.test.ts`.
- [ ] **Step 3: Implement `render-args.ts` and `scripts/render.ts`.**
- [ ] **Step 4: Run them, expect pass.**
- [ ] **Step 5: Real-song render.** Run: `npm run render -- particle-horizon "C:\Users\ydogg\Downloads\AXIOM\T-REX.wav" --set title=T-REX --start 190 --end 220 --quality final --phone`. Expected:
  - Two files in `test-renders/`.
  - Both durations are 30.0 s (±0.1).
  - The phone copy is < 30 MB.
  - Extract frames at 5 s and 20 s and compare them with the prototype's `T-REX test - particle horizon.mp4` at the same moments. The look matches: same colour, field shape and haze; any differences come only from Decision 8.
- [ ] **Step 6: Album-length check.** Make a 60-minute file in `storage/sample/` with FFmpeg (lavfi `sine` + `volume` steps, as in M2). Run `npm run render -- particle-horizon storage/sample/hour.wav --start 3590 --end 3600 --quality draft`. Expected: it finishes, the output is 10 s, and its last second fades toward black. Delete `hour.wav` afterwards.
- [ ] **Step 7: Run `npm run check` and `npm run check:templates`, then commit.** Message: `feat: npm run render for real songs, with phone copies and Studio preview`.

### Task 8: The rest of the §4.1 settings

**Files:**
- Modify: `templates/particle-horizon/index.html`, `templates/particle-horizon/template.json`
- Test: `src/lib/templates.test.ts` (the real-template validity test now covers the new variables)

**Interfaces:**
- Produces these variables:

  | id | type | default | range / options | group |
  | --- | --- | --- | --- | --- |
  | `font` | enum | `Montserrat` | Montserrat, Inter, Outfit, Poppins, Lato, Oswald, Playfair Display, EB Garamond (value = label = family) | Text |
  | `tint` | number | 20 | 0–100, unit % | Colors |
  | `showBackground` | boolean | `false` | | Effects |
  | `backgroundBlur` | number | 100 | 0–100, unit % | Effects |
  | `densityX` | number | 100 | 25–200, unit % | Wave |
  | `densityY` | number | 100 | 25–200, unit % | Wave |
  | `waveScale` | number | 100 | 25–300, unit % | Wave |
  | `waveHeight` | number | 100 | 0–300, unit % | Wave |
  | `flowSpeed` | number | 100 | 0–300, unit % | Wave |
  | `waveSpeed` | number | 100 | 0–300, unit % | Wave |

- Group order: Text, Colors, Effects, Wave, Audio.
- `basic` = `[mainColor, intensity, font, showBackground, backgroundBlur, densityY, densityX]` (Videobolt's Basic tab plus colour and intensity).
- What each setting does in the shader or page:
  - **Density:** columns = round(560 × densityX/100), rows = round(120 × densityY/100). Point size × clamp(sqrt(100 / density), 0.75, 1.5), so coverage stays similar.
  - **waveScale:** every wave's x/z frequency × 100/waveScale.
  - **waveHeight:** the summed base waves × waveHeight/100 (ripples and spectrum unchanged).
  - **flowSpeed:** `zt = z + t·1.6·flowSpeed/100`.
  - **waveSpeed:** see Decision 8.
  - **tint:** particle hue rotated by `tint/100 × 360° × (g.x − 0.5)` plus `tint/100 × 40° × sin(0.05·t)`. At 0 the colour is exactly the prototype's.
  - **Background:** when `showBackground` is on, `assets/background.jpg` is drawn once at init onto a 2D canvas, cover-cropped, with `ctx.filter = blur(backgroundBlur/100 × 40 px)`. It is uploaded as a texture, then drawn at 55 % brightness under the sky and haze in the composite. The upload is skipped if the image hasn't loaded or failed (then there is no background).
  - **Font:** set on `#titles` at init. The stylesheet has one hidden `<span>` per font family so the HyperFrames compiler bundles every family.
  - **Title fitting:** at init, shrink the title's font size until its width ≤ 1536 px (80 %). An empty `artist` or `title` element gets `display: none`.

- [ ] **Step 1: Write the failing test.** The real-template test from Task 6 already checks validity. Add `Particle Horizon declares every §4.1 setting`: the variable ids equal the 20 listed in Tasks 6 and 8, in group order.
- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/lib/templates.test.ts`. Expected: FAIL listing the missing ids.
- [ ] **Step 3: Implement the settings.**
- [ ] **Step 4: Run it, expect pass.** Then run `npm run check:templates` (0 errors; reaction thresholds met).
- [ ] **Step 5: Visual sheets.** Use `prepareJob` with the sample song plus `npx hyperframes snapshot --at 14 --no-end` to make one still per row, then join them with FFmpeg `xstack` into `test-renders/m3-sheets/*.jpg`. Look at every still.
  - **Extremes:** density 25/25 and 200/200; waveHeight 0 and 300; waveScale 25 and 300; flowSpeed 0 and 300; intensity 0.2 and 2; `spectrumLow 5000 / spectrumHigh 100`. Every still must be non-black and free of broken geometry.
  - **Text:** a 60-character title; empty artist; `Café Ünïcode`; `日本語タイトル`; each of the 8 fonts.
  - **Background:** off; on with blur 0 and 100, using a generated portrait PNG (1080×1920) and a generated 8000×800 image.
  - **Tint:** 0, 20 and 100.

  Fix anything broken before you commit.
- [ ] **Step 6: Run `npm run check` and commit.** Message: `feat(templates): Particle Horizon wave, density, tint, font and background settings`.

### Task 9: Presets and thumbnails

**Files:**
- Modify: `templates/particle-horizon/template.json`
- Create: `scripts/thumbs.ts`, `templates/particle-horizon/presets/*.jpg`
- Modify: `package.json` (add the `thumbs` script)

**Interfaces:**
- Produces these presets (`thumbnail` = `presets/<lowercase name>.jpg`):

  | name | mainColor | highlightColor | tint |
  | --- | --- | --- | --- |
  | Original | `#ff6a12` | `#ffd38a` | 20 |
  | Ice | `#12b8ff` | `#bff4ff` | 20 |
  | Ember | `#ff1e12` | `#ff9a6a` | 15 |
  | Emerald | `#19e36a` | `#c8ffb0` | 20 |
  | Silver | `#b9c2cc` | `#ffffff` | 0 |
  | Prism | `#ff3df0` | `#ffffff` | 100 |

- `npm run thumbs -- <template> [--song <file>] [--at <s>]`:
  1. For each preset, `prepareJob` (sample song and `--at 14` by default).
  2. Snapshot.
  3. FFmpeg to 480×270 JPEG at `templates/<id>/presets/<name>.jpg`.
  4. Also write `test-renders/<id>-presets.jpg` (a 3×2 sheet).

- [ ] **Step 1: Write the failing test.** In `templates.test.ts`: `Particle Horizon has the six presets with thumbnails on disk`. It checks the names in order, that `validateTemplate` passes, and that every thumbnail file exists.
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Add the presets and `scripts/thumbs.ts`.** Run `npm run thumbs -- particle-horizon --song "C:\Users\ydogg\Downloads\AXIOM\T-REX.wav" --at 200`. Real music gives livelier thumbnails, and stills are not audio, so they may be committed.
- [ ] **Step 4: Run it, expect pass.** Look at the sheet. Each preset must be distinct and good-looking. Tune the colour values if one isn't (any change is a ledgered ruling).
- [ ] **Step 5: Run `npm run check` and `npm run check:templates`, then commit.** Message: `feat(templates): Particle Horizon presets with thumbnails`.

### Task 10: Docs and the owner's verdict

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update `CLAUDE.md`:**
  - Commands table: add `sync:toolkit`, `template:assets`, `check:templates`, `render`, `thumbs`.
  - Template rules: "run `npm run check:templates` before committing template changes"; "the toolkit lives in `templates/shared/`; edit it there, then `npm run sync:toolkit`".
  - Status line: M3 built, awaiting the owner's look check.
- [ ] **Step 2: Update `README.md`.** Add a short "Render a template with your own song" section with the `npm run render` example.
- [ ] **Step 3: Owner review material:**
  - Render T-REX 3:10–3:40 with the Original preset (final + phone).
  - Render the same section with Ice.
  - Send the two phone copies and `test-renders/particle-horizon-presets.jpg` to the owner with SendUserFile.
  - Ask whether it matches their Sunlight look and what to change.
- [ ] **Step 4: Run `npm run check` and `npm run check:templates`, then commit.** Message: `docs: milestone 3 commands and template workflow`.

Milestone 3 is done (spec §13) when the owner agrees the look matches their Sunlight videos on a real track. Their feedback becomes tuning commits on this branch, each followed by `check:templates` and a fresh phone clip, before the final review and PR.
