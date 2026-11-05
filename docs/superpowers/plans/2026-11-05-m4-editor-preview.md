# Milestone 4: Editor and Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the browser, the owner can:
- open the Particle Horizon editor
- upload a song
- see and hear the preview
- change any setting and watch the preview update live

**Architecture:**
- **Songs:** the browser uploads a song as a raw request body. The server streams it to disk, checks the limits, and analyzes it with `prepareSong` (M2).
- **Preview:** a route serves the template "virtually" for one song. The template's own files, the song's WAV and its analysis are mapped onto the template's fixed asset paths, the song length is set, and the HyperFrames runtime script is injected. Nothing is copied.
- **Live updates:** the editor embeds `<hyperframes-player>` and sends settings through the player's runtime-data channel. The template listens on that channel and redraws at once.
- **The form** is generated from the template's declared variables and `template.json`.

**Tech Stack:** Next.js 16.4.5 App Router with `cacheComponents: true`, React 19, Tailwind 4, the HyperFrames 0.9.10 player and runtime (`node_modules/hyperframes/dist/hyperframes-player.global.js`, `hyperframe.runtime.iife.js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-music-visualizer-app-design.md`. Relevant sections:
- §4 Editor, including the §4.1 layout
- §5 Server routes and units
- §8 Live preview
- §10 Error handling
- §13 row 4

**Branch:** `feat/m4-editor`, cut from `feat/m3-particle-horizon` (PR #4). Open the M4 PR after PR #4 is merged.

## What the spike found (2026-11-05, throwaway code in `storage/spike/`)

- **Live settings work.** `player.setRuntimeData("settings", values)` reaches a handler the composition registers with `window.__hyperframes.registerRuntimeDataHandler("settings", fn)`, and `fn` receives `values` as is. In the test, a colour change redrew the frame in 52 ms, with no reload and the playback position kept. The player then fires `runtimedataapplied`.
- **The page must load the runtime itself.** In `src` mode the player does not inject the HyperFrames runtime. The served `index.html` needs `<script src="…hyperframe.runtime.iife.js">` in `<head>`. Without it, `window.__hyperframes` (variables, runtime data) is missing.
- **During playback the template must redraw on its own timeline's updates.** The runtime plays the GSAP root timeline and sends `hf-seek` only on jumps. Particle Horizon draws only on `hf-seek`, so it barely moved during playback.
- **Drawing is fast.** One frame costs about 10–14 ms (JS plus GPU) on the Intel UHD 620. Playback inside Claude's embedded browser pane was still slow, even with drawing switched off (about 11 frames/s). That pane is not a reliable benchmark; the frame rate in the owner's Chrome is measured in Task 5.
- **The template's fallback defaults would be used without the runtime.** `setting(id, fallback)` repeats each default by hand. The template must read its declared defaults instead (the reviewer's deferred minor #11, promoted here).

## Global Constraints

- Next.js in this repo has breaking changes from older versions.
  - Read the matching page in `node_modules/next/dist/docs/01-app/` before writing a route, page or config.
  - Route-handler `params` is a `Promise` (`RouteContext<'/path/[id]'>`).
  - With `cacheComponents`, a page that reads files or params must wrap that read in `<Suspense>`.
- Songs: WAV, MP3, FLAC or M4A, **up to 60 minutes** and **up to 1 GB**. Analyzed once, then cached (`prepareSong`).
- Exact error copy (spec §10):
  - "Couldn't read this audio file. Try WAV or MP3."
  - "Songs can be up to 60 minutes long."
  - "Songs can be up to 1 GB."
- **Never commit music, video, song-derived data or `storage/`.**
- **The form is generated from the template's declared variables and `template.json`.** No per-template form code.
- Template rules (unchanged):
  - drawing depends only on time
  - 8-bit WebGL targets only
  - check compile and link status
  - `npm run check:templates` passes before any template commit
- Live preview messages never affect rendering. `render` and `snapshot` don't send runtime data, so a template must look the same without them.
- HyperFrames pinned at **0.9.10**. Player and runtime are served from `node_modules/hyperframes/dist`, never from a CDN.
- `npm run check` before every commit. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI copy is plain language. The owner follows along on a phone, so the editor must also be usable at 1280 px wide.

## Decisions this plan makes

1. **Live updates through runtime data, not reloads.** The fallback in spec §8, a debounced reload, is used only when the song changes, since the player's `src` changes anyway.
2. **The preview is served virtually.** `/preview/<templateId>/<songId>/<file>` maps files with no copying, so no 600 MB WAV is copied per template:
   - `index.html` → the template's file, song length set, runtime injected
   - `assets/song.wav` → `storage/songs/<id>/song.wav`, with byte ranges for seeking
   - `assets/audio-data.js` → the song's analysis
   - anything else → the template folder

   `songId` `sample` means the generated sample song.
3. **Uploads are a raw request body (`PUT /api/songs`) with the file name in a header.** The body is streamed to disk with a running byte count. Next.js buffers `formData()` in memory, which is wrong for a 1 GB file.
4. **Moved to later milestones:**
   - M5: section handles (they belong to export), background-image upload (it needs the job-folder path that export uses), expected export time
   - M7, as spec §13 already places them: presets panel, ambilight, undo/redo, Preview still, remembered settings
   - The Export button in the top bar is visible but disabled, with the tooltip "Export arrives in the next milestone".
5. **`GET /api/templates` is not built.** Pages read templates on the server and pass them to client components.
6. **Preview resolution** (Preferences: 360p / 540p / 720p, default 540p) goes to the template on a second runtime-data channel, `preview: {scale}`. The template draws its WebGL buffers at that scale (1080 p × scale/1080). Rendering always uses scale 1.
7. **Component tests:** no DOM test library is added. The form and editor logic live in pure modules with Vitest tests, and the UI is verified in the browser at each task's verification step.

## Review Focus

1. **A 60-minute or 1 GB upload, and uploads that are too big or too long.** Memory must stay flat while streaming. The limit errors appear before any analysis starts, and no half-written file is left behind. Pinned by `saveUpload stops at the byte limit and removes the partial file` (Task 1) and `rejects a song longer than 60 minutes before analyzing it` (Task 1).
2. **Seeking in a long song's preview.** The WAV must be served with correct `206` byte ranges, including open-ended (`bytes=N-`) and out-of-range requests. Pinned by the `parseRange` tests (Task 2).
3. **Path traversal through the preview route.** `..`, encoded `%2e%2e`, or absolute paths must never leave the template or song folders. Pinned by `resolvePreviewFile refuses paths outside the template` (Task 2).
4. **Rapid setting changes (dragging a slider).** Sends are throttled, the template frees old GPU objects when it rebuilds, and the newest value always wins. Pinned by the `latestThrottle` tests (Task 4) and the 200-rebuild memory check (Task 5).
5. **Switching songs while the preview is playing.** The new song loads at position 0, the settings are re-sent on `ready`, and an old upload finishing late can't replace a newer song. Pinned by `songRequestGate ignores stale responses` (Task 6).

---

### Task 1: Song upload and song info API

**Files:**
- Modify: `src/lib/songs.ts`
- Create: `src/lib/uploads.ts`, `src/app/api/songs/route.ts`, `src/app/api/songs/[id]/route.ts`
- Test: `src/lib/songs.test.ts`, `src/lib/uploads.test.ts`

**Interfaces:**
- Produces in `src/lib/songs.ts`:
  - `MAX_SONG_SECONDS = 3600`
  - `MAX_SONG_BYTES = 1024 ** 3`
  - `TOO_LONG_MESSAGE = "Songs can be up to 60 minutes long."`
  - `TOO_BIG_MESSAGE = "Songs can be up to 1 GB."`
  - `SongErrorKind` gains `"too-long" | "too-big"`
  - `probeDuration(path: string, run: RunCommand): Promise<number | null>`: runs ffprobe `format=duration`; null if it can't be read
  - `prepareSong(opts)` gains `maxSeconds?: number`. When set, it probes before converting and throws `SongError("too-long", TOO_LONG_MESSAGE)` above the limit.
  - `songInfo(storageRoot, songId): Promise<SongInfo | null>`, where `SongInfo = { songId: string; duration: number; peaks: number[] }`
  - `peaksFromAnalysis(analysis: Analysis, count = 400): number[]`: the max of the loudness `l` over each of `count` equal slices, rounded to 3 decimals
  - `songId` must match `/^[0-9a-f]{64}$/`. Anything else returns null without touching the disk.
- Produces in `src/lib/uploads.ts`:
  - `saveUpload(body: ReadableStream<Uint8Array>, dir: string, fileName: string, maxBytes: number): Promise<string>`
    - Streams to `<dir>/<uuid><ext>` and returns the path.
    - The extension comes from `fileName`, lower-cased, and must be one of `.wav .mp3 .flac .m4a`. Otherwise throw `SongError("unreadable", UNREADABLE_MESSAGE)`.
    - Over `maxBytes`: stop, delete the partial file, and throw `SongError("too-big", TOO_BIG_MESSAGE)`.
- Routes:
  - `PUT /api/songs`: body = the file; header `x-file-name` = the original name, URI-encoded.
    1. Save to `storage/uploads/`.
    2. `prepareSong({…, maxSeconds: MAX_SONG_SECONDS})`.
    3. Always delete the upload afterwards (the converted WAV is what's kept).
    4. Return `200 {songId, duration, peaks, cached}`.

    Errors are `{error: message}` with these statuses:
    - unreadable → 422
    - too-long, too-big → 413
    - too-short → 422
    - analyzer-failed → 500
  - `GET /api/songs/[id]` → `200 SongInfo`, or `404 {error: "Song not found"}`.

- [ ] **Step 1: Write the failing tests**
  - `src/lib/uploads.test.ts` (build streams with `new ReadableStream`):
    - `saveUpload writes the stream to a file with the song's extension`
    - `saveUpload stops at the byte limit and removes the partial file`: 3 chunks of 400 bytes with `maxBytes` 1000 → rejects with `TOO_BIG_MESSAGE`, and `dir` is empty
    - `saveUpload rejects other file types`: `notes.txt` → `UNREADABLE_MESSAGE`
  - `src/lib/songs.test.ts`, extending the existing fake `run`:
    - `rejects a song longer than 60 minutes before analyzing it`: ffprobe reports `3600.5` → `SongError` kind `too-long`, and the fake records no ffmpeg or analyzer call
    - `peaksFromAnalysis takes the loudest moment of each slice`: 8 frames with `l` = [0,1,0,0,0.5,0,0,0.2] and count 4 → [1, 0, 0.5, 0.2]
    - `songInfo refuses ids that are not fingerprints`: `../x` → null
    - `songInfo returns duration and peaks for a cached song`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/uploads.test.ts src/lib/songs.test.ts`. Expected: FAIL on the missing exports.
- [ ] **Step 3: Implement** the library code and both routes. Read `01-app/01-getting-started/15-route-handlers.md` and `03-api-reference/03-file-conventions/route.md` first. Stream `request.body` with `Readable.fromWeb` piped to `fs.createWriteStream`, counting bytes in a `Transform`.
- [ ] **Step 4: Run the tests, expect pass.** Then smoke-test with `npm run dev`:
  - `curl -X PUT --data-binary @storage/sample/sample-song.wav -H "x-file-name: sample.wav" http://localhost:3000/api/songs` → 200 with a 64-character `songId`, `duration` 20 and 400 `peaks`.
  - A 2-byte `.mp3` → 422 with the unreadable message.
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: upload songs to the app, with size and length limits`.

### Task 2: Serving a template preview for a song

**Files:**
- Create: `src/lib/preview.ts`, `src/app/preview/[templateId]/[songId]/[...path]/route.ts`, `src/app/api/hyperframes/[file]/route.ts`
- Test: `src/lib/preview.test.ts`

**Interfaces:**
- Consumes:
  - `setSongLength` (`src/lib/jobs.ts`)
  - `toAudioDataJs`, `isCurrentAnalysis`
  - `ensureTemplateAssets` (sample song)
  - `songInfo` (Task 1)
- Produces in `src/lib/preview.ts`:
  ```ts
  export type PreviewFile =
    | { kind: "html"; body: string }
    | { kind: "script"; body: string }
    | { kind: "file"; path: string; contentType: string };
  export const RUNTIME_URL = "/api/hyperframes/runtime.js";
  export function injectRuntime(html: string, runtimeUrl: string): string; // <script src> right after <head>
  export function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null;
  export async function resolvePreviewFile(opts: { templatesRoot: string; storageRoot: string; templateId: string; songId: string; path: string[] }): Promise<PreviewFile | null>;
  ```
- `resolvePreviewFile` rules:
  - `templateId` must be a folder in `templatesRoot` with a `template.json`.
  - `songId` is `sample` or a 64-hex fingerprint with a cached song.
  - The joined path is normalized and must stay inside the template folder. `..` segments, absolute paths, backslashes and encoded dots → `null`.
  - `index.html` → `{kind: "html"}` with `setSongLength(duration)` and `injectRuntime`.
  - `assets/song.wav` → the song's WAV (`audio/wav`).
  - `assets/audio-data.js` → `{kind: "script"}` from `toAudioDataJs(analysis)`.
  - Anything else → the template file, with a content type from its extension (`.js .json .html .jpg .png .css .woff2`).
- `sample` uses `storage/sample/sample-song.wav` through `prepareSong`, made first by `ensureTemplateAssets` if it is missing.
- `parseRange`:
  - `bytes=a-b`, `bytes=a-` and `bytes=-n`, with the end clamped to `size−1`
  - `null` when there is no header
  - `"invalid"` when the range starts past the end, or the header is malformed
- Route `/preview/[templateId]/[songId]/[...path]` → `200` / `206` (with `Content-Range` and `Accept-Ranges: bytes`) / `416` / `404`. Files are streamed, never read into memory. Add `Cache-Control: no-store` on `index.html` and `audio-data.js`.
- Route `/api/hyperframes/[file]`: `player.js` → `hyperframes-player.global.js` and `runtime.js` → `hyperframe.runtime.iife.js`, both from `node_modules/hyperframes/dist`. Anything else → 404.

- [ ] **Step 1: Write the failing tests:**
  - `injectRuntime puts the runtime script first in <head>`
  - `parseRange reads every form`: `bytes=0-99` → 0..99; `bytes=100-` (size 1000) → 100..999; `bytes=-100` → 900..999; `bytes=5000-` → `"invalid"`; `null` → `null`; `bytes=x` → `"invalid"`
  - `resolvePreviewFile serves index.html with the song length and the runtime`: a temp template plus a fake cached song of duration 12.5 → the root has `data-duration="12.500"`, and the body contains `RUNTIME_URL`
  - `resolvePreviewFile maps song.wav and audio-data.js to the song`
  - `resolvePreviewFile refuses paths outside the template`: `["..","x"]`, `["%2e%2e","x"]`, `["assets","..","..","package.json"]`, `["C:","Windows"]` → null
  - `resolvePreviewFile refuses unknown templates and song ids`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/preview.test.ts`.
- [ ] **Step 3: Implement `preview.ts` and both routes.**
- [ ] **Step 4: Run the tests, expect pass.** Then, in the browser pane with `npm run dev`:
  1. Open `http://localhost:3000/preview/particle-horizon/sample/index.html`. Expected: the template draws, and `window.__hyperframes.getVariables` exists.
  2. `curl -I -H "Range: bytes=0-99" …/assets/song.wav` → `206`, `Content-Range: bytes 0-99/…`.
  3. `curl …/preview/particle-horizon/sample/..%2F..%2Fpackage.json` → 404.
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: serve template previews for a song, with the HyperFrames runtime`.

### Task 3: The settings form model

**Files:**
- Create: `src/lib/form-model.ts`
- Test: `src/lib/form-model.test.ts`

**Interfaces:**
- Consumes: `Template`, `TemplateVariable`, `TemplateValues`, `defaultValues`, `validateValue` (`src/lib/templates.ts`).
- Produces:
  ```ts
  export type FieldModel = { variable: TemplateVariable };
  export type FormSection = { title: string; fields: FieldModel[] };
  export function contentFields(t: Template): FieldModel[];      // manifest.content order
  export function basicFields(t: Template): FieldModel[];        // manifest.basic order
  export function advancedSections(t: Template): FormSection[];  // one per group, group order
  export function parseFieldInput(v: TemplateVariable, raw: string | boolean): string | number | boolean | null; // null = not valid yet
  export function mergeValues(t: Template, saved: Record<string, unknown>): TemplateValues; // defaults ← valid saved values; unknown/invalid ignored
  ```
- `parseFieldInput`:
  - number: `Number(raw)`, clamped to min/max; `""` or NaN → null
  - color: a valid `#rgb`/`#rrggbb`, lower-cased; otherwise null
  - boolean: passed through
  - enum: must be an option
  - string: cut to `maxLength`

- [ ] **Step 1: Write the failing tests:**
  - `contentFields and basicFields follow template.json order`: the real Particle Horizon gives content `[title, artist]` and basic `[mainColor, intensity, font, showBackground, backgroundBlur, densityY, densityX]`
  - `advancedSections has one section per group, in order`: Particle Horizon's titles are `["Text","Colors","Effects","Wave","Audio"]`, and the Wave section has 6 fields
  - `parseFieldInput clamps numbers and rejects bad colours`: densityX `"500"` → 200; `""` → null; colour `"#FFF"` → `"#fff"`, `"red"` → null; enum `"9"` → null; string with maxLength 3 and `"abcdef"` → `"abc"`
  - `mergeValues keeps valid saved values and ignores the rest`: `{intensity: 1.5, mainColor: "nope", gone: 1}` → `intensity` 1.5, `mainColor` default, no `gone`
- [ ] **Step 2: Run them, expect failure.** Run: `npx vitest run src/lib/form-model.test.ts`.
- [ ] **Step 3: Implement `form-model.ts`.**
- [ ] **Step 4: Run them, expect pass.**
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: settings form model generated from template variables`.

### Task 4: Editor shell, preview player and song upload UI

**Files:**
- Create:
  - `src/app/edit/[templateId]/page.tsx`
  - `src/components/Editor.tsx`
  - `src/components/PreviewPlayer.tsx`
  - `src/components/SongCard.tsx`
  - `src/components/IconRail.tsx`
  - `src/components/hyperframes-player.d.ts`
  - `src/lib/editor-state.ts`
- Test: `src/lib/editor-state.test.ts`
- Modify: `src/app/page.tsx` (a minimal gallery: one card per template, linking to `/edit/<id>`)

**Interfaces:**
- Consumes:
  - `listTemplates`, `loadTemplate` (server)
  - form model (Task 3)
  - `PUT /api/songs`, `GET /api/songs/[id]` (Task 1)
  - preview URLs (Task 2)
- Produces in `src/lib/editor-state.ts`:
  - `previewSrc(templateId: string, songId: string | null): string` → `/preview/<t>/<songId ?? "sample">/index.html`
  - `latestThrottle<T>(send: (v: T) => void, ms: number): { push(v: T): void; flush(): void }`: sends the first value at once, then at most once per `ms`, always ending on the newest value
  - `songRequestGate(): { begin(): number; isCurrent(token: number): boolean }`: a later `begin()` makes older tokens stale
  - `formatClock(seconds: number): string` → `m:ss`, or `h:mm:ss` from 1 hour
- `page.tsx`:
  - A server component that reads `params` and the template inside `<Suspense>` (see `dynamic-routes.md` "With Cache Components").
  - An unknown id → `notFound()`.
  - Passes `{id, manifest, variables}` to the client `Editor`.
- `Editor` (client) layout, per spec §4. Tailwind, dark theme, our own name.
  - **Top bar:**
    - app name
    - editable project name, default `"<Template name> project"`
    - status text: "Ready" / "Uploading song… 42 %" / "Analyzing song…" / an error in red
    - disabled **Export** button with the tooltip "Export arrives in the next milestone"
  - **Icon rail** with labels on hover: Content ▤, Customize ☰, Preferences ⚙, Fullscreen ⛶.
  - **Side panel:** shows the chosen rail tab.
  - **Preview area**
- `PreviewPlayer`:
  - Loads `/api/hyperframes/player.js` once (a `<script>` added on first mount; it defines the custom element).
  - Renders `<hyperframes-player src={previewSrc} controls>` at 16:9, filling the area.
  - On `ready`, sends `setRuntimeData("settings", values)` and `setRuntimeData("preview", {scale})`.
  - When values change, sends through `latestThrottle(…, 100)`.
  - Exposes `onTime`, `onError`; a `playbackerror` or `error` goes to the status line.
- `SongCard` (Content tab):
  - A file picker accepting `.wav,.mp3,.flac,.m4a`.
  - The upload is an XHR `PUT` (for upload progress), guarded by `songRequestGate`.
  - On success: shows the song name, its length (`formatClock`) and a waveform drawn from `peaks` on a small canvas (no section handles; that's M5).
  - With no song: "Using the sample song. Upload yours to hear it."

- [ ] **Step 1: Write the failing tests** in `editor-state.test.ts` (use Vitest fake timers):
  - `previewSrc uses the sample song until one is chosen`
  - `latestThrottle sends at once, then at most every 100 ms, ending on the newest value`: push 1, 2, 3 within 50 ms → sends [1] at once, then [3] at 100 ms
  - `songRequestGate ignores stale responses`
  - `formatClock`: 75 → `1:15`; 3725 → `1:02:05`
- [ ] **Step 2: Run them, expect failure.**
- [ ] **Step 3: Implement** `editor-state.ts` and the components. Read `05-server-and-client-components.md` and `dynamic-routes.md` (Cache Components) first. Declare `hyperframes-player` in `hyperframes-player.d.ts` (a `JSX.IntrinsicElements` entry plus an element type with `play`, `pause`, `seek`, `currentTime`, `setRuntimeData`).
- [ ] **Step 4: Run the tests, expect pass.** Then verify in the browser pane (`npm run dev`, `http://localhost:3000`):
  1. The gallery shows Particle Horizon, and clicking it opens the editor.
  2. The sample-song preview appears and plays.
  3. Upload `storage/sample/sample-song.wav` through the picker → the status goes Uploading → Analyzing → Ready, the waveform appears, and the preview reloads with the song.
  4. Upload a renamed text file → the red error text "Couldn't read this audio file. Try WAV or MP3."

  Screenshot each state and look at it.
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: editor page with live preview player and song upload`.

### Task 5: Particle Horizon follows live settings

**Files:**
- Modify: `templates/shared/viz-toolkit.js` (+ `.d.ts`), `templates/particle-horizon/index.html`
- Test: `src/lib/viz-toolkit.test.ts`, `src/lib/templates.test.ts`

**Interfaces:**
- Produces (toolkit):
  - `declaredDefaults(json: string): Record<string, unknown>`: parses a `data-composition-variables` value, decoding `&#39; &quot; &amp;`
  - `trackGl(gl): { gl: WebGLRenderingContext; dispose(): void }`: wraps `createBuffer`, `createTexture`, `createFramebuffer`, `createProgram` and `createShader` so that `dispose()` deletes everything created through it
- Template behaviour:
  - **Settings source:** `setting(id)` reads `__hyperframes.getVariables()`, falling back to `declaredDefaults` of its own `<html>` attribute. The hand-written fallback defaults are removed.
  - **Live updates:** register runtime-data handlers when `__hyperframes.registerRuntimeDataHandler` exists.
    - `settings`: merge the values, then `rebuild()`: dispose the old GL objects, run `setup()` again, re-apply letterbox, font, title and artist text (and refit), then draw the current time.
    - `preview`: `{scale}` → canvas buffer `round(1920·scale) × round(1080·scale)`, then rebuild. Point sizes are multiplied by `scale`, so the look is the same at lower resolution.
  - **Playback:** the root timeline's `onUpdate` draws `tl.time()`. `hf-seek` still draws. Both skip if the time equals the last time drawn.
  - With no runtime-data messages (render, snapshot), behaviour is identical to now.

- [ ] **Step 1: Write the failing tests:**
  - `declaredDefaults reads every default`: a two-variable JSON with `&#39;` in a string default → `{title: "It's", intensity: 1}`
  - `trackGl deletes what it created`: a fake gl that counts creates and deletes; create 2 buffers, 1 texture and 1 program, then dispose → 4 deletes
  - In `templates.test.ts`: `Particle Horizon has no hand-written fallback defaults`. The index.html source has no `setting("` call with a second argument (regex `/setting\("[^"]+",/`).
- [ ] **Step 2: Run them, expect failure.**
- [ ] **Step 3: Implement** the toolkit helpers, then the template changes, then `npm run sync:toolkit`.
- [ ] **Step 4: Run the tests, expect pass.** Then run `npm run check:templates`. Expected: 0 errors, and reaction numbers within ±1 of the last run (quiet 18.0, loud 29.7), proving rendering didn't change.
- [ ] **Step 5: Verify in the editor (browser pane):**
  1. Playing shows smooth motion: report the frames/s measured with a `requestAnimationFrame` counter in the preview iframe.
  2. In the console, call `setRuntimeData("settings", {...values, mainColor: "#12b8ff"})` → the preview turns blue within a frame, without reloading or losing its position.
  3. 200 rapid sends (densityX 25↔200) → WebGL memory stays flat. Check with `performance.memory` and by confirming no `CONTEXT_LOST` occurs.
  4. Ask the owner to open the editor in their own Chrome and report whether playback is smooth, since the embedded pane is not a reliable benchmark (spike).
- [ ] **Step 6: Run `npm run check` and `npm run check:templates`, then commit.** Message: `feat(templates): Particle Horizon follows live settings in the preview`.

### Task 6: Content and Customize panels

**Files:**
- Create: `src/components/SettingsForm.tsx`, `src/components/FieldControl.tsx`
- Modify: `src/components/Editor.tsx`

**Interfaces:**
- Consumes: form model (Task 3), `parseFieldInput`, and the Editor's `values` / `setValue(id, value)`.
- Produces:
  - **`FieldControl`, one control per type:**
    - string: text input with a `maxLength` counter
    - number: slider plus number box, with min, max, step and unit shown
    - color: a colour swatch input plus a hex text box
    - boolean: a switch
    - enum: a select
  - **Behaviour:**
    - The variable `label` is the visible label.
    - Invalid text input keeps the last valid value and shows a red outline until fixed.
    - A "↺" button per field resets that field to its default.
  - **Content tab:** `SongCard` (Task 4), then a "Text" group of `contentFields`.
  - **Customize tab:**
    - Basic / Advanced toggle
    - Basic = `basicFields`
    - Advanced = `advancedSections` as collapsible groups, the first one open
  - Any change goes through `setValue` → Editor state → `PreviewPlayer`, which sends it live.

- [ ] **Step 1: Covered by Task 3's tests.** This task is UI only.
- [ ] **Step 2: Implement the components.**
- [ ] **Step 3: Verify in the browser pane.** Screenshot and look at each step:
  1. Content tab: typing a title updates the preview text live.
  2. Customize → Basic: React color changes the colours; Intensity; Font (all 8); Threads X/Y.
  3. Advanced: every group opens; Discoloration 100 % shows the rainbow; Movie box off removes the bars; beat range and spectrum fields change the motion.
  4. Typing `500` into Threads X clamps it to 200; a bad hex keeps the last colour with a red outline.
  5. Reset ↺ restores the default.
  6. At 1280 px wide nothing overlaps or scrolls sideways.
- [ ] **Step 4: Run `npm run check` and commit.** Message: `feat: generated Content and Customize panels with live preview`.

### Task 7: Preferences and fullscreen

**Files:**
- Create: `src/components/PreferencesPanel.tsx`
- Modify: `src/lib/editor-state.ts` (+ test), `src/components/Editor.tsx`, `src/components/PreviewPlayer.tsx`

**Interfaces:**
- Produces in `editor-state.ts`:
  - `PREVIEW_RESOLUTIONS = [{label:"360p", scale: 1/3}, {label:"540p", scale: 0.5}, {label:"720p", scale: 2/3}]`, default 540p
  - `type Preferences = {previewResolution: "360p"|"540p"|"720p"; expandedSidebar: boolean}`
  - `loadPreferences(raw: string | null): Preferences`: a bad or missing value gives the defaults
- Preferences panel:
  - preview resolution, sent as `setRuntimeData("preview", {scale})`
  - "Wide settings panel" (expanded sidebar width)

  Saved in `localStorage` (`mvz.preferences`).
- Fullscreen rail icon: `requestFullscreen()` on the preview area; Esc leaves.

- [ ] **Step 1: Write the failing test:** `loadPreferences falls back to defaults`: `null`, `"{bad"` and `{"previewResolution":"4k"}` → defaults; a valid JSON round-trips.
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.** Verify in the pane:
  - 360p is visibly softer and plays faster; report the frames/s at each resolution.
  - The preference survives a reload.
  - Fullscreen opens and closes.
- [ ] **Step 5: Run `npm run check` and commit.** Message: `feat: editor preferences (preview resolution, wide panel) and fullscreen`.

### Task 8: Docs and the owner's check

**Files:**
- Modify: `CLAUDE.md` (status, commands: none new; a line on how the preview works), `README.md` ("Open the editor" section)

- [ ] **Step 1: Update the docs.**
  - `CLAUDE.md`: M4 status, plus the preview gotchas:
    - runtime injected by the preview route
    - live settings over the `settings` / `preview` runtime-data channels
    - templates redraw on timeline `onUpdate`
  - `README.md`: how to open the editor.
- [ ] **Step 2: Owner check.**
  - Send a phone-sized screenshot of the editor with T-REX loaded.
  - Ask the owner to open `http://localhost:3000` in their Chrome and try:
    - upload a song
    - play it
    - change the colour, intensity and title while it plays
    - switch the preview resolution
  - Ask whether playback is smooth enough, and whether the layout feels like their Videobolt editor.
- [ ] **Step 3: Run `npm run check` and `npm run check:templates`, then commit.** Message: `docs: milestone 4 editor and preview`.

Milestone 4 is done (spec §13) when the owner has uploaded a song, seen and heard the preview, and changed fields live in their own browser.
