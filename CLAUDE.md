# CLAUDE.md

Guide for Claude sessions working in this repo. Keep it short and current.

## What this is

A local web app for making **music visualizer videos**, in the spirit of Videobolt: pick a
visual style → upload a song → customize (title, colors, intensity) with a live preview →
export an MP4 that reacts to the music. Version 1 runs only on the owner's PC.

The owner is building their **first app** and wants to learn good practice: explain the
_why_ of choices in plain language, avoid jargon, and keep steps small.

## Status (update as milestones land)

- [x] Research + render-speed spikes: `docs/research/2026-11-04-music-visualizers.md`
- [x] Design spec (approved): `docs/superpowers/specs/2026-11-04-music-visualizer-app-design.md`
- [x] Catalog of 23 Videobolt visualizers to build later: `docs/research/2026-11-04-visualizer-catalog.md`
- [x] M1 project skeleton (plan: `docs/superpowers/plans/2026-11-04-m1-project-skeleton.md`)
- [x] M2 analyzer (plan: `docs/superpowers/plans/2026-11-04-m2-analyzer.md`): `npm run analyze`
- [x] M3 Particle Horizon (Sunlight style) (plan: `docs/superpowers/plans/2026-11-05-m3-particle-horizon.md`):
      the first and only template until it's a success; owner approved the look (orbs removed)
- [x] M4 editor + live preview (plan: `docs/superpowers/plans/2026-11-05-m4-editor-preview.md`)
- [x] M5 export (plan: `docs/superpowers/plans/2026-11-05-m5-export.md`): owner's full-song
      export confirmed. **The first complete app.**
