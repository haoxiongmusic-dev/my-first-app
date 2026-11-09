# Milestone 8: ten more templates: Design Spec

Date: 2026-11-10
Status: **the owner approved the approach, names and order (2026-11-10) and asked for the work
to go ahead overnight without stopping. They review this document, and each template's video,
in the morning.**
Builds on: [the app design](2026-11-04-music-visualizer-app-design.md) (template contract §6),
the M6 templates (Halo Rings' ring kit, Nova Streak's image setting, Neon Sundown's VHS look,
Prism Heart's three.js rules), and the
[visualizer catalog](../../research/2026-11-04-visualizer-catalog.md).

## 1. Summary

Ten new templates. Each one is our own take on a Videobolt reference, with our own name and
artwork, all drawn in code:

| # | Our name | Reference | In one line |
|---|---|---|---|
| 1 | **Sky Pillar** | Ascension Pulse | A smoky beam of light comes down to a lone figure; a stack of light lines flares at its tip |
| 2 | **Afterglow** | Night Lights | Your own picture, a crisp dotted line of mirrored hairline bars, a boxed progress bar; layout presets |
| 3 | **Red Letter** | Dark Frequency | Scratched black-and-white film, a spaced title with one red letter that jumps on the beat, an oscilloscope line |
| 4 | **Signal Dish** | Star Dance | A starry sky over a sunset horizon, a radio dish that slowly turns, hairline spectra on the horizon |
| 5 | **Moon Tide** | Ocean of Sound | A moonlit sea with a ring of bars lying flat on the water, slowly turning |
| 6 | **Neon Coil** | Neon Helix | A twisting fan of neon lines, your cover art, a glowing line with pulsing blobs |
| 7 | **World Orbit** | Universal Visualizer | A planet in space with your gold title orbiting it like a ring |
| 8 | **Ember Mesh** | Pulsing Spheres | A huge waving sheet of heat-coloured dots with a swooping camera, your cover in the middle |
| 9 | **Black Crown** | FerroPulse | A dark liquid under a fiery sky; black magnetic spikes burst out of it on the bass |
| 10 | **Cube Core** | Techno Cube | Three nested neon wireframe cubes that snap to new angles on the beat, with a sci-fi readout |

Two shared pieces are built once, with the first template that needs them:

- **The song clock** (toolkit): the elapsed time, the song length and the progress fraction, for
  the timers and progress bars of six templates. It always shows the real song time, also in a
  section export.
- **The line kit** (toolkit): thin line spectra, mirrored hairline bars and an oscilloscope
  line, used by Sky Pillar, Afterglow, Red Letter, Signal Dish and Neon Coil.

## 2. Shared understanding

**What the owner chose (2026-11-10):**
- these ten, in this order (easiest first), with these names
- one shared design document, reviewed once
- each template built and checked separately, on its own branch and pull request, with a short
  video for the owner to approve before merging
- the work goes ahead overnight without stopping for questions; nothing is merged until the
  owner says so

**How the references move** was studied from each one's 15-second Videobolt preview, frame by
frame, in the owner's Chrome on 2026-11-10. The notes in each section below come from that.

**Assumed (the owner can correct):**
- every look detail and preset below (names, colours)
- Afterglow uses the app's background picture (Videobolt's version plays a video; our app takes
  pictures). With no picture uploaded it shows a generated night-city blur
- World Orbit's planet is generated (or your cover art wrapped on the globe), never a photo
- the figure in Sky Pillar is a simple drawn silhouette, and Signal Dish's dish is a drawn
  silhouette

**Success, for each template:** the owner picks a preset, exports a song, and gets:
- the look described below, clearly reacting to the music
- an identical picture on every export
- a 30 s Final section that renders in about the same time as the M6 templates (≤ 6 min)
- `npm run check:templates` passing

## 3. Scope

**In:** the song clock and line kit; `templates/<id>/` for each of the ten with presets and
thumbnails; tests; CLAUDE.md notes (status, render speeds).

