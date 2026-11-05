# Nova Streak and the image setting: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general `image` setting type (upload, storage, preview, export) and the Nova Streak
template (starfield, light streak, mirrored bars, cover with crackling electric border).

**Architecture:** The image type is a new member of the `TemplateVariable` union. Its value is
an image id everywhere in the app; only at the edges does it become a picture location:
- the editor turns it into `/api/images/<id>/square.jpg` for the live preview
- the job builder turns it into `assets/images/<settingId>.jpg` for a render

Nova Streak is a WebGL template built like Particle Horizon (toolkit programs, 8-bit blur for
glow). Its music maths lives in a pure, Node-loadable `streak-motion.js`, like Iron Wraith's
`wraith-motion.js`.

**Tech Stack:** Next.js App Router, TypeScript strict, Vitest, HyperFrames 0.9.10, WebGL 1 with
`templates/shared/viz-toolkit.js`, FFmpeg.

**Spec:** `docs/superpowers/specs/2026-11-06-m6-nova-streak-design.md`

## Global Constraints

- HyperFrames stays pinned at **0.9.10**. There are no new npm dependencies.
- **Template rules (CLAUDE.md, spec §6 of the main spec):**
  - Draw only from the `hf-seek` time or the timeline's `onUpdate`.
  - No `Math.random()`, `Date.now()` or timers. Use the toolkit's seeded `mulberry32`.
  - WebGL render targets are 8-bit only. Check shader compile *and* link status.
  - Twinkle and grain change at most 6×/s.
  - Song-length elements carry `data-song-length`.
  - `npx hyperframes check` must pass, and `npm run check:templates` must pass before a template
    commit.
  - The template must look identical without the `settings`/`preview` runtime data.
  - Don't measure the DOM inside `onUpdate`.
- **Never commit:** `storage/`, `test-renders/`, audio, video, or any song-derived data. Test
  covers are generated (FFmpeg) or come from outside the repo, and are never committed.
- Code the browser imports (`template-values.ts`, `form-model.ts`, `editor-state.ts`, components)
  must not import `node:` modules.
- Exact copy:
  - missing image: `This image is no longer available: please upload it again.`
  - unknown fit: `Unknown image fit.`
- Image ids match `/^[0-9a-f]{64}$/`. The only fit is `"square"`: 1024×1024, cover-cropped from
  the centre, transparent parts on black, JPEG `-q:v 2`.
- Toolkit edits are made in `templates/shared/viz-toolkit.js`, then `npm run sync:toolkit`.
- Run `npm run check` before every commit. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Don't put `.js` scratch files inside the repo tree (ESLint picks them up). Use the session
  scratchpad.

## Corrections to the spec (rulings made while planning)

- **Upload method.** Spec §4.2 says `POST /api/images` multipart, "mirroring" the backgrounds
  route. The real backgrounds route is `PUT` with the raw file as the body and its name in
  `x-file-name`. Mirror the real route: `PUT /api/images?fit=square`, replying `{ id }`.
  - **Why:** one upload style across the app, and the existing streaming size limit is reused.
  - **Cost if wrong:** a few lines in one route and one component.
- **Where declaration checks live.** Spec §4.1 puts "non-empty default / unknown fit" in
  `validateTemplate`. Every other declaration rule lives in `parseVariables` (`checkDeclaration`),
  so these do too. They fail loading the template, which is stricter.
- **Section song time.** Spec §6 seeds each arc burst by "the beat's time", and §9 requires "a
  section start matches the full song". A section's analysis only knows times relative to the
  section, so `sliceAnalysis` now records `sectionStart` and the toolkit's `createAudio` exposes
  it as `songStart` (Task 6).
- **No route test files exist today.** The route logic goes into `src/lib/images.ts` as two
  functions that take a `Request` and return a `Response`, tested directly. The route files are
  thin wrappers around them.

## Review Focus

1. **A portrait, tiny or transparent picture as a cover:** it must come out 1024×1024,
   centre-cropped, not stretched, with transparency on black. (Task 3 adds a 200×600 transparent
   PNG test.)
2. **A cover whose file is missing or corrupt when the render starts** (deleted after the export
   check): the render must finish without the cover and with no error box, never hang. (The
   Task 1 spike records this; the Task 8 template handles `onerror`.)
3. **HyperFrames handing the template an image variable as `{url}` instead of a string:** the
   template must read both. (The Task 1 spike records which; Task 8's `setting("cover")` accepts
   both.)
4. **The preview at 360p/540p** (`preview` channel `scale`): cover size, bar widths, arc jitter
   and the streak core must scale with `PREVIEW_SCALE`. Iron Wraith shipped one unscaled
   thickness floor. (Task 8 step: compare a 360p preview frame with a render frame.)
5. **An unknown `fit` in the upload URL, or a malformed id or file name in the image URL:** these
   must give 400/404, never a path built from the input. (Task 3 tests.)

---

### Task 1: Spike: HyperFrames renders a picture from an image variable (throwaway, no commit)

