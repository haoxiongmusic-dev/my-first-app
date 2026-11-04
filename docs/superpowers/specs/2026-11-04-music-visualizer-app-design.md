# Music Visualizer App: Design Spec

Date: 2026-11-04
Status: draft for review
Repo: `C:\dev\AppProject` → `github.com/haoxiongmusic-dev/my-first-app`
Background research: [`docs/research/2026-11-04-music-visualizers.md`](../../research/2026-11-04-music-visualizers.md)

---

## 1. Summary

A local web app, in the spirit of Videobolt, for making **music visualizer videos**: pick a
visual style, drop in a song, customize text, colors and intensity while watching a live
preview, then export an MP4 that reacts to the music. Version 1 runs on the owner's PC only.

## 2. Shared understanding

**Stated by the owner**
- This is their first app project; learning good habits is a goal in itself.
- Copy Videobolt's *functionality* (pick template → customize → export), not its branding.
- The first three templates are music visualizers in the style of three AXIOM album videos
  (Sunlight, Violetlight, Neonlight). They must react to the music.
- Use HyperFrames for templates and rendering.
- The app should be customizable, like the T-REX test render but driven by a form.

**Assumed (owner can correct)**
- Version 1 is for the owner's own use, on this PC, with no accounts or payments.
- Songs are the owner's own tracks (e.g. `C:\Users\ydogg\Downloads\AXIOM`).
- Output is 16:9 1920×1080 at 30 fps for YouTube.

**Success looks like:** open the app, pick a look, upload a song, change the title, colors and
intensity while the preview updates, click Export, and get a good-looking MP4 in which the
visuals clearly react to the song, without touching code.

## 3. Scope

**In version 1**
- Gallery of templates with preview clips.
- Editor laid out like the Videobolt editor the owner knows: icon rail with Content,
  Presets, Customize (Basic/Advanced), Preferences; live preview with optional ambilight
  glow; undo/redo; Preview still.
- Songs up to 60 minutes (album-length videos).
- Presets: named one-click looks per template.
- Optional background image (templates that support it, starting with Particle Horizon).
- Export: full song or a chosen section; Draft or Final; 1080p or 1440p; progress bar
  with time remaining; browser notification when done; compressed MP4 download.