**Out:** video backgrounds; a Colors-panel palette picker; the 7 remaining catalog templates;
changes to the editor (the generated form already handles every setting type used here).

## 4. Shared rules for all ten

- Drawn at 1920×1080, following CLAUDE.md's template rules: draw only from the time, seeded
  randomness (`mulberry32`), 8-bit render targets, shader maths safe on every GPU, slow subtle
  grain, settings sent live in the preview look identical to a render.
- Plain WebGL with the toolkit, unless the section says three.js (only Black Crown and Cube
  Core, following Prism Heart's three.js rules).
- Motion maths goes in a pure, unit-tested `templates/<id>/assets/<short>-motion.js`, as in M6.
- **Standard settings** every template has unless its section says otherwise:

  | Group | Field id | Type | Default |
  |---|---|---|---|
  | Text | `title` | string (max 60) | `SONG NAME` |
  | | `artist` | string (max 60) | `ARTIST NAME` |
  | | `font` | enum, the usual eight | per template |
  | Colors | `mainColor`, `accentColor` | color | per template |
  | Effects | `intensity` | number 0.2–2, step 0.1 | 1 |
  | Audio | `beatRange` | enum, the usual options | `kick` |
  | | `spectrumLow` / `spectrumHigh` | number 30–16000 Hz | per template |
  | | `spectrumBoost` | enum 1×/2×/4×/8× | per template |
  | | `bandCount` | number 10–100 % | per template |

  **Content** tab: `title`, `artist`, plus any image setting. Each section lists only its extra
  fields and defaults. Templates with a timer also get `showTimer` (boolean, default true).
- Every template has 4 presets that set colours (and, where noted, behaviour or layout).

## 5. The two shared pieces (toolkit)

### 5.1 The song clock

Section exports today lose the whole song's length: `sliceAnalysis` sets `duration` to the
section's length. So:

- `sliceAnalysis` (`src/lib/jobs.ts`) also writes `songDuration`: the whole song's length.
- `createAudio` exposes `songDuration: data.songDuration || data.duration`.
- New pure toolkit functions:

| Function | What it does |
|---|---|
| `songClock(audio, t)` | `{ elapsed, total, fraction }` in song seconds: `elapsed = clamp(audio.songStart + t, 0, total)`, `total = audio.songDuration`, `fraction = elapsed / total` (0 when total is 0) |
| `formatClock(seconds)` | `m:ss`, or `h:mm:ss` from one hour (same output as the editor's `formatClock`) |

### 5.2 The line kit

| Function | What it does |
|---|---|
| `mirrorBars(spectrum, count, fromCentre)` | `count` values for bars along a line. `fromCentre` true: the bass in the middle, mirrored out to both ends. False: the bass at the left end. Reads between bands by linear interpolation |
| `scopeLine(audio, t, count, seed)` | `count` values in −1..1 for an oscilloscope-style line: thin spikes whose height follows the spectrum (bass at the ends of the line nearest the title), signs and jitter from `mulberry32(seed + floor((audio.songStart + t) × 30))`, so it changes 30 times a second and a section matches the full render. Silence gives all zeros |
| `smoothSpectrum(spectrum, radius)` | A box-blurred copy, for soft curves (Neon Coil's blobs, Moon Tide's peaks) |

All three are pure and Vitest-tested, as the ring kit is.

## 6. The ten templates

Each section: **look**, **motion**, **extra settings** (beyond §4), **presets**, **build notes**.

### 6.1 Sky Pillar (`sky-pillar`), after Ascension Pulse

**Look.** Near-black charcoal backdrop with faint drifting blue fog (seeded value noise, slow).
A dark reflective floor across the bottom 20 % with faint ripple lines. A vertical beam of light
comes down from the top edge to a point at y ≈ 470: a white-hot core that narrows to the tip,
with smoky turbulent edges in `mainColor` (domain-warped noise in a shader, drifting upward).
Below the tip, standing on the floor at y ≈ 600, a small dark human silhouette (≈ 70 px tall,
drawn as a path) in a soft pool of glow. At the tip, a mirrored horizontal line spectrum: a stack
of 5 thin horizontal lines, each line's half-width set by one band. Title in the lower third:
widely letter-spaced serif capitals with a soft glow, the artist small and spaced under it.

**Motion.**
- Beam: core width and brightness `0.7 + 0.5 × loud × intensity`; the smoke speeds up a little
  with `flux`.
- Tip lines: 5 lines, 6 px apart, half-width up to 160 px from bands (`mirrorBars`, bass on the
  middle line); faded ends.
- Flare: on each beat, a thin horizontal flare through the tip, `beatEnvelope` release 0.25 s.
- Title pulse (`scaleOnBeat`): `1 + 0.03 × env`.

**Extra settings:** `scaleOnBeat` (true), `showFigure` (true), `fogAmount` (0–100 %, 60).
Defaults: font `EB Garamond`, main `#7fb8ff`, accent `#2a5cff`, spectrum 30–1000 Hz, boost 2×,
bands 55 %.

**Presets:** Original (`#7fb8ff`/`#2a5cff`), Crimson (`#ff7a7a`/`#c0182a`), Verdant
(`#8dffb0`/`#18a04a`), Gold (`#ffd28a`/`#d0821c`).

**Build notes:** one full-screen shader for fog, beam and floor; the lines and the silhouette in
a second pass; blur glow as in Halo Rings.

### 6.2 Afterglow (`afterglow`), after Night Lights

**Look.** The owner's background picture fills the frame with a slow push-in (scale 1 → 1.06
over 60 s, then back, a smooth cosine) and a darkening vignette. Without a picture: a generated
night-city blur (bokeh circles and long horizontal light streaks in the two colours, seeded).
A thin dotted horizontal line (2 px dots every 6 px) across the middle 70 % at y = 540. On it,
mirrored thin vertical hairline bars (2 px wide, equal length up and down), sparse: tall
spikes near the bass end, many tiny ones. "ARTIST – TITLE" small under it, and under that a
boxed progress bar (an outlined rectangle that fills left to right) with the timer.

**Motion.** Bars: `mirrorBars` (bass at the left end), length up to 180 px each way × intensity,
squared like Halo Rings'. Progress bar and timer from the song clock. A gentle overall beat
brightness lift (5 %) on `beatEnvelope`.

**Layout presets** (the reference's idea): the `layout` enum moves and sizes the parts.

| `layout` | What is big |
|---|---|
| `classic` | as above |
| `bigTitle` | title 110 px above the line, artist under it; the bar small |
| `bigTimer` | the elapsed time 150 px under the line, the progress bar thin |
| `player` | a music-player card: rounded dark glass panel 900 × 260 with title, artist, progress bar, time either end and the spectrum inside |

**Extra settings:** `layout` (`classic`), `showTimer` (true), `backgroundDim` (0–100 %, 35),
`showBackground` (true), `backgroundBlur` (0–100 %, 0). Defaults: font `Montserrat`, main
`#ffffff`, accent `#ff3b4e`, spectrum 30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (`classic`), Big Title (`bigTitle`), Big Timer (`bigTimer`), Music Player
(`player`): all white with the red accent.

**Build notes:** 2D canvas is enough (no WebGL), drawn per frame from the time.

### 6.3 Red Letter (`red-letter`), after Dark Frequency

**Look.** A charcoal scratched-film texture: grey value noise, a few seeded scratch lines and
dust specks that change 6 times a second, soft smoke patches drifting, dark vignette. Black and
white except one letter. The title across the centre in wide-spaced condensed capitals
(Oswald by default), each letter with a faint vertical ghost streak rising above it. One letter
is drawn in `accentColor`. An oscilloscope line runs in from both screen edges to the title's
ends (`scopeLine`), flat in quiet parts, spiky in loud ones. The artist small and spaced
under the title.

**Motion.**
- The red letter: on each beat (from the beat list, `recentHits`) the red moves to another
  letter, chosen by `mulberry32(seed + beat index)` (never a space, never the same letter twice
  in a row). Before the first beat it is letter 1.
- Brightness: letters flash toward white on beats (`beatEnvelope`, release 0.15 s) and settle
  at 70 % grey.
- Glitch (`glitchOnBeat`): on strong beats a few letters jump sideways 4–12 px for 2 frames
  (seeded by the frame).
- Scope line: spike heights × 160 px × intensity, tallest next to the title.

**Extra settings:** `glitchOnBeat` (true), `grain` (0–100 %, 50). Defaults: font `Oswald`, main
`#e8e8e8`, accent `#ff2a2a`, spectrum 30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (`#e8e8e8`/`#ff2a2a`), Cyan (`#e8e8e8`/`#2ad9ff`), Toxic
(`#e8e8e8`/`#9dff2a`), Amber (`#f0e6d0`/`#ffa31a`).

**Build notes:** 2D canvas for text, WebGL for the film texture (grain ≤ 0.02, ≤ 6 updates/s).

### 6.4 Signal Dish (`signal-dish`), after Star Dance

**Look.** A night sky: deep blue gradient to the horizon, 900 seeded stars (a few twinkle
slowly), a faint Milky-Way band. A black land silhouette across the bottom 9 % (seeded ridge).
A warm sunset glow on the horizon centre in `accentColor`, fading to the sides. A radio
telescope dish silhouette centred on the horizon (≈ 120 px tall: dish, feed arm, stand).
Behind it a faint semicircle of thin spectrum rays (`ringAngles` over 180°). On the horizon to
the left and right, thin glowing vertical hairline spectra (mirrored about the centre). The
title at y ≈ 430, spaced thin capitals with a horizontal lens streak behind; the artist small
under it.

**Motion.**
- The dish turns slowly: its aim swings between −40° and +40° on a smooth path from the song
  time (period ≈ 40 s); drawn by tilting the dish shape.
- Semicircle rays: length from the spectrum, up to 120 px, soft `accentColor`.
- Horizon hairlines: 2 px, up to 260 px tall, bass nearest the dish.
- Shooting stars: about one every 6 s, seeded by song time, a 0.6 s streak.
- Horizon glow brightens 15 % with `loud`.

**Extra settings:** `shootingStars` (true), `scaleOnBeat` (false). Defaults: font `Montserrat`,
main `#cfe6ff`, accent `#ff8a1f`, spectrum 30–1000 Hz, boost 2×, bands 100 %.

**Presets:** Original (`#cfe6ff`/`#ff8a1f`), Polar (`#d8fff6`/`#2affc8`), Dusk
(`#ffd8f0`/`#ff3d8a`), Deep Space (`#d0d4ff`/`#6a4dff`).

**Build notes:** WebGL sky and glow; the dish, ridge and lines as 2D paths on a canvas on top.

### 6.5 Moon Tide (`moon-tide`), after Ocean of Sound

**Look.** A deep navy sky with soft haze at the horizon (y = 430), a small bright full moon at
the top centre with a soft halo, and a dashed vertical moonlight path on the dark water below
it (horizontal dashes that shimmer). On the water, an elliptical ring (a circle of radius
480 px lying flat, seen in perspective: an ellipse 960 × 180 centred at y = 640) of thin
vertical bars standing up out of the water, in `mainColor`, with dim reflections below the
waterline. Faint concentric ripple ellipses spread out from the ring. Title below the ring in
small spaced capitals, the artist under it, then a thin progress line with a dot and the timer.

**Motion.**
- Bars: 120 around the ring; heights from the spectrum (smoothed so peaks bunch into
  "mountains"), up to 140 px × intensity, nearer bars taller (perspective scale by depth).
- The pattern turns slowly around the ring: `spin` %, 6°/s at 100 %.
- Ripples: a new ripple ellipse on each strong beat, growing over 3 s and fading.
- Moonlight dashes shimmer with seeded noise (slow).
- Calm: no shake.

**Extra settings:** `spin` (0–200 %, 100), `showTimer` (true). Defaults: font `Montserrat`,
main `#7fe9ff`, accent `#2f6bff`, spectrum 30–1000 Hz, boost 2×, bands 40 %.

**Presets:** Original (`#7fe9ff`/`#2f6bff`), Silver (`#e9eef7`/`#8090b0`), Lagoon
(`#7dffcf`/`#15a28a`), Violet Night (`#d9a8ff`/`#6b3dff`).

**Build notes:** WebGL: sky/water shader, then bars as quads (back half drawn before the front
half so the ring overlaps correctly).

### 6.6 Neon Coil (`neon-coil`), after Neon Helix

**Look.** Dark navy background with faint blue bokeh and a faint dot grid on the left; rare thin
horizontal glitch streaks near the top. A big fan of ≈ 40 parallel glowing curved lines (neon
tubes) sweeps from the bottom-left up and over to the right: a twisted ribbon, each line a
helix-like curve offset in phase; white-hot where they bunch, `mainColor` falloff. Left-middle:
the cover art (square, 300 px) with a thin glowing border. Right of it: the artist in
`accentColor` (glowing, techno look: the chosen font, weight 700), the title small under it.
A long glowing horizontal line from the cover to the right edge; on it, symmetric blobs that
bulge up and down with the spectrum (bass at the left). The timer small in `accentColor` below.

**Motion.**
- The coil twists slowly (phase advances with the song time) and pumps its brightness and
  spread with `beatEnvelope` (release 0.3 s).
- Blobs: `smoothSpectrum` values sampled at 12 points along the line; bulge height up to 50 px
  × intensity.
- Scale on beat (`scaleOnBeat`): the cover and text block `1 + 0.03 × env`.

**Extra settings:** `cover` (image, square), `scaleOnBeat` (true), `showTimer` (true).
Defaults: font `Outfit`, main `#3d8bff`, accent `#ff4fd8`, spectrum 30–1000 Hz, boost 2×,
bands 75 %.

**Presets:** Original (`#3d8bff`/`#ff4fd8`), Matrix (`#2aff6a`/`#c8ff2a`), Sunset
(`#ff7a2a`/`#ffd12a`), Ice (`#9ae8ff`/`#ffffff`).

**Build notes:** WebGL lines as thin quads with additive blending, then the blur glow; cover
follows Nova Streak's image rules (load event redraw, a failed load just leaves it out).

### 6.7 World Orbit (`world-orbit`), after Universal Visualizer

**Look.** Deep space: stars, a blue nebula haze, a slow camera drift (the backdrop slides
≤ 40 px over a minute), and a warm diagonal light-leak streak that sweeps across now and then.
Centre: a slowly turning planet (radius 230 px) with a bright rim light: by default generated
(ocean `accentColor`-tinted blues, seeded noise continents, clouds); with a cover image, the
cover is wrapped on the globe instead. Around it, very fine radial spectrum rays from the rim.
The title in big bold gold capitals **orbits the planet** like a ring: letters spread around an
ellipse (radius 420 × 70 px, slightly tilted), the front half in front of the planet, the back
half hidden behind it, letter size and brightness by depth. The artist small under the planet.

**Motion.**
- Orbit: one turn every `orbitSeconds` (default 12 s), from the song time.
- Planet: turns once every 60 s; scale `1 + 0.03 × beatEnvelope` (`scaleOnBeat`).
- Rays: 180 rays, length up to 60 px × intensity, faint, brighter with `loud`.
- Light leak: a sweep every ~14 s, seeded by song time.

**Extra settings:** `cover` (image, square; optional planet texture), `orbitSeconds` (6–30, 12),
`scaleOnBeat` (true). Defaults: font `Montserrat`, main `#ffcc66` (title gold), accent
`#2a6cff` (planet/space), spectrum 30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (gold/blue), Silver (`#e8eef8`/`#3a4a6a`), Mars (`#ffd2a0`/`#c0502a`),
Emerald (`#c8ffd8`/`#14806a`).

**Build notes:** WebGL sphere shader (ray–sphere in a full-screen pass, no 3D library); letters
drawn as textured quads from a 2D-canvas atlas, depth-sorted around the planet.

### 6.8 Ember Mesh (`ember-mesh`), after Pulsing Spheres

**Look.** Black background. A huge sheet (a grid of 220 × 70 dots) coloured as a heat map across
its width: `mainColor` (yellow) in the middle band → orange → red → `accentColor` (purple) at the
edges. The sheet rolls in big waves; the camera swoops: side-on views, steep close-ups where
single dots read as spheres, and the sheet folding up into tall arches. The overlay in the
centre: square cover (220 px), a boxed "ARTIST – TITLE" (white, the chosen font in capitals, a
dark box with a light border), a smooth white line waveform under it, and a small boxed timer;
all pulse slightly on the beat.

**Motion.**
- Sheet height: travelling waves from the song time plus the spectrum (`spectrumLow` 30,
  `spectrumHigh` 200 by default): the bass lifts the waves, × intensity.
- Dot size grows with the local wave height (the "pulsing spheres").
- Camera: a seeded sequence of 6 poses; it glides between poses and **jumps to the next pose
  on strong beats** at most once every 4 s (`cameraMoves` on), with a 0.25 s ease. Poses and
  timing come only from the song time and the beat list, so a section matches the full render.
- Overlay pulse: `1 + 0.03 × beatEnvelope`.

**Extra settings:** `cover` (image), `cameraMoves` (true), `showTimer` (true), `dotSize`
(50–200 %, 100). Defaults: font `Outfit`, main `#ffd21f`, accent `#7a2cff`, spectrum
30–200 Hz, boost 1×, bands 50 %.

**Presets:** Original (`#ffd21f`/`#7a2cff`), Ocean (`#7dffef`/`#1a3cff`), Toxic
(`#d8ff3a`/`#0f8a4a`), Candy (`#ffd0f0`/`#ff2a8a`).

**Build notes:** reuse Particle Horizon's point-sprite approach (one draw call of 15,400
points, size by depth); the line waveform from `smoothSpectrum`.

### 6.9 Black Crown (`black-crown`), after FerroPulse

**Look.** The upper 65 %: a fiery nebula sky (domain-warped noise in `mainColor` orange and
`accentColor` deep red over black, slowly churning). The lower 35 %: a dark glossy liquid
plane in perspective with the sky reflected in it; concentric elliptical ripples spread from the
centre. In the centre of the liquid, a **ferrofluid crown**: a cluster of black glossy spikes
(tallest in the middle, fanning outwards), lit by the sky colours. Small at the top centre: a
thin white bar spectrum, "ARTIST – TITLE", a progress line and the timer.

**Motion.**
- Crown height follows the bass (`spectrumLow`–`spectrumHigh` 30–150 Hz, smoothed with a 0.15 s
  release): flat at silence, up to 300 px × intensity. Each spike's height wobbles with its own
  seeded phase; spikes sharpen as the crown grows.
- Ripples: a new ring on each strong beat and a slow constant ring every 2 s.
- Sky brightness flares 20 % with `loud`.

**Extra settings:** `spikeCount` (12–40, 24), `showTimer` (true). Defaults: font
`Montserrat`, main `#ff8a1f`, accent `#8a1a0a`, spectrum 30–150 Hz, boost 2×, bands 50 %.

**Presets:** Original (orange/red), Toxic (`#9dff3a`/`#0a5a2a`), Cobalt (`#3ad1ff`/`#0a2a8a`),
Amethyst (`#d07aff`/`#3a0a6a`).

**Build notes:** three.js (Prism Heart's rules: 8-bit targets, colour management off): spikes
as cones on a shared geometry with a glossy shader that reflects a sky texture; the sky and the
water as full-screen shader passes.

### 6.10 Cube Core (`cube-core`), after Techno Cube

**Look.** A near-black room with a glossy floor that reflects a coloured glow under the cubes.
Centre: three nested neon wireframe cubes (outer `mainColor`, middle `accentColor`, inner a mix),
thin glowing edges. Left: the artist small, the title big (the chosen font, weight 700, a
`mainColor`→`accentColor` gradient), the timer small. Right: a sci-fi readout: `MODE:` and the
behaviour name, `POWER` with a bar following loudness, and rows `CUBE_1 / CUBE_2 / CUBE_3` with
changing numbers and an `ACTIVE` tag on the cube that last moved.

**Motion (the behaviour presets, the reference's best idea):** the `behaviour` enum.

| `behaviour` | On each beat | Between beats |
|---|---|---|
| `snap` | one cube (in turn) snaps instantly to a new seeded rotation; edges flash | hold still |
| `glide` | a new target rotation | ease towards it over 0.6 s |
| `raver` | all three snap, the floor glow flashes, the sizes jump 10 % | hold |
| `drift` | edges flash only | all three turn slowly and continuously |

Rotations come from `mulberry32(seed + beat index)`; the beat index from the beat list, so any
frame can be drawn alone. Edge brightness `0.6 + 0.4 × beatEnvelope`.

**Extra settings:** `behaviour` (`snap`), `showReadout` (true), `showTimer` (true). Defaults:
font `Oswald`, main `#9a4dff`, accent `#ff8a2a`, beat range `kick`, no spectrum settings except
`spectrumBoost` for the power bar.

**Presets:** Original (`snap`, purple/orange), Glide (`glide`, `#2ad9ff`/`#ff4fd8`), Raver
(`raver`, `#ff2a6a`/`#ffe62a`), Drift (`drift`, `#7dffb0`/`#2a8aff`).

**Build notes:** three.js (`LineSegments` with a glow from a wide additive copy plus a blur
pass, all 8-bit), the floor reflection as a mirrored, darkened copy of the cubes; the readout in
HTML over the canvas.

## 7. Testing (each template)

| What | How |
|---|---|
| Song clock and line kit | Vitest: `songClock` in a section adds `songStart`, clamps at the ends, fraction 0 at total 0; `formatClock` matches the editor's; `mirrorBars` mirrored/bass-left cases; `scopeLine` same output for the same song time (section or full), zeros in silence; `sliceAnalysis` writes `songDuration` |
| Motion maths | Vitest per template: values capped, silence gives rest positions and no NaN, time-only motion, seeded choices repeat for the same song time |
| Template | Vitest per template: settings, groups, basic and content lists match this spec; presets and thumbnails exist; no `Math.random`, `Date.now` or timers; 8-bit targets only |
| Template rules | `npm run check:templates` (settings rules, `hyperframes check`, quiet vs loud) |
| Real GPU | A 30 s Final section of T-REX: not blank, reacts, timed; a phone-sized copy for the owner |
| Whole suite | `npm run check` before every commit |

## 8. Risks

| Risk | Plan |
|---|---|
| Ten templates is a lot to review | Each one is its own pull request with a 30 s video; the owner can reject one without the others |
| The three.js templates are slow | Follow Prism Heart's numbers; keep spike/edge counts modest; measure on the 30 s render |
| A look misses the owner's taste overnight | Every look value is in this document and in presets, so changes are quick; nothing merges without the owner |
| Toolkit changes ripple into the six existing templates | Only new functions are added (nothing existing changes); `sync:toolkit` copies them; the existing template tests and checks run before every commit |

## 9. Working practices

- **Branches:** `feat/m8-ten-templates` holds this spec, the plan, the song clock and line kit,
  and Sky Pillar (the first user). Each later template branches from the previous one and gets
  its own pull request targeting `main`, to be merged in order.
- Each template: plan task → build → tests → `npm run check` and `npm run check:templates` →
  30 s render → phone copy → commit → pull request. No merging until the owner says so.
- **CLAUDE.md:** the status line, the new toolkit pieces, and each render speed.