Proves spec risk 1 before anything depends on it. HyperFrames 0.9.10's own variable checker
already knows a type `"image"` and accepts a string or `{url}` value (seen in
`node_modules/hyperframes/dist`). The spike confirms four things:
- our extra `fit` key passes `check`
- a relative path renders on frame 0
- what `getVariables()` returns
- what a missing file does

**Files:** only in the session scratchpad: `<scratchpad>/spike-image/`. Nothing in the repo.

- [ ] **Step 1: Build a minimal project.** Run `npx hyperframes init <scratchpad>/spike-image`,
  then replace `index.html` with:
  - a 1920×1080 root lasting 5 s
  - `data-composition-variables='[{"id":"cover","type":"image","label":"Cover","default":"","fit":"square"}]'`
  - a `<canvas>` and an `<img id="cover">`

  In a script:
  - read `getVariables().cover`, and set `img.src` synchronously at startup if it is a non-empty
    string (or `.url` of an object)
  - on each `hf-seek`, draw the image at 360×360 in the centre of a 2D canvas once it is
    `complete`
  - draw a 40 px marker in the top-left: green if the value was a string, red if an object,
    grey if empty

  Make `assets/images/cover.jpg` with
  `ffmpeg -f lavfi -i testsrc2=s=1024x1024 -frames:v 1 assets/images/cover.jpg`.
- [ ] **Step 2: Check passes with the declaration.**
  Run: `npx hyperframes check <scratchpad>/spike-image --json`
  Expected: no errors. A warning about `fit` is acceptable; ledger it.
- [ ] **Step 3: Render with the picture.** Write `vars.json` = `{"cover":"assets/images/cover.jpg"}`.
  Run: `npx hyperframes render <dir> --variables-file vars.json --strict-variables --quality draft -o with.mp4`.
  Then extract frame 0 and the frame at 4 s (`ffmpeg -ss 0 -i with.mp4 -frames:v 1 f0.png`).
  Expected: the test pattern is visible in the centre of frame 0, and the marker is green or red.
- [ ] **Step 4: Render with a missing file.** Use `{"cover":"assets/images/missing.jpg"}`.
  Expected: the render completes within its normal time and frame 0 has no picture.
- [ ] **Step 5: Ledger the outcome.**
  - One line each: check result, frame-0 result, value shape (string/object), missing-file
    behaviour.
  - **If check rejects the declaration or frame 0 is empty:** stop. Rule on a fallback (for
    example, a preload `<link rel="preload" as="image">`, or waiting on `decode()` inside a
    `data-start=0` setup) and ledger it before Task 8.
  - Delete nothing in the repo; there is nothing there.

### Task 2: The image setting contract

**Files:**
- Modify: `src/lib/template-values.ts`, `src/lib/templates.ts` (`TYPES`, `checkDeclaration`,
  `parseOverride`), `src/lib/form-model.ts` (`parseFieldInput`), `src/components/FieldControl.tsx`
  (image renders nothing there)
- Test: `src/lib/templates.test.ts`

**Interfaces:**
- Produces, in `template-values.ts` (browser-safe):
  - `export type ImageFit = "square"`, `export const IMAGE_FITS: readonly ImageFit[] = ["square"]`
  - `export const IMAGE_ID = /^[0-9a-f]{64}$/`
  - union member `(VariableBase & { type: "image"; default: ""; fit: ImageFit })`
  - `export type ImageVariable = Extract<TemplateVariable, { type: "image" }>`
  - `export function imagePreviewUrl(id: string, fit: ImageFit): string`:
    `""` → `""`, otherwise `/api/images/${id}/${fit}.jpg`
- Produces: `validateValue` image case: `""` or an `IMAGE_ID` match is valid. Anything else gives
  `"must be an uploaded image"`.

- [ ] **Step 1: Write the failing tests** in `src/lib/templates.test.ts`, `describe("image settings")`:

```ts
const ID = "a".repeat(64);
const image = { id: "cover", type: "image", label: "Cover art", default: "", fit: "square" };
const html = (vars: unknown[]) => `<html data-composition-variables='${JSON.stringify(vars)}'>`;

it("parseVariables accepts a square image setting", () => {
  expect(parseVariables(html([image]))).toEqual([image]);
});
it("an image's default must be empty", () => {
  expect(() => parseVariables(html([{ ...image, default: ID }]))).toThrow(/default must be ""/);
});
it("an image needs a known fit", () => {
  expect(() => parseVariables(html([{ ...image, fit: "round" }]))).toThrow(/unknown image fit "round"/);
  expect(() => parseVariables(html([{ ...image, fit: undefined }]))).toThrow(/unknown image fit/);
});
it("validateValue takes empty or a 64-hex id, nothing else", () => {
  const v = parseVariables(html([image]))[0];
  expect(validateValue(v, "")).toBeNull();
  expect(validateValue(v, ID)).toBeNull();
  for (const bad of [ID.toUpperCase(), "a".repeat(63), `../${ID}`, "/api/images/x/square.jpg",
    "https://x.test/a.jpg", "C:\\a.jpg", 5, null]) {
    expect(validateValue(v, bad)).toBe("must be an uploaded image");
  }
});
it("imagePreviewUrl maps an id to the image route and empty to empty", () => {
  expect(imagePreviewUrl(ID, "square")).toBe(`/api/images/${ID}/square.jpg`);
  expect(imagePreviewUrl("", "square")).toBe("");
});
```

