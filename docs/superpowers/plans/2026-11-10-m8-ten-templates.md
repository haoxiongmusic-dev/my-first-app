# M8 Ten Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** ten new visualizer templates (spec §6.1–6.10), each on its own branch and pull request.

**Architecture:** each template is a HyperFrames project in `templates/<id>/`, built like the M6
templates: an `index.html` that declares its settings and draws from the song time, a pure
`assets/<short>-motion.js` with the motion maths, the shared `viz-toolkit.js` (now with the song
clock and line kit), presets with thumbnails, and Vitest tests.

**Tech Stack:** HyperFrames 0.9.10, plain WebGL + 2D canvas (three.js only for Black Crown and
Cube Core), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md`

## Global Constraints

- Every rule in CLAUDE.md's "Template rules" section (seeded randomness, no `Math.random`/
  `Date.now`/timers, 8-bit render targets only, GPU-safe shader maths, subtle slow grain,
  `data-song-length`, live `settings`/`preview` channels look identical to a render, no DOM
  measuring in `onUpdate`, image settings via the load event).
- The standard settings, ids and order from spec §4, then each template's extra fields; the font
  and beatRange option lists copied verbatim from Halo Rings.
- `npm run check` and `npm run check:templates` green before every commit.
- Never commit music, video, `storage/`, `test-renders/` or generated `assets/song.wav` /
  `assets/audio-data.js`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test track: `C:\Users\ydogg\Downloads\AXIOM\Hardlight\T-REX.wav` (never copied into the repo).

## Review Focus

1. A section export: timers must show the song time (song clock), and seeded effects must match
   the full render: test motion maths with a sliced analysis.
2. Long titles (60 characters) must fit their layout, never overflow the frame.
3. Silence (the start of a song) must draw a calm frame: no NaN, no blank screen.
4. The 360p live preview: thin lines must stay visible (Nova Streak's `thin()` minimum-size rule).
5. Settings changed live in the preview must not leak WebGL contexts (`trackGl`, rebuild once).

---

### Task 1: The song clock and line kit (done, commit 94e61c8)

`songClock`, `formatClock`, `mirrorBars`, `smoothSpectrum`, `scopeLine` in the toolkit, typed in
`viz-toolkit.d.ts`, tested in `src/lib/viz-toolkit.test.ts`; `sliceAnalysis` writes
`songDuration`.

### The per-template procedure (Tasks 2–11)

Each of Tasks 2–11 builds one template, `<id>`, from its spec section, in these steps. The
reference implementations to copy structure from are `templates/halo-rings/` (plain WebGL,
titles, background picture), `templates/nova-streak/` (cover image setting),
`templates/neon-sundown/` (VHS/grain, cover) and `templates/prism-heart/` (three.js).

**Files:**
- Create in `templates/<id>/`: `index.html`, `template.json`, `hyperframes.json` (copy Halo
  Rings'), `assets/<short>-motion.js`, `assets/viz-toolkit.js` (via `npm run sync:toolkit`),
  `assets/background.jpg` (copy Halo Rings') if the template uses the background picture,
  `presets/*.jpg` (via `npm run thumbs -- <id>`)
- Create: `src/lib/<id>.test.ts`, `src/lib/<id>-motion.test.ts`
- Modify: `src/lib/repo-hygiene.test.ts` (add `templates/<id>/assets/audio-data.js` and
  `templates/<id>/assets/song.wav`), `CLAUDE.md` (status line and render speed)

- [ ] **Step 1: Motion tests first.** `src/lib/<id>-motion.test.ts`: the motion maths from the
  spec section (caps, rest state in silence with no NaN, time-only motion, seeded choices equal
  for the same song time in a section and the full song). Run → FAIL (no module).
- [ ] **Step 2: Motion module.** `assets/<short>-motion.js` (pure, no DOM, UMD like
  `halo-motion.js`). Run → PASS.
- [ ] **Step 3: Template test.** `src/lib/<id>.test.ts` shaped like `halo-rings.test.ts`: the
  settings (ids, order, defaults, enum options), groups, basic, content, presets (names, values,
  thumbnail paths), the rules (loads the motion module and toolkit, no `Math.random`/
  `Date.now`/`setTimeout`/`setInterval`, no `HALF_FLOAT`/`OES_texture`). Run → FAIL.
- [ ] **Step 4: Build the template** to the spec section. Run `npm run sync:toolkit` and
  `npm run template:assets`. Run the template test and `repo-hygiene` → PASS.
- [ ] **Step 5: Check.** `npm run check:templates` → PASS, including the quiet-vs-loud
  reaction (raise the template's reaction if it fails; never weaken the check).
- [ ] **Step 6: Look at it.** `npm run render -- <id> "<T-REX>" --start 60 --end 64 --preview`;
  read frames on and between beats, at least one with a 60-character title and one per
  enum-driven look (layout/behaviour/style). Fix what does not match the spec section.
- [ ] **Step 7: Thumbnails.** `npm run thumbs -- <id> --song "<T-REX>" --at 70`; the template
  test's thumbnail check → PASS.
- [ ] **Step 8: Real GPU.** `npm run render -- <id> "<T-REX>" --start 60 --end 90` (in the
  background); record the total time; check frames are not blank and react. Make a `--phone`
  copy (< 30 MB) and keep its path for the owner.
- [ ] **Step 9: Docs and checks.** CLAUDE.md: tick the template under M8 with spec/plan paths,
  add its render speed to Machine facts. `npm run check` and `npm run check:templates` → PASS.
- [ ] **Step 10: Commit** `feat: <Name> template`.

### Task 2: Sky Pillar (`sky-pillar`, motion `pillar-motion.js`): spec §6.1
### Task 3: Afterglow (`afterglow`, motion `afterglow-motion.js`): spec §6.2
### Task 4: Red Letter (`red-letter`, motion `letter-motion.js`): spec §6.3
### Task 5: Signal Dish (`signal-dish`, motion `dish-motion.js`): spec §6.4
### Task 6: Moon Tide (`moon-tide`, motion `tide-motion.js`): spec §6.5
### Task 7: Neon Coil (`neon-coil`, motion `coil-motion.js`): spec §6.6
### Task 8: World Orbit (`world-orbit`, motion `orbit-motion.js`): spec §6.7
### Task 9: Ember Mesh (`ember-mesh`, motion `mesh-motion.js`): spec §6.8
### Task 10: Black Crown (`black-crown`, motion `crown-motion.js`, three.js): spec §6.9
### Task 11: Cube Core (`cube-core`, motion `cube-motion.js`, three.js): spec §6.10

**Branches:** Task 2 on `feat/m8-ten-templates` (with the spec, plan and Task 1). Each later
task on `feat/m8-<id>`, branched from the previous task's branch. One pull request per branch,
targeting `main`, merged in order, only when the owner says so.
