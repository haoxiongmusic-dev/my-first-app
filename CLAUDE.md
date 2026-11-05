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
- [ ] M4 editor + live preview (plan: `docs/superpowers/plans/2026-11-05-m4-editor-preview.md`): built;
      awaiting the owner's check in their own Chrome
- [ ] M5 export · M6 more templates (one at a time, spec §14) · M7 polish

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
- Code the browser uses must not import `node:` modules: pure template types and checks live in
  `src/lib/template-values.ts`; `src/lib/templates.ts` (file access) re-exports them.

## Machine facts

- Windows 11; Node 26; Python 3.14 + NumPy; FFmpeg 8; Git. GPU used for rendering: Intel
  UHD 620 (an NVIDIA Quadro P500 is present but not used by Chrome).
- Final-quality render ≈ 4× song length (4:12 song → 17 min). Analysis (`npm run analyze`): T-REX 4:12 in 6–9 s, a 60-min song in ≈ 2 min (≈ 1.1 GB RAM).
- Test tracks: `C:\Users\ydogg\Downloads\AXIOM\` (e.g. `T-REX.wav`). **Never copy music into
  the repo**: it is public.

## Working practices

- `main` always works; build each milestone on a branch and merge via pull request.
- Small commits; run tests/checks first. Never commit `storage/`, `test-renders/`, audio or video.
- The owner often follows along from a phone (Remote Control): files sent to them must be
  under 30 MB, so make phone-sized copies of videos.

## Commands

| Command                               | What it does                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                         | Start the app at http://localhost:3000 (reloads as you edit)                                                                                                           |
| `npm run build`                       | Make a production build; catches type and build errors                                                                                                                 |
| `npm run check`                       | **Run before every commit**: lint, formatting, type check, all tests                                                                                                   |
| `npm test`                            | TypeScript tests (Vitest), `src/**/*.test.ts`                                                                                                                          |
| `npm run test:py`                     | Python analyzer tests (pytest), `analyzer/tests/`                                                                                                                      |
| `npm run lint`                        | ESLint: catches likely mistakes                                                                                                                                        |
| `npm run format`                      | Prettier: tidy all code formatting                                                                                                                                     |
| `npm run doctor`                      | Check this PC has Node, FFmpeg, ffprobe, Python, NumPy and HyperFrames 0.9.10                                                                                          |
| `npm run setup:py`                    | Create/update the analyzer's Python environment (`analyzer/.venv`)                                                                                                     |
| `npm run analyze -- <song>`           | Analyze a song into `storage/songs/<id>/` (add `--js out.js` for template work)                                                                                        |
| `npm run render -- <template> <song>` | Render a template with a real song into `test-renders/` (`--preset`, `--set id=value`, `--start/--end`, `--phone`, `--preview`; run with no arguments for all options) |
| `npm run check:templates`             | Check every template: settings rules, `hyperframes check`, reacts to the music                                                                                         |
| `npm run sync:toolkit`                | Copy `templates/shared/viz-toolkit.js` into every template                                                                                                             |
| `npm run template:assets`             | Put the generated sample song into every template's `assets/`                                                                                                          |
| `npm run thumbs -- <template>`        | Make the preset thumbnails (`--song <file> --at <s>` for a real track)                                                                                                 |

Notes: dev scripts in `scripts/` run with `tsx` and compile as CommonJS, so no top-level
`await` (wrap in `main()`). Shared helpers live in `src/lib/` so the app can reuse them.