- [ ] **Step 2: Run them.** Run: `npx vitest run src/lib/templates.test.ts`
  Expected: FAIL. The new tests fail with `unknown type "image"` and `imagePreviewUrl` not
  exported.
- [ ] **Step 3: Implement.**
  - Add `"image"` to `TYPES`.
  - In `checkDeclaration`, for an image:
    - a missing or unknown fit throws `unknown image fit "<fit>" (use square)`
    - a default other than `""` throws `an image's default must be ""`
  - `parseOverride` returns the text unchanged for an image.
  - `parseFieldInput` returns the raw string if `validateValue` accepts it, else `null`.
  - `FieldControl` returns `null` for an image.
- [ ] **Step 4: Run.** Run: `npx vitest run src/lib/templates.test.ts`, then `npm run check`.
  Expected: PASS, and the type check is clean (every `switch` on `v.type` handles `"image"`).
- [ ] **Step 5: Commit:** `feat: image setting type in the template contract`

### Task 3: Image storage, conversion and the two routes

**Files:**
- Create: `src/lib/images.ts`, `src/lib/images.test.ts`, `src/app/api/images/route.ts`,
  `src/app/api/images/[id]/[file]/route.ts`

**Interfaces:**
- Consumes: `ImageFit`, `IMAGE_FITS`, `IMAGE_ID` (Task 2). `MAX_IMAGE_BYTES`,
  `TOO_BIG_IMAGE_MESSAGE`, `IMAGE_EXTENSIONS` are imported from `backgrounds.ts`, not copied.
  `UNREADABLE_IMAGE_MESSAGE`/`JobError` come from `jobs.ts`; `saveUpload` from `uploads.ts`;
  `songIdFor` from `songs.ts`.
- Produces, in `src/lib/images.ts`:
  - `export const IMAGE_MISSING_MESSAGE = "This image is no longer available: please upload it again."`
  - `export function imageArgs(input: string, output: string, fit: ImageFit): string[]`
  - `export function imagePath(storageRoot: string, id: string, fit: ImageFit): string`, giving
    `<storageRoot>/images/<id>-<fit>.jpg`
  - `export async function saveImage(source: string, storageRoot: string, run: RunCommand, fit: ImageFit): Promise<string>`:
    the same once-only, temp-then-rename flow as `saveBackground`, and the same unreadable error
  - `export async function uploadImageResponse(request: Request, storageRoot: string, run: RunCommand): Promise<Response>`.
    Statuses, in order:
    - an unknown or missing `fit` query gives 400 `{error:"Unknown image fit."}`
    - then the backgrounds route's statuses: 413 for too big, 422 for no body, a wrong type or an
      unreadable file, and 500 otherwise
    - success gives 200 `{ id }`
  - `export async function imageFileResponse(storageRoot: string, id: string, file: string): Promise<Response>`:
    - 400 if `id` doesn't match `IMAGE_ID`
    - 404 if `file` isn't `<known fit>.jpg` or the stored file is missing
    - otherwise 200, `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`
      (the URL is a fingerprint, so its content never changes)

- [ ] **Step 1: Write the failing tests** (`src/lib/images.test.ts`), using real FFmpeg like
  `backgrounds.test.ts`, each in a `mkdtemp` storage root:

```ts
it("imageArgs covers 1024×1024 on black, one JPEG at q 2", () => {
  const a = imageArgs("in.png", "out.jpg", "square").join(" ");
  expect(a).toContain("color=black:s=1024x1024");
  expect(a).toContain("scale=1024:1024:force_original_aspect_ratio=increase,crop=1024:1024");
  expect(a).toContain("-frames:v 1 -q:v 2 out.jpg");
});
it("saveImage turns a 300×200 PNG into a 1024×1024 JPEG at imagePath", async () => { /* ffprobe width/height = 1024 */ });
it("saveImage squares a 200×600 transparent PNG without stretching", async () => { /* make with color=red@0.0:s=200x600,format=rgba; result 1024×1024; centre pixel black */ });
it("saveImage converts once and reuses the stored image", async () => { /* second call: run not called */ });
it("saveImage reports an unreadable image", async () => { /* rejects with UNREADABLE_IMAGE_MESSAGE */ });
it("upload: a good PNG returns an id", async () => { /* PUT ?fit=square, x-file-name a.png → 200, id matches IMAGE_ID */ });
it("upload: unknown fit is 400", async () => { /* ?fit=round and no fit → 400 "Unknown image fit." */ });
it("upload: too big, wrong type and unreadable give the shared messages", async () => {
  /* content-length > MAX → 413 TOO_BIG_IMAGE_MESSAGE; a.txt → 422 UNREADABLE; garbage .png → 422 UNREADABLE */
});
it("serve: 200 image/jpeg for a stored image", async () => {});
it("serve: 400 for a malformed id, 404 for unknown id, unknown fit or other file names", async () => {
  /* ids: "../x", "A".repeat(64); files: "round.jpg", "square.png", "..", "square.jpg/x" */
});
```

- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/images.test.ts`
  Expected: FAIL, `Cannot find module '@/lib/images'`.
- [ ] **Step 3: Implement `src/lib/images.ts` and the two route wrappers.**
  - `route.ts` exports `PUT`, calling `uploadImageResponse(request, path.join(process.cwd(), "storage"), runCommand)`.
  - `[id]/[file]/route.ts` exports `GET`, awaiting `params` and calling `imageFileResponse`.
  - Read the file with `readFile`: covers are small, so there is no range support.
- [ ] **Step 4: Run.** Run: `npx vitest run src/lib/images.test.ts`, then `npm run check`.
  Expected: PASS.
- [ ] **Step 5: Commit:** `feat: image uploads, square conversion and the image route`

### Task 4: Images in exports (job builder, export check, render script)

**Files:**
- Modify: `src/lib/jobs.ts`, `src/lib/exports/manager.ts` (`validate`),
  `src/lib/exports/run-export.ts`, `src/lib/render-args.ts`, `scripts/render.ts`
- Test: `src/lib/jobs.test.ts`, `src/lib/exports/manager.test.ts`, `src/lib/render-args.test.ts`

**Interfaces:**
- Consumes: `imagePath`, `IMAGE_MISSING_MESSAGE`, `saveImage` (Task 3); `ImageVariable` (Task 2).
- Produces:
  - `PrepareJobOptions.storageRoot?: string`, where image files are found.
  - `export async function placeImages(variables: TemplateVariable[], values: TemplateValues, storageRoot: string | undefined, jobDir: string): Promise<TemplateValues>`
    in `jobs.ts`.
    - For each image variable with a non-empty value, it copies `imagePath(storageRoot, id, fit)`
      to `<jobDir>/assets/images/<settingId>.jpg` and returns a copy of `values` with that
      setting set to `assets/images/<settingId>.jpg`.
    - It throws `JobError(IMAGE_MISSING_MESSAGE)` if the file is missing, or if `storageRoot` is
      undefined while an image value is set.
  - `prepareJob` calls `placeImages` after `validateValues` (ids are validated, paths aren't) and
    uses its result for **both** `withVariableDefaults` and `variables.json`.
  - `RenderArgs.images: Record<string, string>` (setting id → file), from repeatable
    `--image <id>=<file>`. Usage line: `--image <id>=<file>  a picture for an image setting, e.g. --image cover=art.png`.

- [ ] **Step 1: Write the failing tests.**
  - `jobs.test.ts` `describe("images in a job")`. Use a fixture template whose variables include
    `cover` (image, square); this is a small extension of the existing fixture.
    - `it("copies an image to assets/images/<id>.jpg and puts that path in the variables")`: the
      job's `variables.json` has `cover: "assets/images/cover.jpg"`, the file exists with the
      same bytes, and the `index.html` default for `cover` is the same path.
    - `it("leaves an empty image empty")`: `cover: ""` stays `""` and there is no `assets/images` folder.
    - `it("stops with the missing-image message")`: an unknown id rejects with
      `IMAGE_MISSING_MESSAGE`.
  - `manager.test.ts`: `it("rejects an export whose image file is gone")`. `start()` with
    `values: { cover: "b".repeat(64) }` rejects with `ExportInvalid` and `IMAGE_MISSING_MESSAGE`.
    The fixture template gains the image variable.
  - `render-args.test.ts`: `parseRenderArgs(["nova-streak","s.wav","--image","cover=C:\\art\\a.png"]).images`
    equals `{ cover: "C:\\art\\a.png" }`. `--image novalue` throws `/Usage/`.
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/jobs.test.ts src/lib/exports/manager.test.ts src/lib/render-args.test.ts`
  Expected: FAIL. `placeImages` is missing, the missing-file export is accepted, and `images` is
  undefined.
- [ ] **Step 3: Implement.**
  - `manager.validate`: after `validateValues`, for each image variable with a non-empty value,
    if `imagePath(storage, value, fit)` doesn't exist, throw `ExportInvalid(IMAGE_MISSING_MESSAGE)`.
  - `runExport` passes `storageRoot: storage`.
  - `scripts/render.ts` does three things:
    - for each `--image id=file`, it checks that `id` is an image setting (else
      `--image <id>: not an image setting`)
    - it saves the file with `saveImage(file, storageRoot, runCommand, fit)` and puts the
      returned id into `overrides` before `resolveValues`
    - it passes `storageRoot` to `prepareJob`
- [ ] **Step 4: Run.** Run the same command, then `npm run check`.
  Expected: PASS.
- [ ] **Step 5: Commit:** `feat: exports and dev renders carry image settings`