- **One template first: Particle Horizon** (in the style of the owner's Sunlight videos),
  built and polished until it is a success. Further templates are then added one at a time
  on top of it (§14): Neon Strands, Neon Burst, then the studied catalog.

**Not in version 1 (on purpose)**
- Accounts, payments, watermarks, brand kits.
- Hosting it online for other people; cloud rendering.
- Vertical 9:16 / square versions; logos; lyric videos.
- A list of saved projects to reopen later. In version 1 the "project" is the current
  editor session; its name becomes the export filename, and the browser remembers the
  last settings per template.

## 4. What the owner sees

### Gallery (`/`)
A grid of template cards. Each card loops a short, silent preview clip and shows the name
and a one-line description. Clicking a card opens the editor.

### Editor (`/edit/[templateId]`)

The layout follows the editor the owner already uses on Videobolt (studied 2026-11-04, see
§4.1), so it feels familiar, but with our own name, look and styling.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [logo] ↶ ↷ ✎ Project name        status text        [Preview still] [Export] │  top bar
├────┬──────────────────────┬──────────────────────────────────────────────────┤
│ ▤  │ PANEL                │                                                  │
│ ◈  │ (changes with the    │            LIVE PREVIEW PLAYER                   │
│ ☰  │  icon rail on the    │      (soft coloured glow around it =             │
│ ⚙  │  left)               │       "ambilight", optional)                     │
│ ⛶  │                      │   ▶  🔊  02:19 ─────●──────────────   ⚙  ⛶        │
│ ◐  │                      │                                                  │
└────┴──────────────────────┴──────────────────────────────────────────────────┘
 icon rail (labels appear on hover)
```

**Top bar:** undo / redo, rename project, a status line ("Analyzing song…", "Ready",
"Exporting 42 %"), **Preview still** (renders one full-quality frame at the current time,
because the live preview may run at reduced resolution), **Export**.

**Icon rail → panels:**

| Tab | Panel contents |
|---|---|
| **Content** | Grouped "placeholders": **Song** (upload; waveform with draggable **Section** start/end handles; play from here), **Text** (Title, Artist), **Background image** (optional, hidden by default) |
| **Presets** | One-click colour/look variations shown as thumbnail cards (e.g. Original, Ice, Ember, Emerald, Silver, Prism). Picking one sets many fields at once; fields can still be changed afterwards |
| **Customize** | Two tabs. **Basic:** the few fields most people change. **Advanced:** every field, in collapsible groups (Fonts, Colors, Effects, and template-specific groups such as "Wave") |
| **Preferences** | Editor settings: preview resolution (360p / 540p / 720p), ambilight on/off, expanded sidebar on/off |
| **Fullscreen** | Preview fills the window |
| **Ambilight** | Toggle the soft glow around the preview (a blurred copy of the video behind the player) |

**Player controls:** play/pause, volume, current time, scrubbing bar, preview-resolution
gear, fullscreen.

**Fields** are generated from each template's declared variables and grouped by the
template's `template.json` (§6): **the form is generated, not hand-written**, so a new
template needs no form code. The browser remembers the last settings per template
(local storage, convenience only).

App-level fields (same for every template):

| Field | Notes |
|---|---|
| Song | WAV, MP3, FLAC, M4A; **up to 60 min** (album-length videos are a real use case: the owner's Sunlight draft uses a 36-minute album); ≤ 1 GB. Analyzed once, then cached. Over 10 min shows the expected export time before starting |
| Section | Start / end on the waveform; default = whole song |
| Quality | Draft (quick check) or Final |
| Resolution | 1080p (default) or 1440p "2K" (Videobolt exports this draft at 2K/30 fps). 1440p takes roughly 1.8× longer |
| Notify when done | Browser notification when an export finishes (instead of Videobolt's email) |

### 4.1 Reference: the owner's Videobolt "Sunlight Album" project

Studied read-only in the owner's account on 2026-11-04 (draft "Copy of Sunlight Album V4",
built on the Videobolt template "Flow"). Nothing was changed or exported.

| Area | What it has |
|---|---|
| Placeholders | **Background** (image, hidden), **Song** (the album audio, about 36 min; a waveform popup picks a 15-second interval used for quick server-rendered previews), **Artist Info** (two text fields, used here as "SUNLIGHT ALBUM" / "AXIOM") |
| Presets | 6 colour variations with thumbnails: Original (amber), Mento (cyan), Devil (red), Krypton (green), Titanium White, Rainbow |
| Customize → Basic | Font 1; Show Background (on); Background Blur 100 %; Threads Y 100 %; Threads X 100 % |
| Customize → Advanced | **Fonts:** Font 1 · **Primary Colors:** React Color (orange) · **Effects:** Show Background, Background Blur 100 %, Discoloration 20 %, Movie Box (letterbox, on), Threads Y 100 %, Threads X 100 % · **Fractal:** Fractal Size 8.44 %, Fractal Displace 18.67 %, Fractal Flow Speed 1.78 %, Fractal Speed 1.33 % |
| Preferences | Auto preview, preview resolution 360p, "after render, play from current time − 1 s", auto image preview, appearance toggles, ambilight |
| Export | One-step dialog: "Export your project in 2K at 30 fps", optional email when done, Export button |

What we take from it, and how it maps to our Particle Horizon template:

| Videobolt setting | Our variable | Effect in our template |
|---|---|---|
| React Color | `mainColor` (+ `highlightColor`) | Particle and haze colour |
| Threads X / Threads Y | `densityX` / `densityY` (25–200 %) | Particle columns / rows |
| Fractal Size | `waveScale` | Size of the rolling wave pattern |
| Fractal Displace | `waveHeight` | How tall the waves are |
| Fractal Flow Speed | `flowSpeed` | How fast waves travel toward the camera |
| Fractal Speed | `waveSpeed` | How fast the pattern itself changes |
| Movie Box | `letterbox` | Black bars on/off |
| Discoloration | `tint` | Colour variation across the field |
| Show Background / Background Blur | `showBackground`, `backgroundBlur` | Optional image behind the particles |
| Font 1 | `font` (enum of bundled fonts) | Title/artist font |
| (ours, new) | `intensity` | How strongly visuals react to the music |

Where we deliberately differ: our preview plays the **whole song live in the browser**, so
there is no 15-second preview interval; and export shows **progress and time remaining**
in the app instead of an email.

### Export
Clicking **Export** opens a panel summarizing the output (e.g. "1080p · 30 fps · 4:12 ·
about 17 min") and a **Start** button. While exporting it shows a progress bar,
percentage, elapsed time and time remaining (e.g. "about 17 min left"). Only one
export runs at a time; Export is disabled while one is running. A **Cancel** button stops it.
When finished: **Download** button, and the file is also saved in `storage/exports/` as
`<Artist> - <Title> (<Template>).mp4`.

## 5. Architecture

### Technology
| Part | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript (strict) | One project for pages and server; most widely used |
| Styling | Tailwind CSS | Common, fast to learn, no separate CSS files to manage |
| Templates and rendering | HyperFrames 0.9.x (Apache 2.0) | HTML templates, built-in variables, deterministic render, embeddable player |
| Audio analysis | Python 3 + NumPy (+ FFmpeg for decoding) | Proven in testing: about 4 s per song |
| Tests | Vitest (TypeScript), pytest (Python) | Standard, fast |
| Code quality | Prettier, ESLint | Consistent formatting; catch mistakes early |
| Package manager | npm | Comes with Node; simplest |

Requirements on this PC (all present): Node 26, Python 3.14 + NumPy, FFmpeg 8, Git.

### Folder layout
```
AppProject/
  CLAUDE.md                 project guide for Claude sessions
  docs/                     research, specs, plans
  analyzer/                 Python audio analyzer
    analyze.py
    tests/                  pytest, using generated test sounds
    requirements.txt
  templates/
    shared/viz-toolkit.js   shared template helpers (copied into each template's assets)
    neon-strands/           one HyperFrames project per template
      index.html            declares variables; draws from audio data
      template.json         name, description, preview clip, sample settings
      assets/
    particle-horizon/
    neon-burst/
  scripts/                  dev helpers: make sample audio, sync toolkit, make previews
  src/
    app/
      page.tsx              gallery
      edit/[id]/page.tsx    editor
      api/…                 server routes (below)
    lib/                    server logic: templates, songs, jobs, render, encode
    components/             UI pieces: SettingsForm, PreviewPlayer, ExportPanel…
  storage/                  NOT in Git: songs, analysis, job folders, exports
  test-renders/             NOT in Git: manual test videos
```

### Server routes
| Route | Does |
|---|---|
| `GET /api/templates` | List templates (from `templates/*/template.json` + declared variables) |
| `POST /api/songs` | Upload a song → hash it → analyze if new → return `songId`, duration, waveform peaks (for the section strip) |
| `GET /api/songs/[id]/audio` | Serve the converted `song.wav` to the preview |
| `GET /api/songs/[id]/analysis` | Serve the analysis as `audio-data.js` to the preview |
| `POST /api/exports` | Start an export: `{templateId, songId, values, start, end, quality}` → `exportId` |
| `GET /api/exports/[id]` | Status: queued / analyzing / rendering / encoding / done / failed, percent, ETA, error |
| `GET /api/exports/[id]/file` | Download the finished MP4 |
| `DELETE /api/exports/[id]` | Cancel |
| `/preview/[templateId]` | Serves a template for the preview player with the chosen song's data |

### Units and their jobs
Each unit has one purpose and can be tested on its own.

| Unit | Input → output | Depends on |
|---|---|---|
| `analyzer/analyze.py` | audio file → `analysis.json` | FFmpeg, NumPy |
| `lib/templates.ts` | `templates/` folder → list of templates and their variable schemas | file system |
| `lib/songs.ts` | uploaded file → stored song + cached analysis | analyzer |
| `lib/jobs.ts` | export request → job folder ready to render | templates, songs |
| `lib/render.ts` | job folder → raw MP4, emitting progress events | HyperFrames CLI |
| `lib/encode.ts` | raw MP4 → compressed MP4 | FFmpeg |
| `lib/queue.ts` | runs one export at a time, tracks status, handles cancel | render, encode |
| `components/SettingsForm` | variable schema + values → form, emits changed values | none |
| `components/PreviewPlayer` | template + song + values → live preview | HyperFrames player |

## 6. Template contract

Every template folder must follow these rules so the app can treat all templates the same.

1. **Variables:** declared with `data-composition-variables` on `<html>`. Supported types:
   `string`, `number`, `color`, `boolean`, `enum`, each with a useful default.
   Every template has at least `title`, `artist`, `intensity`.
2. **Audio inputs at fixed paths:** `assets/song.wav` and `assets/audio-data.js`
   (`window.AUDIO_DATA = {…}`). The job builder puts the real song's files there.
3. **Song length:** elements whose length must equal the song carry `data-song-length`.
   The job builder sets their `data-duration` (HyperFrames variables cannot change the
   root duration). End-of-song effects (fade out) read the root's `data-duration` at load.
4. **Drawing:** Canvas 2D or WebGL, driven only by the `hf-seek` time. No
   `Math.random()` (use the toolkit's seeded generator), no `Date.now()`, no timers.
5. **WebGL:** 8-bit (`UNSIGNED_BYTE`) render targets only (half-float targets render blank
   on this PC's Intel UHD 620). Always check shader compile **and** link status and throw a
   clear error.
6. **Grain:** subtle and slowly changing (e.g. ≤ 0.02 amplitude, updated ≤ 6×/s), because
   per-frame noise makes files huge.
7. **Shared toolkit** (`templates/shared/viz-toolkit.js`): `sample(t)` (interpolated bands,
   loudness, kick, flux), `recentHits(t, n)`, `mulberry32(seed)`, `hexToRGB`, glow helpers,
   WebGL helpers (compile/link with errors, render targets, blur pass).
   It also implements the **standard audio controls** that almost every Videobolt visualizer
   offers (see the catalog), so templates opt in instead of re-inventing them:
   `beatRange` (20–90 / 90–200 / 20–200 / 200–600 / 600–3000 / 3000–8000 / 8000–20000 /
   20–20000 Hz → which bands drive the beat pulse), `spectrumLow`, `spectrumHigh`,
   `spectrumBoost` (1/2/4/8×), `bandCount`, `bandThickness`, `spectrumStyle`
   (bars/line/dots), `scaleOnBeat`, `shakeOnBeat`, and a song timer/progress helper.
   Particle Horizon uses `beatRange` and `spectrumLow`/`High`/`Boost` from day one.
8. **`template.json`:** display name, description, preview clip path, and:
   - `groups`: how fields are grouped and ordered in Customize, e.g.
     `[{"name": "Colors", "fields": ["mainColor", "highlightColor"]}, {"name": "Wave", "fields": [...]}]`;
   - `basic`: the field ids shown on the Customize → Basic tab;
   - `content`: the field ids shown on the Content tab (text, background image);
   - `presets`: named sets of values, e.g. `{"name": "Ember", "thumbnail": "presets/ember.jpg", "values": {...}}`.
   Every declared variable must appear in exactly one group; a check enforces this.
9. **Must pass** `npx hyperframes check` with no errors.

## 7. Audio analysis

Built from the tested prototype (`analyze.py` in the research notes).

- Decode with FFmpeg to mono 44.1 kHz.
- One analysis frame per video frame (30 fps), FFT window 4096 (Hann).
- 32 log-spaced bands, 30 Hz–16 kHz, in dB.
- Scale each band against the **whole song** (20th–97th percentile → 0–1), loudness likewise.
- Smoothing: fast attack (0.55) / slow release (0.12).
- Onsets: spectral flux; bass-weighted flux → peak-picked **hits** (adaptive threshold,
  ≥ 0.15 s apart) and a decaying **kick** envelope (≈ 0.22 s).
- Output `analysis.json`: `{version, fps, bands, duration, frames:[{b:[…32], l, k, f}], hits:[[t, strength]…]}`,
  values rounded to 3 decimals.
- Cached in `storage/songs/<sha256>/` with the converted `song.wav`, so the same song is
  never analyzed twice. `version` changes invalidate the cache.
- For a section export, the job builder slices frames/hits to the section and trims the WAV
  (short fade in/out to avoid clicks).

## 8. Live preview

- Uses HyperFrames' embeddable `<hyperframes-player>` pointed at `/preview/[templateId]`,
  which serves the template with the selected song's `song.wav` and `audio-data.js`.
- When a setting changes: update the player's variable values directly if the player
  supports it; otherwise reload the player 400 ms after the last change, keeping the
  playback position. **This is checked first in milestone 4** (see risks).
- Preview may run at reduced resolution if playback stutters; export always uses full settings.

## 9. Export pipeline

1. **Prepare job folder** `storage/jobs/<exportId>/`: copy the template, copy the toolkit,
   place the (trimmed) `song.wav` and `audio-data.js`, set song-length durations, write
   `variables.json`.
2. **Render:** `npx hyperframes render --variables-file variables.json --quality <draft|delivery> --output raw.mp4`,
   reading progress from its `@hf-progress` lines. 1440p uses the CLI's resolution option,
   and Draft lowers resolution to 720p, if the CLI supports both (to verify in milestone 5).
   When the export finishes, the browser shows a notification if the owner allowed it.
3. **Encode:** FFmpeg H.264 CRF 20, AAC 320 kb/s, `+faststart` → `storage/exports/…mp4`.
   Delete `raw.mp4` after success.
4. **Clean up:** delete the job folder on success; keep it on failure for debugging.
5. **Time estimate:** percent done and elapsed time; before progress starts, an estimate
   from the measured ≈ 4× song length (Final).
6. **Cancel:** kill the render process tree (`taskkill /T /F` on Windows), mark cancelled,
   delete the job folder.

Measured on this PC: full 4:12 song, Particle Horizon, Final = 17 min 19 s render.

## 10. Error handling

| Situation | Behavior |
|---|---|
| Unsupported or corrupt audio file | "Couldn't read this audio file. Try WAV or MP3." No crash |
| Song over 60 min or 1 GB | Rejected at upload with the limit stated |
| Song over 10 min | Accepted; expected export time shown before Export starts |
| Analyzer fails | Message plus the analyzer's error text; song not cached |
| Missing FFmpeg / Python / NumPy | Startup check lists exactly what's missing and how to install it |
| Template fails to load (shader error etc.) | Preview shows the template's error message instead of a blank frame |
| Render fails | Status "failed" with the last lines of the render log; job folder kept |
| Export requested while one is running | Export button disabled; API returns 409 |
| Disk space below 5 GB before export | Warn before starting |
| App restarted during an export | On start, mark unfinished jobs as failed ("interrupted") |

## 11. Testing

- **Analyzer (pytest), with generated sounds, no real music in the repo:**
  60 Hz tone lights the lowest bands only; 5 kHz tone lights the matching band; clicks
  every 0.5 s produce hits at those times (±1 frame); silence gives all zeros and no hits;
  output format and rounding.
- **Server logic (Vitest):** template discovery and variable parsing; job folder
  preparation (durations set, files placed, section slicing); progress-line parsing; file
  naming; queue allows one job at a time; cancel.
- **Templates:** `hyperframes check` passes; snapshots at a quiet and a loud moment of the
  generated sample song must differ (proves reaction); WebGL link errors are thrown.
- **End to end:** a 5-second Draft export of each template finishes and has the right duration.
- **Manual:** before calling a template done, export 30 s of a real track and watch it.

## 12. Working practices

- **Branches:** `main` always works. Each milestone is built on its own branch and merged
  through a pull request, so every step can be reviewed and undone.
- **Small commits** with clear messages; tests and checks pass before committing.
- **Never commit music or videos:** `storage/`, `test-renders/` and audio files are
  git-ignored. The repo is public.
- **Secrets** (none yet) go in `.env`, never committed.
- **`CLAUDE.md`** is kept up to date with status, commands and gotchas.

## 13. Milestones

Each one ends with something that can be used or seen.

| # | Milestone | Done when |
|---|---|---|
| 1 | Project skeleton | `npm run dev` shows a placeholder page; Prettier, ESLint, Vitest, pytest set up; `CLAUDE.md` commands filled in |
| 2 | Analyzer | `analyzer/analyze.py` passes its tests; analyzes T-REX in < 10 s |
| 3 | **Particle Horizon template** (Sunlight style) | Passes `hyperframes check`; reacts in snapshots; has the §4.1 settings and presets; the owner agrees it matches their Sunlight look on a real track; toolkit extracted |
| 4 | Editor + live preview | Icon rail with Content, Customize (Basic/Advanced) and Preferences; upload a song, see and hear the preview, change fields live |
| 5 | Export | Export a section and a full song with progress, cancel, notification, compressed download. **First complete app.** |
| 6 | Next templates (only after 1–5 are a success) | One at a time from §14, each with its own short design + plan; each passes the template contract and looks right on real tracks |
| 7 | Gallery and polish | Preview cards, Presets panel, Preview still, ambilight, undo/redo, remembered settings, effect tuning (e.g. the bright-dot flashes) |

## 14. Future templates (after Particle Horizon succeeds)

Not scheduled yet. Study notes for 23 Videobolt visualizers the owner wants are in
[`docs/research/2026-11-04-visualizer-catalog.md`](../../research/2026-11-04-visualizer-catalog.md),
grouped into families with a suggested order:

1. **Particle fields** (reuse the Particle Horizon engine): Particles Wave Visualizer,
   Pulsing Spheres.
2. **Scene + spectrum overlay**: one flexible "Scene Visualizer" (background media +
   spectrum style + cover + text + timer + layout presets) could cover Night Lights, Dark
   Frequency, Soundwave, Star Dance, Through Sky, Storm Signal, Beatwave, Neon Helix,
   Iron Wraith.
3. **Radial / ring spectrum**: Astral Pulse, Glasswave Viz, Universal Visualizer, Ocean of
   Sound, Power Bass.
4. **Retro synthwave**: Gridwave Reactor, Synthwave.
5. **3D object / special scenes**: Techno Cube, Aqua Reverie, FerroPulse, RoboWave,
   Ascension Pulse.

Plus our own earlier looks: Neon Strands (Violetlight style) and Neon Burst (Neonlight style).

All are **our own designs** inspired by these genres: own names, own code and artwork.
Licensed photos/3D renders in the originals are replaced by generated visuals or the
owner's own background media. Each one gets its own short design and plan when its turn
comes.

## 15. Risks and open questions

| Risk | Plan |
|---|---|
| The player may not accept live variable changes | Fall back to debounced reload (§8); verified first in milestone 4 |
| Exports are slow (≈ 4× song length in Final) | Draft quality, section exports, progress/ETA; cloud rendering is a later phase |
| Album-length songs: a 36-min album ≈ 2.5 h at 1080p, ≈ 4.5 h at 1440p on this PC | Show the estimate before starting; keep the PC awake during export; resume-from-crash is a later improvement |
| Large files (fine particles compress poorly) | CRF 20 encode; template grain rule; revisit bitrate if needed |
| HyperFrames is pre-1.0 and may change | Pin the exact version (0.9.10) in `package.json`; upgrade deliberately |
| Python as a second language | Kept to one small, well-tested script with one dependency (NumPy) |
| Preview performance with heavy WebGL | Lower preview resolution if needed; export unaffected |
