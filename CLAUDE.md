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
- [ ] M2 analyzer · M3 **Particle Horizon (Sunlight style), the first and only template until it's a success** · M4 editor + preview · M5 export · M6 more templates (one at a time, spec §14) · M7 polish

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
- Every template must pass `npx hyperframes check`.

## Machine facts

- Windows 11; Node 26; Python 3.14 + NumPy; FFmpeg 8; Git. GPU used for rendering: Intel
  UHD 620 (an NVIDIA Quadro P500 is present but not used by Chrome).
- Final-quality render ≈ 4× song length (4:12 song → 17 min). Analysis ≈ 4 s per song.
- Test tracks: `C:\Users\ydogg\Downloads\AXIOM\` (e.g. `T-REX.wav`). **Never copy music into
  the repo**: it is public.

## Working practices

- `main` always works; build each milestone on a branch and merge via pull request.
- Small commits; run tests/checks first. Never commit `storage/`, `test-renders/`, audio or video.
- The owner often follows along from a phone (Remote Control): files sent to them must be
  under 30 MB, so make phone-sized copies of videos.

## Commands

| Command            | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `npm run dev`      | Start the app at http://localhost:3000 (reloads as you edit)                  |
| `npm run build`    | Make a production build; catches type and build errors                        |
| `npm run check`    | **Run before every commit**: lint, formatting, type check, all tests          |
| `npm test`         | TypeScript tests (Vitest), `src/**/*.test.ts`                                 |
| `npm run test:py`  | Python analyzer tests (pytest), `analyzer/tests/`                             |
| `npm run lint`     | ESLint: catches likely mistakes                                               |
| `npm run format`   | Prettier: tidy all code formatting                                            |
| `npm run doctor`   | Check this PC has Node, FFmpeg, ffprobe, Python, NumPy and HyperFrames 0.9.10 |
| `npm run setup:py` | Create/update the analyzer's Python environment (`analyzer/.venv`)            |

Notes: dev scripts in `scripts/` run with `tsx` and compile as CommonJS, so no top-level
`await` (wrap in `main()`). Shared helpers live in `src/lib/` so the app can reuse them.