### Task 5: Editor: the image card and preview locations

**Files:**
- Create: `src/components/ImageCard.tsx`
- Modify: `src/lib/form-model.ts`, `src/lib/editor-state.ts`, `src/components/Editor.tsx`,
  `src/components/PreviewPlayer.tsx` (it takes a `toPreview` mapping or already-mapped values)
- Test: `src/lib/form-model.test.ts`, `src/lib/editor-state.test.ts`

**Interfaces:**
- Consumes: `ImageVariable`, `imagePreviewUrl` (Task 2); `PUT /api/images?fit=<fit>` returning
  `{ id }` (Task 3).
- Produces:
  - `form-model.ts`: `export function imageFields(t: FormTemplate): ImageVariable[]`, in
    declaration order.
    - `contentFields`, `basicFields` and `advancedSections` leave out image variables.
    - `advancedSections` drops a section left with no fields.
  - `editor-state.ts`: `export function previewValues(variables: TemplateVariable[], values: TemplateValues): TemplateValues`.
    Each image value becomes `imagePreviewUrl(value, fit)`; everything else is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `form-model.test.ts`, with a fixture whose variables are `title`, `artist`, `cover` (image),
    `mainColor`; groups Text[title, artist], Images[cover], Colors[mainColor];
    content [title, artist, cover]; basic [mainColor, cover]:
    - `imageFields(t).map(v => v.id)` equals `["cover"]`
    - `contentFields` ids equal `["title","artist"]`
    - `basicFields` ids equal `["mainColor"]`
    - `advancedSections` titles equal `["Text","Colors"]`
  - `editor-state.test.ts`: `previewValues(vars, { title: "T", cover: ID })` equals
    `{ title: "T", cover: "/api/images/<ID>/square.jpg" }`, and `cover: ""` stays `""`.
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/form-model.test.ts src/lib/editor-state.test.ts`
  Expected: FAIL, `imageFields`/`previewValues` not exported.
- [ ] **Step 3: Implement the helpers, then the UI.**
  - **`ImageCard`** (`{ variable, value, onChange, onStatus }`) follows `BackgroundCard`'s look
    and upload code:
    - the label as its heading
    - a square thumbnail from `imagePreviewUrl`, or the text "No image"
    - an **Upload** file input (`.jpg,.jpeg,.png,.webp`)
    - a **Remove** button (sets `""`)
    - the footnote `JPG, PNG or WebP · up to 50 MB · cropped to a square`
    - status messages "Preparing the image…" and "Ready", and the server's error otherwise
  - **`Editor`** renders one `ImageCard` per `imageFields(template)` between `ContentFields` and
    `BackgroundCard`, with `onChange={(id) => setValue(variable.id, id)}`.
  - **`PreviewPlayer`** sends `previewValues(variables, values)` on the `settings` channel, both
    on ready and in the throttle. Pass `template.variables` in from `Editor`.
  - **`ExportPanel`** is unchanged: it sends ids.
- [ ] **Step 4: Run.** Run the same command, then `npm run check` and `npm run build`.
  Expected: PASS, and the build compiles.
- [ ] **Step 5: Commit:** `feat: editor image card; preview gets picture locations`

### Task 6: Song time inside a section

**Files:**
- Modify: `src/lib/analysis.ts` (`Analysis.sectionStart?: number`, doc: "for a section of a song:
  where it starts in the whole song, seconds"), `src/lib/jobs.ts` (`sliceAnalysis`),
  `templates/shared/viz-toolkit.js` (`createAudio` result gains `songStart`), then
  `npm run sync:toolkit`
- Test: `src/lib/jobs.test.ts`, `src/lib/viz-toolkit.test.ts`

**Interfaces:**
- Produces:
  - `sliceAnalysis(full, start, end).sectionStart === round(start)`.
  - `createAudio(data).songStart` is `data.sectionStart || 0`, so the song time is
    `t + audio.songStart`.

- [ ] **Step 1: Write the failing tests.**
  - In `jobs.test.ts` `describe("sliceAnalysis")`: `expect(sliceAnalysis(full, 7, 9).sectionStart).toBe(7)`.
  - In `viz-toolkit.test.ts`: `createAudio({...data, sectionStart: 12}).songStart` is `12`, and
    without it, `0`.
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/jobs.test.ts src/lib/viz-toolkit.test.ts`
  Expected: FAIL (`undefined`).
- [ ] **Step 3: Implement**, then run `npm run sync:toolkit`.
- [ ] **Step 4: Run.** Run the same command, then `npm run check` and `npm run check:templates`.
  Expected: PASS. The existing templates are unaffected and their toolkit copies are identical.
- [ ] **Step 5: Commit:** `feat: sections know their song time (toolkit songStart)`

### Task 7: Nova Streak's motion maths

**Files:**
- Create: `templates/nova-streak/assets/streak-motion.js` (UMD like `wraith-motion.js`:
  `module.exports`, else `window.StreakMotion`), `src/lib/nova-streak-motion.test.ts`

