# Milestone 6b: Nova Streak and the image setting: Design Spec

Date: 2026-11-06
Status: **approved in chat on 2026-11-06; awaiting the owner's review of this written version**
Builds on: [`2026-11-04-music-visualizer-app-design.md`](2026-11-04-music-visualizer-app-design.md)
(template contract §6, preview §8, export §9), Iron Wraith
([`2026-11-05-m6-iron-wraith-design.md`](2026-11-05-m6-iron-wraith-design.md)), and the
catalog note
[`Soundwave Visualizer`](../../research/2026-11-04-visualizer-catalog.md#17-soundwave-visualizer--s_worx).

## 1. Summary

Two pieces ship together:

1. **A general `image` setting type.** A template declares an image the way it declares a
   colour, and the app does the rest: an upload box generated on the Content tab, a one-time
   conversion, storage, live preview and export. Cover art comes first. Later templates
   reuse it, for example Gridwave's cover in the sun or a logo.
2. **Nova Streak**, our own take on the Soundwave look:
   - a starfield drawn in code, or your own background
   - a bright horizontal light streak
   - mirrored spectrum bars bursting left and right along it
   - your cover art in the centre with a crackling electric border, or no square at all
     without a cover
   - "ARTIST – SONG" on one line

## 2. Shared understanding

**What the owner chose (2026-11-06):**

| Choice | Decision |
|---|---|
| Scope | A **focused Soundwave look**, not a multi-layout "Scene Visualizer" |
| No cover uploaded | **Draw nothing:** the square disappears and the spectrum runs straight through the middle |
| Background | **A starfield drawn in code by default, plus an optional upload of your own** (the existing Background card), with a blur slider |
| Text | **One line, "ARTIST – SONG"** |
| How images get in | **A general image setting** (approach A), not a copy of the background special case and not pictures embedded in the settings |
| Name and presets | "Nova Streak". Presets: Original, Red Orange, Blue Green, Purple Pink |

**Success:** the owner uploads a cover, picks a preset, and exports a song. The picture:
- reacts clearly to the music
- shows the cover with its border crackling on beats
- comes out identical on every export
- renders no slower than Particle Horizon

## 3. Scope

**In:**
- the `image` setting type end to end: contract, validation, upload route, storage, form,
  preview, job builder
- the `templates/nova-streak/` template, with its presets and thumbnails
- tests
- CLAUDE.md notes

**Out:**
- Other image fits (logo with transparency, full-frame). Each is added when a template needs
  it.
- Moving the existing background upload onto the new setting. It keeps working as it is
  today.
- Timer and progress bar, layout presets.
- The editor's Presets panel (M7).

## 4. The image setting

### 4.1 Contract

A template declares an image in `data-composition-variables`:

```json
{ "id": "cover", "type": "image", "label": "Cover art", "fit": "square" }
```

- **`default`** is always `""`, meaning no image.
- **`fit`** is required. The only value for now is `"square"`: 1024×1024, scaled to cover and
  cropped from the centre, never stretched, transparent parts on black.
- **The value** a setting holds in the editor and in an export request is either `""` or an
  image id: the 64-character hex fingerprint of the uploaded file, the same `songIdFor`
  hashing the backgrounds use.
- **Validation** (`validateValue`): an image value must be `""` or match `/^[0-9a-f]{64}$/`.
  The export start also checks that the stored file exists; if not, it reports "This image is
  no longer available: please upload it again."
- **What the template receives:** a **picture location** (a string), or `""`.
  - In an export it is `assets/images/<settingId>.jpg`.
  - In the live preview it is `/api/images/<id>/square.jpg`.
  - The template only loads whatever location it gets; `""` means don't draw the image.
- **`TemplateVariable`** gains
  `(VariableBase & { type: "image"; default: ""; fit: "square" })`.
  - `parseVariables` accepts it.
  - `validateTemplate` rejects an image with a non-empty default or an unknown fit.

### 4.2 Upload and storage

- **Route:** `POST /api/images?fit=square` with a multipart file. It mirrors
  `POST /api/backgrounds`:
  - the same 50 MB limit, the same accepted types (JPG, PNG, WebP) and the same error messages
  - it returns `{ id }`
- **Conversion:** FFmpeg runs once per picture and fit, to
  `storage/images/<id>-square.jpg`, at quality `-q:v 2`. An upload already converted is not
  converted again.
- **Serving:** `GET /api/images/<id>/square.jpg` serves the stored file, with 404 for an
  unknown id. The `<id>` must match the 64-hex pattern before any path is built.
- **Library:** `src/lib/images.ts` mirrors `src/lib/backgrounds.ts`.
  - `imageArgs(input, output, fit)` gives the FFmpeg arguments.
  - `saveImage(...)` stores and converts a picture.
  - `imagePath(storageRoot, id, fit)` gives a stored picture's location.
  - It shares the size, type and unreadable-image messages with `backgrounds.ts` rather than
    copying them.

### 4.3 Editor

- **The Content tab** shows one `ImageCard` per image setting the template declares, in
  declaration order, below the song card and above the Background card. Each card shows:
  - the label
  - a square thumbnail, or "No image"
  - **Upload** and **Remove** buttons
- The card's state is the setting's value (an id or `""`), saved with the other settings.
- **When sending settings to the preview** on the `settings` channel, the editor turns each
  image id into its preview location (`/api/images/<id>/square.jpg`, or `""`). The template
  never sees ids.
- Image settings are left out of the Customize form, because they live on the Content tab.

### 4.4 Export

`prepareJob` handles each image setting with a non-empty value:
1. Copy `storage/images/<id>-<fit>.jpg` to `<job>/assets/images/<settingId>.jpg`.
2. Write `assets/images/<settingId>.jpg` as that setting's value in the variables file given to
   HyperFrames.

An empty value stays `""`. A missing stored file stops the export before rendering, with the
§4.1 message.

## 5. Nova Streak: what you see

All of it is drawn in code at 1920×1080 with WebGL (the toolkit's helpers and blur), with no
three.js.

| Element | Where | Notes |
|---|---|---|
| Starfield | Full frame | About 900 stars at the default density, from `mulberry32` (seed 11), drifting slowly left (about 6 px/s for the nearest stars). A soft colour haze from the two preset colours |
| Own background | Full frame | When `showBackground` is on and a background is uploaded, it replaces the starfield, blurred by `backgroundBlur` (as in Particle Horizon) |
| Light streak | Horizontal, centred at y = 540 | A bright core line, 3 px, nearly white tinted with `mainColor`, plus a wide soft glow running out to the frame edges |
| Spectrum bars | Along the streak, x from the cover's edge (or the centre) out to 96 % of the width, both sides | Mirrored: bass at the centre, treble at the edges. Each bar extends up **and** down from the streak. Colour runs from `mainColor` at the centre to `accentColor` at the edges. They glow through the blur pass |
| Cover | Centred, 360×360 px | Only when `cover` is set. The bars start at its edges instead of the centre. A 3 px glowing border in `mainColor` |
| Electric border | Around the cover | Jagged arcs along the border that crackle on beats (§6) |
| Title | Centred, top 760 px | "ARTIST – SONG" in capitals, letter-spaced, shrunk to fit the 80 % title-safe width (Iron Wraith's `fitTitles`) |

## 6. Nova Streak: how it moves with the music

Everything is worked out from the song time only, with short look-backs, like Iron Wraith's
`wraith-motion.js`. The maths lives in `templates/nova-streak/assets/streak-motion.js`: pure,
loadable by Node, and unit-tested.

| Part | Signal | Behaviour |
|---|---|---|
| Streak | `loud` | Core and glow brightness `0.55 + 0.45 × loud × intensity` (capped at 1) |
| Bars | spectrum (`spectrumLow`/`High`/`Boost`, `bandCount`) | Height = value × 260 px × `intensity` (cap 300 px each way) |
| Cover pulse | `beat` (follows **Beat range**) | Scale `1 + 0.06 × envelope × intensity`, using the same envelope maths as Iron Wraith's jaw (release 0.18 s) |
| Electric arcs | beats | Each beat (a toolkit hit, or a `beat` rise for non-kick ranges) starts a burst of 3–6 arcs. Each is a jagged polyline of 8–14 points hugging the border, with a perpendicular jitter of up to 14 px. They fade linearly over 0.3 s. Each burst's shape is seeded by the beat's time (`mulberry32(round(hitTime × 1000))`), so the same beat always looks the same. Brightness × `borderGlow`/100 |
| Stars | hits | Stars twinkle 15 % brighter on hits, fading over 0.5 s. Twinkle changes at most 6×/s (grain rule) |

The bar count is `bandCount` %: 10 % ≈ 16 bars per side, 100 % ≈ 96 bars per side, same mapping
shape as Iron Wraith.

## 7. Settings (generated form)

| Group | Field id | Type | Default | Range / options |
|---|---|---|---|---|
| Text | `title` | string | `SONG NAME` | max 60 |
| | `artist` | string | `ARTIST NAME` | max 60 |
| | `font` | enum | `Montserrat` | Particle Horizon's eight font options |
| Images | `cover` | image (square) | `""` | |
| Colors | `mainColor` | color | `#ff2fb3` | |
| | `accentColor` | color | `#8a3cff` | |
| Effects | `intensity` | number | 1 | 0.2–2, step 0.1 |
| | `borderGlow` | number | 70 | 0–100 % |
| | `starDensity` | number | 100 | 0–200 % |
| | `showBackground` | boolean | false | |
| | `backgroundBlur` | number | 60 | 0–100 % |
| Audio | `beatRange` | enum | `kick` | Particle Horizon's options |
| | `spectrumLow` | number | 30 | 30–16000 Hz |
| | `spectrumHigh` | number | 1000 | 30–16000 Hz |
| | `spectrumBoost` | enum | `2` | 1×, 2×, 4×, 8× |
| | `bandCount` | number | 100 | 10–100 % |

- **Basic tab:** `mainColor`, `accentColor`, `intensity`, `borderGlow`, `font`,
  `showBackground`.
- **Content:** `title`, `artist`, `cover`.

The reference's defaults are kept: High 1000 Hz, Boost 2×, Bands 100 %. Low is 30 Hz because
the analyzer starts there.

## 8. Presets

| Preset | `mainColor` | `accentColor` |
|---|---|---|
| Original | `#ff2fb3` (magenta) | `#8a3cff` (violet) |
| Red Orange | `#ff2a2a` | `#ff9a1f` |
| Blue Green | `#2f7bff` | `#19e0c0` |
| Purple Pink | `#9b4dff` | `#ff5fd2` |

Thumbnails come from `npm run thumbs -- nova-streak`, rendered with no cover.

## 9. Testing

| What | How |
|---|---|
| Image contract | Vitest (`template-values` / `templates`): `parseVariables` accepts an image setting; `validateTemplate` rejects a non-empty default or an unknown fit; `validateValue` accepts `""` and 64-hex ids and rejects anything else (paths, URLs, `../`) |
| Conversion | Vitest: `imageArgs(..., "square")` gives a 1024×1024 cover-crop on black. A real FFmpeg run turns a 300×200 PNG into a 1024×1024 JPEG |
| Upload and serve routes | Vitest, like the backgrounds route tests: a good upload returns an id; too big, wrong type and unreadable files give the shared messages; GET returns 200 `image/jpeg`, 404 for an unknown id and 400 for a malformed one |
| Job builder | Vitest: an image value is copied to `assets/images/cover.jpg` and replaced by that path in the variables; `""` stays `""`; a missing stored file throws the §4.1 message |
| Editor | Vitest on the pure helpers: image ids become preview locations in the settings sent to the preview; image settings are left out of the Customize form |
| Motion maths | Vitest (`streak-motion.js`): the streak level is capped; bar heights are capped and mirrored; arcs are the same for the same time; arcs vanish 0.3 s after a beat; a section start matches the full song; silence keeps the streak at its base level, with no NaN |
| Template rules | `npm run check:templates`: settings rules, `npx hyperframes check`, quiet vs loud reaction |
| Real GPU | A 30 s Final section of T-REX **with a cover** on this PC: not blank, the arcs visible on beats, timed against Particle Horizon (6 min 11 s for 30 s). Also one without a cover |
| App | Upload a cover on the Content tab (by the API if the test browser can't pick files), see it in the live preview, Remove it and see the square disappear, export a Draft |

## 10. Risks

| Risk | Plan |
|---|---|
| HyperFrames rejects or mishandles a picture location in a variable | The first plan task proves an `<img>`/texture loaded from a variable path renders in `hyperframes check` and a 5 s render |
| The cover isn't loaded when the first frames render | The template waits for the picture before its first draw: an `Image` `decode()` promise. A failed load draws no cover and shows no error box (the export continues) |
| Arcs flicker or look random between preview and export | Seeded by beat time only; tested |
| Glow banding (8-bit) | The toolkit's blur on 8-bit targets, as in Particle Horizon (already approved) |
| A stale image id in a saved project | Validation and the export-start check give a clear message |

## 11. Working practices

- **Branch** `feat/m6-nova-streak`, then a plan, native execution, a fresh final reviewer, a PR,
  and a merge when the owner says so.
- **CLAUDE.md:**
  - add the image setting to the template rules
  - add the M6 status line
  - add Nova Streak's render speed