- [x] M6 five more templates, one at a time (pull requests #9–#11 merge in order):
  - [x] Iron Wraith (voxel robot skull, three.js; spec
        `docs/superpowers/specs/2026-11-05-m6-iron-wraith-design.md`): merged (PR #7)
  - [x] Nova Streak (Soundwave-style, plus the general `image` setting; spec
        `docs/superpowers/specs/2026-11-06-m6-nova-streak-design.md`, plan
        `docs/superpowers/plans/2026-11-06-m6-nova-streak.md`): merged (PR #8)
  - [x] Halo Rings (nested dotted rings, Astral Pulse-style, plus the toolkit's ring kit;
        spec `docs/superpowers/specs/2026-11-06-m6-halo-rings-design.md`, plan
        `docs/superpowers/plans/2026-11-06-m6-halo-rings.md`)
  - [x] Neon Sundown (synthwave, Gridwave-style: cover in a striped sun, grid floor, VHS look;
        spec `docs/superpowers/specs/2026-11-06-m6-neon-sundown-design.md`, plan
        `docs/superpowers/plans/2026-11-06-m6-neon-sundown.md`)
  - [x] Prism Heart (iridescent glass crystal, three.js with our own glass shader; spec
        `docs/superpowers/specs/2026-11-06-m6-prism-heart-design.md`, plan
        `docs/superpowers/plans/2026-11-06-m6-prism-heart.md`)
- [ ] Online test version (rented cloud GPU, invited logins, files on a kept disk; spec
      `docs/superpowers/specs/2026-11-06-online-test-design.md`, plan
      `docs/superpowers/plans/2026-11-06-online-test.md`, owner's guide
      `docs/online-test-guide.md`): built; first RunPod session pending
- [ ] M7 polish: the deferred minors listed in PRs #8–#11, the editor's Presets panel
- Roadmap after M6: an installable desktop app (Electron), then an online web version.

Each milestone gets its own plan in `docs/superpowers/plans/` before any code is written.

## Key decisions

- **Stack:** Next.js (App Router) + TypeScript strict + Tailwind; HyperFrames **0.9.10**
  (pinned) for templates, preview and rendering; Python 3 + NumPy analyzer; Vitest, pytest,
  Prettier, ESLint; npm.
- **Templates** live in `templates/<id>/` as HyperFrames projects. The settings form is
  **generated from each template's declared variables**: never hand-code per-template forms.
- **Audio** is analyzed once per song (32 log bands, loudness, kick, flux, hits) and cached
  in `storage/songs/<sha256>/`. Templates read it from `assets/audio-data.js`.
- **One export at a time**, rendered locally, then re-encoded (H.264 CRF 20).
- **Editor layout mirrors the Videobolt editor the owner already uses** (icon rail:
  Content / Presets / Customize Basic+Advanced / Preferences; live preview; Export), with our
  own name and styling. Reference notes: spec §4.1.
- **Songs up to 60 min**: the owner makes album-length videos (e.g. the 36-min Sunlight album).
- **Online test version** (cloud): the same app in a container image
  (`ghcr.io/haoxiongmusic-dev/my-first-app`, built and smoke-tested by `.github/workflows/image.yml`)
  on a RunPod GPU pod. Settings come only from the pod's environment:
  - `ACCOUNTS` (`npm run add-user -- <name>` makes each line): logins are **off when it is unset**,
    so the owner's PC is unchanged
  - `SESSION_SECRET` (32+ chars; the server refuses to run without it when ACCOUNTS is set)
  - `STORAGE_DIR` (every storage path goes through `storageRoot()` in `src/lib/storage-root.ts`)
  - `RENDER_GPU=1` (passes `--browser-gpu` to renders)
  - `GPU_CHECK` (the start-up check render runs on the online version; `0` off, `1` force)

  The gate is `src/proxy.ts` (Next 16's renamed middleware, Node runtime) with the pure
  `decide()` in `src/lib/auth/gate.ts`. Secrets never go in the repo or the image.

## Template rules (see spec §6)

- Draw only from the `hf-seek` time; no `Math.random()`, `Date.now()` or timers. Use the
  seeded `mulberry32` from the toolkit.
- **WebGL: 8-bit render targets only.** Half-float targets silently render blank on this
  PC's Intel UHD 620 (ANGLE/D3D11). Always check shader compile _and_ link status.
- Keep grain subtle and slow (≤ 0.02, ≤ 6 updates/s); per-frame noise makes files huge.
- Elements that span the song carry `data-song-length`; the job builder sets their duration.
- Every template must pass `npx hyperframes check`. Run `npm run check:templates` before
  committing any template change (settings rules, HyperFrames check, quiet vs loud reaction).
- The toolkit lives in `templates/shared/viz-toolkit.js`: edit it there, then
  `npm run sync:toolkit` (each template keeps an identical copy in `assets/`).
- **Ring kit** (toolkit) for spectrum bars around a centre: `ringAngles(count, arcDeg)`
  (clockwise from the top, centred on it), `ringPoint(angle, "circle"|"rounded")` →
  `[x, y, nx, ny]` (y down), `ringValues(spectrum, angles, arcDeg)` (bass at the top, mirrored
  left/right), `beatEnvelope(audio, t, release)`, `bandsToRingCount(pct, full)`. Analyzer
  band values sit around 0.5–1 in loud music: shape bar lengths (Halo Rings squares them) or
  every bar looks full.
- **three.js templates** load `assets/three-kit.js` (`npm run build:three`, then
  `npm run sync:toolkit`, which copies it only into templates that reference it). The bundle
  swaps three.js's own `Math.random`/frame loop for a seeded generator so `hyperframes check`
  passes. Force `UnsignedByteType` on the `EffectComposer` target and every `UnrealBloomPass`
  target (three.js defaults to half-float: blank on this PC). 8-bit bloom only catches
  near-white, so give coloured glows their own additive sprites. Build the renderer once and
  update materials on settings changes (don't recreate it: WebGL contexts pile up in preview).
  **Glass:** never three.js's physical glass (`transmission` needs high-precision targets:
  blank here). Fake it with a `ShaderMaterial` that reads an 8-bit backdrop render target at
  `gl_FragCoord` nudged by the normal (Prism Heart). Prism Heart turns colour management off
  (`THREE.ColorManagement.enabled = false`, `NoToneMapping`, linear output) so preset colours
  come out exactly as picked, like the plain-WebGL templates.
- **Image settings** (cover art, logos): declare `{"type":"image","fit":"square","default":""}`.
  The editor shows an upload card on the Content tab; uploads are converted once
  (`storage/images/<id>-square.jpg`, 1024×1024, centre-cropped). The template receives a
  picture location or `""`, never the id (`assets/images/<settingId>.jpg` in an export,
  `/api/images/<id>/square.jpg` in the preview). Set the `<img>` `src` at startup and redraw
  on its `load` event (frame 0 is drawn before the picture arrives); a failed load must just
  leave the picture out. A section's analysis carries `sectionStart` (toolkit
  `audio.songStart`), so effects seeded by song time match the full render.
- Template `assets/song.wav` and `assets/audio-data.js` are the generated sample song
  (`npm run template:assets`, git-ignored). Real songs go through a job folder, never into
  `templates/`.
- Don't use HyperFrames' `render --start/--end`: it switches to slow software rendering.
  Sections are cut by the job builder (`prepareJob({ section })`).
- Live preview: `/preview/<template>/<songId|sample>/…` serves the template for a song with no
  copying, and injects the HyperFrames runtime (the player won't for a page link). The editor
  sends settings live on the `settings` and `preview` (`{scale}`) runtime-data channels; a
  template must look identical without them (renders never send any). Templates redraw on
  their timeline's `onUpdate` while the preview plays (`hf-seek` only comes on jumps), and must
  not measure the DOM inside that callback.
- Exports (`src/lib/exports/`): one at a time; status files `storage/exports/<exportId>.json`
  (an export still marked running when the app starts is reported as failed); the job folder
  `storage/jobs/<exportId>/` is kept only on failure. HyperFrames renders 1080p only: 1440p is
  upscaled in our FFmpeg encode, Draft is encoded at 720p. Progress comes from HyperFrames'
  `@hf-progress {json}` lines and FFmpeg's `-progress pipe:1`. Cancel kills the process tree.
- Code the browser uses must not import `node:` modules: pure template types and checks live in
  `src/lib/template-values.ts`; `src/lib/templates.ts` (file access) re-exports them.

## Machine facts

- Windows 11; Node 26; Python 3.14 + NumPy; FFmpeg 8; Git. GPU used for rendering: Intel
  UHD 620 (an NVIDIA Quadro P500 is present but not used by Chrome).
- Final-quality render ≈ 4× song length (4:12 song → 17 min). Analysis (`npm run analyze`): T-REX 4:12 in 6–9 s, a 60-min song in ≈ 2 min (≈ 1.1 GB RAM).
- Iron Wraith (three.js) renders a little faster than Particle Horizon: a 30 s Final section
  took 5 min 8 s in total (frame capture 2 min 15 s ≈ 4.5×; setup and audio ≈ 1.5 min fixed)
  versus 6 min 11 s for Particle Horizon's.
- Nova Streak is the quickest so far: a 30 s Final section of T-REX took 5 min 27 s with a cover
  (frame capture 1 min 35 s ≈ 3.2×) and 4 min 33 s without.
- Halo Rings is quicker still: a 30 s Final section of T-REX took 3 min 45 s in total (frame
  capture 1 min 30 s ≈ 3×).
- Neon Sundown: a 30 s Final section of T-REX with a cover took 4 min 7 s (frame capture
  1 min 58 s ≈ 3.9×). Its files are the biggest so far (≈ 26 MB per 30 s at CRF 20, Halo Rings
  ≈ 13 MB): the always-scrolling grid is most of it, the VHS look adds ≈ 25 %.
- Prism Heart (three.js): a 30 s Final section of T-REX took 4 min 32 s (frame capture
  2 min 15 s ≈ 4.5×), the smallest files so far (8.9 MB per 30 s).
- Test tracks: `C:\Users\ydogg\Downloads\AXIOM\` in album folders (e.g.
  `Hardlight\T-REX.wav`). **Never copy music into the repo**: it is public.

## Working practices

- `main` always works; build each milestone on a branch and merge via pull request.
- Small commits; run tests/checks first. Never commit `storage/`, `test-renders/`, audio or video.
- The owner often follows along from a phone (Remote Control): files sent to them must be
  under 30 MB, so make phone-sized copies of videos.

## Commands

| Command                               | What it does                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                         | Start the app at http://localhost:3000 (reloads as you edit)                                                                                                                              |
| `npm run build`                       | Make a production build; catches type and build errors                                                                                                                                    |
| `npm run check`                       | **Run before every commit**: lint, formatting, type check, all tests                                                                                                                      |
| `npm test`                            | TypeScript tests (Vitest), `src/**/*.test.ts`                                                                                                                                             |
| `npm run test:py`                     | Python analyzer tests (pytest), `analyzer/tests/`                                                                                                                                         |
| `npm run lint`                        | ESLint: catches likely mistakes                                                                                                                                                           |
| `npm run format`                      | Prettier: tidy all code formatting                                                                                                                                                        |
| `npm run doctor`                      | Check this PC has Node, FFmpeg, ffprobe, Python, NumPy and HyperFrames 0.9.10                                                                                                             |
| `npm run setup:py`                    | Create/update the analyzer's Python environment (`analyzer/.venv`)                                                                                                                        |
| `npm run analyze -- <song>`           | Analyze a song into `storage/songs/<id>/` (add `--js out.js` for template work)                                                                                                           |
| `npm run render -- <template> <song>` | Render a template with a real song into `test-renders/` (`--preset`, `--set id=value`, `--image id=file`, `--start/--end`, `--phone`, `--preview`; run with no arguments for all options) |
| `npm run check:templates`             | Check every template: settings rules, `hyperframes check`, reacts to the music                                                                                                            |
| `npm run sync:toolkit`                | Copy `templates/shared/viz-toolkit.js` into every template (and `three-kit.js` where used)                                                                                                |
| `npm run template:assets`             | Put the generated sample song into every template's `assets/`                                                                                                                             |
| `npm run thumbs -- <template>`        | Make the preset thumbnails (`--song <file> --at <s>` for a real track)                                                                                                                    |
| `npm run build:three`                 | Rebuild `templates/shared/three-kit.js` (three.js + add-ons) after changing three.js or `scripts/three-kit-entry.js`                                                                      |
| `npm run add-user -- <name>`          | Make an `ACCOUNTS` line (username + scrypt fingerprint) for the online version; asks for the password without showing it                                                                  |

CI: `.github/workflows/ci.yml` runs `npm run check` and `npm run build` on Linux for every push;
`.github/workflows/image.yml` builds, smoke-tests (`scripts/smoke-image.sh`) and publishes the
container image. `npm run typecheck` runs `next typegen` first (fresh machines have no route types).

Notes: dev scripts in `scripts/` run with `tsx` and compile as CommonJS, so no top-level
`await` (wrap in `main()`). Shared helpers live in `src/lib/` so the app can reuse them.
