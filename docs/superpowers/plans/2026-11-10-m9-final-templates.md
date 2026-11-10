# M9 Final Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the last eight visualizer templates (spec §5.1–5.8), each on its own branch and pull
request.

**Architecture:** exactly as M8: each template is a HyperFrames project in `templates/<id>/` with
an `index.html` that declares its settings and draws from the song time, a pure
`assets/<short>-motion.js`, the shared `viz-toolkit.js`, presets with thumbnails, and Vitest tests.

**Tech Stack:** HyperFrames 0.9.10, plain WebGL + 2D canvas, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-m9-final-templates-design.md`

## Global Constraints

- Every rule in CLAUDE.md's "Template rules" section, and M8 spec §4 (standard settings, ids,
  order; the font and beatRange option lists copied verbatim from Halo Rings, plus `Orbitron` for
  Late Show and Hyper Tunnel).
- `npm run check` and `npm run check:templates` green before every commit; never weaken the
  quiet-vs-loud reaction check.
- Never commit music, video, `storage/`, `test-renders/` or generated `assets/song.wav` /
  `assets/audio-data.js`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test track: a copy of the cached T-REX outside the repo (never copied into the repo).

## Review Focus

1. A section export: timers show the song time; seeded effects (arcs, static, glitches,
   lightning) match the full render for the same song time.
2. Long titles (60 characters) fit their layout.
3. Silence draws a calm frame: no NaN, no blank screen.
4. No picture uploaded: a designed fallback, never a hole or a broken image.
5. Live settings changes in the preview do not leak WebGL contexts.

---

### The per-template procedure (Tasks 1–8)

Exactly M8 plan's per-template procedure (steps 1–10: motion tests first, motion module, template
test, build, `check:templates`, look at frames incl. a 60-character title and each enum look,
thumbnails, 30 s GPU render with `--set title=T-REX --set artist=AXIOM` and a `--phone` copy,
CLAUDE.md tick and render speed, check, commit `feat: <Name> template`). References to copy
structure from: `templates/halo-rings/` (WebGL, titles, ring kit), `templates/nova-streak/`
(cover image), `templates/neon-sundown/` (grid, sun, VHS), `templates/afterglow/` (song clock,
timer, layouts), `templates/particle-horizon/` (dot surface).

### Task 1: Deep Swell (`deep-swell`, motion `swell-motion.js`): spec §5.1
### Task 2: Silk Lights (`silk-lights`, motion `silk-motion.js`): spec §5.2
### Task 3: Late Show (`late-show`, motion `show-motion.js`): spec §5.3
### Task 4: Night Flight (`night-flight`, motion `flight-motion.js`): spec §5.4
### Task 5: Live Wire (`live-wire`, motion `wire-motion.js`): spec §5.5, adds toolkit `lightningPath`
### Task 6: Static Tower (`static-tower`, motion `tower-motion.js`): spec §5.6
### Task 7: Hyper Tunnel (`hyper-tunnel`, motion `tunnel-motion.js`): spec §5.7
### Task 8: Moon Jelly (`moon-jelly`, motion `jelly-motion.js`): spec §5.8

**Branches:** Task 1 on `feat/m9-final-templates` (with the spec and plan). Each later task on
`feat/m9-<id>`, branched from the previous task's branch. One pull request per branch, merged in
order, only when the owner says so.