**Interfaces:**
- Consumes: a toolkit `createAudio` result (`sample`, `spectrum`, `recentHits`, `offset`,
  `songStart` from Task 6); the toolkit's `mulberry32`, passed in (the module never makes its own
  random numbers).
- Produces (all pure). Units are 1080p pixels, distances from the frame centre:
  - `streakLevel(loud, intensity)`: `min(1, 0.55 + 0.45·loud·intensity)`
  - `bandsToCount(pct)`: `round(16 + (pct − 10)/90 · 80)` (10 → 16, 100 → 96)
  - `barHeights(values, intensity)`: a `Float32Array` of `min(300, v·260·intensity)`; index 0 is
    bass, nearest the centre
  - `barLayout(count, hasCover)`: `{ inner, outer, width, centres: Float32Array }`
    - `inner = hasCover ? 200 : 0` (cover half 180 + a 20 px gap)
    - `outer = 921.6` (96 % of the half-width)
    - `width = (outer − inner)/count`
    - `centres[i] = inner + (i + 0.5)·width`
    - the template mirrors the centres to ±x
  - `coverEnvelope(audio, t)`: Iron Wraith's `jawEnvelope` maths (look-back 12 samples at 1/60 s,
    release 0.18 s, clamped 0..1)
  - `coverScale(env, intensity)`: `1 + 0.06·env·intensity`
  - `arcBursts(audio, t, half, glow, mulberry32)`: returns `[{ alpha, points: Float32Array }]`
    with points as x,y pairs around (0,0); defined below
  - `starTwinkle(audio, t)`: `1 + 0.15·max(strength·(1 − age/0.5))` over hits younger than 0.5 s,
    evaluated at `tq = floor(t·6)/6` (at most 6 changes per second)
  - `buildStars(density)`: a `Float32Array` of `[x, y, depth, size, brightness]` per star
    - `n = round(900·density/100)`, from `mulberry32(11)`
    - x in [0,1920), y in [0,1080), depth in [0.2,1], size 1–2.5 px, brightness 0.3–1
  - `starX(x0, depth, songTime)`: `((x0 − 6·depth·songTime) mod 1920 + 1920) mod 1920`

**`arcBursts` algorithm** (the signatures and tests don't determine it):

```
hits = audio.recentHits(t, 4) keeping age < 0.3
for each [age, strength]:
  hitSong = audio.songStart + t - age          // the beat's time in the whole song
  rand = mulberry32(Math.round(hitSong * 1000))
  arcs = 3 + floor(rand() * 4)                 // 3..6
  per arc: s0 = rand() * P (P = 8·half, perimeter); len = (0.08 + 0.17·rand()) · P
           n = 8 + floor(rand() * 7)            // 8..14 points
           point k: s = s0 + len·k/(n−1); (x, y, nx, ny) = border point and outward normal at s
                    j = k==0 || k==n−1 ? 0 : (2·rand() − 1) · 14
                    push x + nx·j, y + ny·j
           alpha = (1 − age/0.3) · glow/100
```

The border is walked clockwise from the top-left corner. The rand draws per arc come in a fixed
order (s0, len, n, then one jitter per inner point), so the shape is fully determined by the hit.

- [ ] **Step 1: Write the failing tests** (`src/lib/nova-streak-motion.test.ts`). Build a fake
  `audio` from a tiny analysis through the real toolkit `createAudio` (as
  `iron-wraith-motion.test.ts` does), with a hit at 2.0 s:
  - `it("streakLevel rests at 0.55 in silence and caps at 1")`:
    - `streakLevel(0, 1) === 0.55`
    - `streakLevel(1, 2) === 1`
    - `streakLevel(0.5, 1)` is close to 0.775
  - `it("bandsToCount maps 10→16 and 100→96")`
  - `it("barHeights scale by intensity and cap at 300")`: `[0, 0.5, 1]` at intensity 1 gives
    `[0, 130, 260]`; at intensity 2, `[0, 260, 300]`
  - `it("barLayout starts at the cover's edge or the centre and ends at 921.6")`:
    - `barLayout(96, true)`: `inner === 200`, last centre + width/2 is close to 921.6
    - `barLayout(16, false).inner === 0`
  - `it("coverScale is 1 in silence and 1.06 at a full beat")`
  - `it("arcs are the same for the same time")`:
    `arcBursts(a, 2.1, 180, 70, mulberry32)` deep-equals a second call
  - `it("a burst has 3–6 arcs of 8–14 points within 14 px of the border")`
  - `it("arcs fade to nothing 0.3 s after the beat")`:
    - at t = 2.0, `alpha` is close to 0.7
    - at t = 2.15, close to 0.35
    - at t = 2.31, `[]`
  - `it("a section start draws the same arcs as the full song")`:
    - make the section with `sliceAnalysis(full, 1.5, 3)` plus `createAudio`
    - `arcBursts(section, 0.6, …)` deep-equals `arcBursts(full, 2.1, …)`
  - `it("silence gives the base streak, no arcs, no NaN")`:
    - all-zero frames, no hits
    - over t in [0, 5] step 0.1, `streakLevel` is 0.55, `arcBursts` is `[]`, `starTwinkle` is 1,
      and `barHeights` are all finite zeros
  - `it("star twinkle changes at most 6 times a second")`: values at t and t + 0.1 inside the
    same 1/6 s step are equal
  - `it("buildStars makes 900 stars at 100 % and none at 0 %, the same every time")`
  - `it("starX drifts 6 px/s for the nearest stars and wraps")`:
    - `starX(10, 1, 1) === 4`
    - `starX(2, 1, 1)` is close to 1916
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/nova-streak-motion.test.ts`
  Expected: FAIL, cannot find `streak-motion.js`.
- [ ] **Step 3: Implement `streak-motion.js`.**
- [ ] **Step 4: Run.** Run the same command, then `npm run check`.
  Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Nova Streak motion maths`

### Task 8: The Nova Streak template

**Files:**
- Create in `templates/nova-streak/`:
  - `index.html`
  - `template.json`
  - `hyperframes.json` (copy Iron Wraith's)
  - `assets/background.jpg` (copy Particle Horizon's; used only when `showBackground` is on
    without an upload)
  - `assets/viz-toolkit.js` (via `npm run sync:toolkit`)
- Create: `src/lib/nova-streak.test.ts`
- Modify: `src/lib/repo-hygiene.test.ts` (add the template's generated `assets/audio-data.js`
  and `assets/song.wav` to its never-committed list); run `npm run template:assets`

**Interfaces:**
- Consumes: `StreakMotion` (Task 7), the toolkit (`createAudio` with `songStart`, `mulberry32`,
  `hexToRGB`, `createProgram`, `createTarget`, `blur`, `showError`, `trackGl`, `declaredDefaults`).
- Produces: a template the app lists, previews and exports with the spec §7 settings and §8
  presets.

**Settings (`data-composition-variables`, in this order):**

| id | declaration |
|---|---|
| `title` | string, `"SONG NAME"`, maxLength 60 |
| `artist` | string, `"ARTIST NAME"`, maxLength 60 |
| `font` | enum `"Montserrat"`, Particle Horizon's eight options verbatim |
| `cover` | image, `""`, fit `"square"`, label "Cover art" |
| `mainColor` | color `#ff2fb3`, label "Main color" |
| `accentColor` | color `#8a3cff`, label "Accent color" |
| `intensity` | number 1, 0.2–2, step 0.1 |
| `borderGlow` | number 70, 0–100, step 1, unit % |
| `starDensity` | number 100, 0–200, step 1, unit % |
| `showBackground` | boolean false |
| `backgroundBlur` | number 60, 0–100, step 1, unit % |
| `beatRange` | enum `"kick"`, Particle Horizon's options verbatim |
| `spectrumLow` | number 30, 30–16000, step 10, Hz |
| `spectrumHigh` | number 1000, 30–16000, step 10, Hz |
| `spectrumBoost` | enum `"2"`, options 1/2/4/8 labelled 1×/2×/4×/8× |
| `bandCount` | number 100, 10–100, step 1, unit % |

**`template.json`:**
- name `Nova Streak`
- description `A light streak with mirrored spectrum bars, your cover art crackling with electricity at the centre.`
- groups:
  - Text [title, artist, font]
  - Images [cover]
  - Colors [mainColor, accentColor]
  - Effects [intensity, borderGlow, starDensity, showBackground, backgroundBlur]
  - Audio [beatRange, spectrumLow, spectrumHigh, spectrumBoost, bandCount]
- basic [mainColor, accentColor, intensity, borderGlow, font, showBackground]
- content [title, artist, cover]
- presets:

| Preset | mainColor | accentColor | thumbnail |
|---|---|---|---|
| Original | `#ff2fb3` | `#8a3cff` | `presets/original.jpg` |
| Red Orange | `#ff2a2a` | `#ff9a1f` | `presets/red-orange.jpg` |
| Blue Green | `#2f7bff` | `#19e0c0` | `presets/blue-green.jpg` |
| Purple Pink | `#9b4dff` | `#ff5fd2` | `presets/purple-pink.jpg` |

**Drawing** follows Particle Horizon's structure: one WebGL canvas `#viz`, built once, with
`apply()` on settings and `resize()` on the preview scale. Layers, back to front:
1. **Background.** Either the starfield (POINTS from `buildStars`, x from `starX`, brightness ×
   `starTwinkle`, plus a soft haze of the two colours at about 12 % opacity), or the uploaded
   background, blurred exactly as in Particle Horizon's `loadBackground`.
2. **The bright layer,** drawn into a half-size 8-bit target, blurred twice at half and quarter
   size like Particle Horizon (this is the glow):
   - the streak, a 3 px core with a wide falloff to the frame edges, at `streakLevel`
   - the bars, up and down from y = 540, coloured from mainColor at `inner` to accentColor at
     `outer`
   - the cover border, 3 px, mainColor
   - the arcs, 2 px quads along each polyline, mainColor lightened toward white, × alpha
3. **The sharp layer** on top: the same streak, bars, border and arcs unblurred, then the cover
   picture as a textured quad of `360·coverScale` at the centre, then the composite.

The cover:
- `setting("cover")` returns a string or `obj.url`, according to the Task 1 ruling.
- A non-empty value sets `coverImg.src` synchronously at startup, so the page's load waits for it.
- `onload` uploads the texture and redraws; `onerror` leaves `hasCover` false and the render
  continues.
- A new value on the `settings` channel swaps the `src`, and `""` hides the cover and moves the
  bars to the centre.

The title:
- `#titleLine` reads "ARTIST – SONG" in capitals, letter-spaced, top 760 px, centred
- it is fitted with Iron Wraith's `fitTitles` (measured on settings and font loads only)

Scale every pixel size by `PREVIEW_SCALE`.

- [ ] **Step 1: Write the failing test** `src/lib/nova-streak.test.ts`, shaped like
  `iron-wraith.test.ts`:
  - `validateTemplate(t)` is `[]`
  - variable ids in the table's order
  - defaults exactly as in the table
  - `cover` is `{type:"image", fit:"square", default:""}`
  - `basic`/`content` as above
  - the presets' names and colours as above
  - `index.html` loads `assets/streak-motion.js` and `assets/viz-toolkit.js`, contains no
    `Math.random`/`Date.now`/`setTimeout`/`setInterval`, and sets
    `type: gl.UNSIGNED_BYTE` targets only (no `HALF_FLOAT`)
- [ ] **Step 2: Run.** Run: `npx vitest run src/lib/nova-streak.test.ts`
  Expected: FAIL, the template folder doesn't exist.
- [ ] **Step 3: Build the template.** Run `npm run sync:toolkit`, then `npm run template:assets`.
- [ ] **Step 4: Check the template.** Run: `npx vitest run src/lib/nova-streak.test.ts`, then
  `npm run check:templates`.
  Expected: Nova Streak passes the settings rules, `hyperframes check` and the quiet-vs-loud
  difference. If the difference is under the threshold, raise the reaction (bar height, streak),
  never lower the check.
- [ ] **Step 5: Look at it.**
  - `npm run render -- nova-streak <sample or T-REX> --start 60 --end 65 --image cover=<generated testsrc2 jpg> --preview`,
    and read 3 frames: one on a beat (arcs visible), one between beats, and one without
    `--image` (no square, bars from the centre).
  - Open `/edit/nova-streak` in the built-in browser at 360p and compare a frame with the render
    at the same time (Review Focus 4).
- [ ] **Step 6: Commit:** `feat: Nova Streak template` (thumbnails come in Task 9).

### Task 9: Presets, real-GPU timing, app check, docs

**Files:**
- Create: `templates/nova-streak/presets/*.jpg` (`npm run thumbs -- nova-streak`, no cover)
- Modify: `src/lib/nova-streak.test.ts`, `CLAUDE.md`

- [ ] **Step 1: Thumbnails.**
  - Add `it("every preset has its thumbnail")` to `nova-streak.test.ts`: each preset's
    `thumbnail` file exists.
  - Run `npx vitest run src/lib/nova-streak.test.ts`. Expected: FAIL, the files are missing.
  - Run `npm run thumbs -- nova-streak`, then run the test again. Expected: PASS.
- [ ] **Step 2: Real GPU, 30 s Final with a cover.**
  - Run `npm run render -- nova-streak "C:\Users\ydogg\Downloads\AXIOM\Hardlight\T-REX.wav" --start 60 --end 90 --image cover=<cover>`.
    For the cover, use a picture from the album folder if one exists, else a generated test
    pattern.
  - Time it against Particle Horizon's 6 min 11 s.
  - Check frames: not blank, arcs on beats, the cover present on frame 0.
  - Repeat without `--image`.
  - Make a `--phone` copy under 30 MB for the owner.
- [ ] **Step 3: App check** (dev server on :3000, built-in browser):
  - Open `/edit/nova-streak`.
  - Set the cover through the Content tab's file input: build a `File` from
    `fetch('/api/images/<id>/square.jpg')` (an id uploaded with `curl -X PUT`), put it on the
    input with `DataTransfer`, and dispatch `change`.
  - See the cover in the preview. Remove it and see the square disappear.
  - Export a Draft through `POST /api/exports` with the cover id.
  - Check the console for errors.
- [ ] **Step 4: CLAUDE.md.**
  - Template rules: one bullet on image settings. They are declared as
    `{"type":"image","fit":"square","default":""}`; the template receives a picture location or
    `""` and must cope with a failed load; ids never reach templates.
  - The M6 status line: tick Nova Streak, with its spec and plan paths.
  - Machine facts: Nova Streak's render speed from Step 2.
  - Commands: `--image` in the render row.
- [ ] **Step 5: Run** `npm run check` and `npm run check:templates`.
  Expected: both green.
- [ ] **Step 6: Commit:** `feat: Nova Streak presets; docs and timings`
