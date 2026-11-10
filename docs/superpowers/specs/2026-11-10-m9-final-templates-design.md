# Milestone 9: the last eight templates: Design Spec

Date: 2026-11-10
Status: **the owner asked for the remaining catalog templates to be finished ("finish off the
final templates now", 2026-11-10) without stopping. They review this document, and each
template's video, afterwards; nothing merges until they say so.**
Builds on: [the M8 design](2026-11-10-m8-ten-templates-design.md) (its §4 shared rules, standard
settings and the song clock and line kit apply here unchanged), the
[visualizer catalog](../../research/2026-11-04-visualizer-catalog.md), and the templates already
built.

## 1. Summary

With these eight, every one of the catalog's 23 references has our own version (the other 15:
Halo Rings, Prism Heart, Neon Sundown, Iron Wraith, Nova Streak and M8's ten).

| # | Our name | Reference | In one line |
|---|---|---|---|
| 1 | **Deep Swell** | Particles Wave Visualizer | A close, steep view of a rolling blue particle sea that swells with the bass, your logo in the middle |
| 2 | **Silk Lights** | Beatwave Visualizer | Blurred neon colour bands streaming sideways, smooth line spectra top and bottom, your cover, tag pills |
| 3 | **Late Show** | Synthwave | An old CRT television in a dark room showing a synthwave scene: grid, mountains, sun, chrome title |
| 4 | **Night Flight** | Through Sky | Flying fast above moonlit clouds; a cockpit HUD of spectrum rings around your cover |
| 5 | **Live Wire** | Power Bass | A chrome loudspeaker on a cracked concrete wall pumping with the bass, electric arcs crawling to the edges |
| 6 | **Static Tower** | Storm Signal | A pyramid of old TVs showing your picture under a stormy sky; lightning on the hits |
| 7 | **Hyper Tunnel** | RoboWave | A chrome voxel robot in a VR headset inside a rushing neon sci-fi tunnel, under a HUD frame |
| 8 | **Moon Jelly** | Aqua Reverie | Glowing jellyfish drifting through deep water under light shafts, pulsing on the beat |

## 2. Shared understanding

**What the owner asked (2026-11-10):** finish the remaining catalog templates. The M8 way of
working stays: one shared design, each template on its own branch and pull request with a 30 s
video, built one after another without stopping, nothing merged until the owner says so.

**How the references move:** each one's 15-second Videobolt preview was studied as a frame sheet
in the owner's Chrome on 2026-11-10 (look only), on top of the catalog's notes. The look
paragraphs below come from that.

**Assumed (the owner can correct):** every name, look detail and preset below. Licensed art in the
references (RoboWave's robot, Through Sky's cockpit, Power Bass's 3D speaker, Storm Signal's TV
photos) is replaced by **three.js voxel models built in code** (the owner, 2026-11-10: "just use
three.js and voxel to draw the pictures"), like Iron Wraith's skull. Where a reference takes many pictures (Storm Signal's
14 media slots), ours takes one picture (the existing `image` setting) and varies it per screen.
Deep Swell's bokeh orbs are **off by default** (the owner removed Particle Horizon's orbs) and on
in one preset.

**Success, for each template:** the owner picks a preset, exports a song, and gets the look below,
clearly reacting to the music, identical on every export, a 30 s Final section in ≤ 6 min, and
`npm run check:templates` passing.

## 3. Scope

**In:** `templates/<id>/` for each of the eight with presets and thumbnails; tests; CLAUDE.md notes
(status, render speeds).

**Out:** video backgrounds; more than one picture per template (the editor has one upload card per
image setting, and a 14-slot form is out of scope); a Colors-panel palette picker; editor changes.

## 4. Shared rules

M8 spec §4 applies to all eight unchanged: drawn at 1920×1080, CLAUDE.md's template rules, plain
WebGL / 2D canvas with the toolkit, or three.js where a section says so, motion maths in a pure
tested `assets/<short>-motion.js`, the **standard settings** table (ids, types, ranges, order),
4 presets each, `showTimer` (default true) on templates with a timer. Text fields fit a
60-character title without leaving the frame. Image settings follow CLAUDE.md
(`{"type":"image","fit":"square","default":""}`, Content tab, redraw on `load`, a missing picture
draws a designed fallback, never a hole).

**Voxel models** (Late Show, Night Flight, Live Wire, Static Tower, Hyper Tunnel, Moon Jelly):
every object that stands in for licensed art is a three.js voxel model, built the way Iron Wraith
builds its skull: a **pure** builder module `assets/<name>-voxels.js` (no DOM, no three.js) returns
voxel lists `[x, y, z, shade]` per part, Vitest-tested (same output every time, sensible size,
parts in place); the page draws each part as one `InstancedMesh` of cubes slightly smaller than
the grid (the gaps read as voxel seams), lit with Iron Wraith's chrome/metal approach. All of
CLAUDE.md's three.js rules apply (`three-kit.js`, 8-bit `UnsignedByteType` targets everywhere,
coloured glows as additive sprites, build the renderer once, ColorManagement off with
`NoToneMapping` so preset colours come out as picked). Keep each model at most 15,000 voxels.
Moving parts (speaker cone, gauge needles, tentacles) are separate meshes moved or re-posed per
frame from the motion module.

Fonts: the usual eight (Halo Rings' list). Late Show and Hyper Tunnel add `Orbitron` to that
list as their default, with the font files copied from Iron Wraith's `assets/fonts/`.

No new toolkit pieces are planned. If a template needs a helper another one would reuse (the
lightning bolt is the likely one: Live Wire and Static Tower), it goes in the toolkit with tests,
added by the first template that needs it.

## 5. The eight templates

Each section: **look**, **motion**, **extra settings** (beyond M8 §4), **presets**, **build notes**.

### 5.1 Deep Swell (`deep-swell`), after Particles Wave

**Look.** Particle Horizon's dot-surface engine, seen closer and steeper: the camera sits low
over the surface looking down at ≈ 35°, so the sheet of dots fills the lower two thirds and
recedes to a soft horizon glow at y ≈ 330. Deep blue (`mainColor`) dots with brighter crests
(`accentColor`), fading into a dark navy haze. Optional large soft bokeh orbs drifting in front.
Centre: the owner's logo (image setting `logo`, shown as a circle ≈ 220 px with a thin ring; no
logo → a small glowing ring alone). Below it "ARTIST – TITLE" in one line.

**Motion.** The surface swells with the low end: wave height `base × (0.5 + 1.2 × low × intensity)`
where `low` is the 0–200 Hz energy (the default spectrum range); slow rolling swell along the
view direction; crest brightness follows loudness. The logo scales `1 + 0.04 × beatEnvelope`.
Bokeh orbs (when on): 40–80 seeded soft orbs of mixed sizes and blur drifting slowly,
brightness `0.6 + 0.4 × loud`. (The reference's sheet is a fine wireframe-like grid of dot rows
forming big dunes that rise diagonally from lower left to upper right, with a slightly rolled
camera, filling most of the frame.)

**Extra settings:** `logo` (image), `showBokeh` (false), `waveHeight` (0–100 %, 60),
`flowSpeed` (0–100 %, 40). Defaults: font `Montserrat`, main `#2a6dff`, accent `#9ad8ff`,
spectrum 30–200 Hz, boost 1×, bands 100 %.

**Presets:** Original (blue), Bokeh (blue, `showBokeh` on), Aurora (`#18d9a0`/`#c8ffe8`),
Violet (`#7a3cff`/`#f0b8ff`).

**Build notes:** start from `templates/particle-horizon/` (copy its surface shader and motion
module, then change camera, colours and the swell rule; do not change Particle Horizon itself).

### 5.2 Silk Lights (`silk-lights`), after Beatwave

**Look.** A black backdrop. Across the middle of the frame, a wide, heavily blurred neon glow
band (a long soft rounded slab, ≈ 70 % of the width and ≈ 25 % of the height, magenta/pink/blue
mixed from `mainColor` and `accentColor`, with brighter hot spots) that shimmers and streams
slowly sideways, darker vignette at the left and right ends. Across the lower third, a big smooth
glowing **wave spectrum line** (4 px with glow, a horizontal gradient `mainColor` → `accentColor`)
whose peaks rise up to ≈ 300 px into the glow band; a fainter, thinner copy runs along the top
(y ≈ 120). Left block (x ≈ 70, vertically centred): the cover (image `cover`, 290 px, rounded
corners 28 px); to its lower right a mini bar spectrum (40 hairline bars, up to 70 px); under
them "ARTIST – TITLE" in one line; under that up to **five tag pills** in two rows (filled rounded
pills, each a different tint mixed from the two colours, white text, e.g. `HIP HOP`), plus the
timer.

**Motion.** The glow band's hot spots drift sideways at different seeded speeds; its brightness
and height follow loudness and `flux`; on each beat it brightens (`beatEnvelope` release 0.3 s).
The wave line is a smooth curve through `smoothSpectrum` values (bass at the left, like the
reference), its peaks shaped (squared) so it is mostly calm with tall smooth peaks. The mini bars
follow the spectrum directly. The cover scales `1 + 0.025 × beatEnvelope`.

**Extra settings:** `cover` (image), `tag1` (`HIP HOP`), `tag2` (`NEW MUSIC`), `tag3`
(`ELECTRONIC`), `tag4` (`""`), `tag5` (`""`) (strings, max 20, empty hides the pill; on the
Content tab), `showTimer` (true). Defaults: font
`Poppins`, main `#ff2fb4`, accent `#2fd9ff`, spectrum 30–1000 Hz, boost 2×, bands 65 %.

**Presets:** Original (magenta/cyan), Sunset (`#ff7a2f`/`#ff2f6a`), Ocean (`#2f7aff`/`#2fffd0`),
Mono (`#e8e8f0`/`#8a8aa0`).

**Build notes:** 2D canvas; draw the bands at quarter resolution and scale up (cheap blur).
No-cover fallback: a gradient square with a note icon.

### 5.3 Late Show (`late-show`), after Synthwave

**Look.** A close-up of an old CRT television: the screen nearly fills the frame, framed by a
thick grey plastic bezel with rounded corners (only the bezel and a sliver of the darker cabinet
show at the frame edges). The screen bulges (barrel curve), with scanlines, a soft vignette and a
pale window-shaped glare in the top-left corner. On the screen, a synthwave scene in purple and
`mainColor` pink: a neon grid floor scrolling toward the viewer, a very bright horizon line
across the middle, dark low mountains behind it, a starry purple sky, a thin line spectrum on the
horizon (tall peaks near the left and right ends), the cover as a square in the centre standing
on the horizon (it glitches on beats), the title big above it in a slanted chrome style (bright
red-orange-to-yellow gradient face with a 3D extruded side going down and back), and the tagline
small under the horizon.

**Motion.** Grid scroll speed `1 + 0.6 × loud × intensity`; horizon spectrum (`mirrorBars`, bass
centre) up to 120 px; the sun's stripes breathe on the beat; the screen brightness flickers
subtly (seeded, ≤ 4 %, ≤ 6 changes/s) and dips briefly on strong hits (a "signal" roll line,
`beatEnvelope` release 0.2 s). The cover glitches on strong beats: 2–4 horizontal slices offset
sideways for ≤ 0.12 s, seeded by the beat's song frame. The camera drifts very slowly (seeded,
≤ 1°) so the voxel bezel catches the light.

**Extra settings:** `cover` (image), `tagline` (string, max 40, `SYNTHWAVE FOREVER`, Content
tab) — this template has no `artist` field: the tagline replaces it.
`crtEffect` (0–100 %, 70). Defaults: font `Orbitron`, main `#ff2fd0`, accent `#2fe8ff`, spectrum
30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (pink/cyan), Green (`#3dff6a`/`#c8ff3d`, a green-phosphor monitor), Sunset
(`#ff8a2f`/`#ff2f6a`), Ice (`#9ad8ff`/`#ffffff`).

**Build notes:** three.js. The bezel and cabinet edge are a voxel model (`tv-voxels.js`: a thick
rounded-rectangle bezel with a bevel, grey plastic shades, the dark cabinet behind), seen nearly
head-on. The synthwave scene is drawn into its own 8-bit target (or canvas texture) and shown on a
curved screen mesh inside the bezel with the barrel curve, scanlines, vignette and glare in its
shader. Reuse Neon Sundown's grid/sun ideas by copying, not importing.

### 5.4 Night Flight (`night-flight`), after Through Sky

**Look.** Flying fast just above a sea of moonlit clouds at night: clouds (seeded noise in a
shader) rushing toward the camera, a very bright blue glow along the horizon (≈ 55 % down), a
big pale cratered moon ahead and to the right, partly behind the haze, faint stars and fine
scratches on the glass. A dark cockpit seen from the pilot's seat: two thick window struts rising
from the dashboard at the bottom centre out to the top-left and top-right corners (a V), a dark
dashboard across the bottom with a small screen in its centre showing the cover (image `cover`;
no cover → a glowing crosshair), small lit buttons and two gauges. In the sky, centred: a HUD of
three thin concentric rings (`mainColor`), the outer two made of spectrum ticks (Halo Rings' ring
kit), a glowing dot in the middle. Title above the HUD in spaced capitals; artist under it.

**Motion.** Cloud speed `1 + 0.8 × loud × intensity`; a gentle seeded bank/roll (±2°, slow); on
beats a small camera shake (`shakeOnBeat`, ≤ 6 px) and the rings pulse
(`1 + 0.04 × beatEnvelope`); ring ticks from `ringValues`, squared for shape; the inner ring turns
slowly. The gauges' needles follow loudness.

**Extra settings:** `cover` (image), `shakeOnBeat` (true), `showCockpit` (true), `showTimer`
(true, shown on the dashboard). Defaults: font `Outfit`, main `#8ad8ff`, accent `#ffffff`,
spectrum 30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (cool blue night), Purple (`#c08aff`/`#ffd8ff`, violet sky), Orange
(`#ffb070`/`#fff0d8`, dusk sky), Clear (blue, `showCockpit` off).

**Build notes:** three.js. Sky, moon and clouds as one full-screen shader pass (8-bit); the
cockpit is a voxel model (`cockpit-voxels.js`: the V of window struts, a dashboard with a few
voxel gauges whose needle voxels turn, and a frame for the cover screen, which is a textured quad)
in front of the camera; the HUD rings and text in a 2D canvas over it.
Sky colours come from the preset colours (mixed darker).

### 5.5 Live Wire (`live-wire`), after Power Bass

**Look.** A dark cracked grey concrete wall (generated: noise + a seeded crack network) filling the
frame, lit from the centre, darker at the edges. Centre, seen straight on: a loudspeaker
(≈ 300 px across at 1080p): a thick dark rim ring with a glowing `mainColor` edge, a bright
silver-white cone with radial brushed shading, a black glossy dust cap. Four thick black cables
leave the rim at left and right (two each side) and curve out in S-shapes to the four corners,
lying in grooves in the wall. Electric arcs (`mainColor`, white core) crawl along the cables and
crackle in a ring around the rim. Fine bright debris streaks fly outward from the speaker.
Title above the speaker and artist below it in a bold metallic style (bevelled silver face, blue
rim light, dark outline).

**Motion.** The cone pumps with the bass: cone scale `1 + 0.08 × bass × intensity` with a
`beatEnvelope` kick (release 0.15 s); the glow follows loudness. Arcs: jagged seeded bolts along
each cable, re-seeded 12 times a second from the song frame (`mulberry32(seed + floor(songTime ×
12))`), brightness and count follow loudness; on strong hits a bright arc jumps across to the
speaker rim and small concrete debris specks fly out (seeded, fade over 0.8 s, max 40).
A faint camera shake on hits (`shakeOnBeat`).

**Extra settings:** `shakeOnBeat` (true), `showDebris` (true). Defaults: font `Oswald`, main
`#2a8aff`, accent `#9ad8ff`, spectrum 30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (blue arcs), Inferno (`#ff5a1a`/`#ffd08a`), Toxic (`#5aff2a`/`#e0ffb0`),
Violet (`#9a2aff`/`#f0b0ff`).

**Build notes:** three.js. The speaker is a voxel model (`speaker-voxels.js`: chrome rim with
screw voxels, a cone of concentric voxel rings as its own mesh so it can pump, a dust cap, cable
voxels running to the frame edges); the cracked wall a backdrop shader or texture built once per
settings change; the title and artist in a bold chrome-gradient style (HTML/canvas text, so a
60-character title fits). Arcs are additive glow lines along the cables (drawn twice: wide soft,
then thin core); debris are small voxel cubes. Lightning bolt generator goes in the toolkit
(`lightningPath(x0, y0, x1, y1, seed, detail)` → points), tested, for Static Tower to reuse.

### 5.6 Static Tower (`static-tower`), after Storm Signal

**Look.** A stormy teal night sky (heavy slow-moving clouds, seeded noise, brighter teal at the top
centre) over a dark mountain horizon at ≈ 40 % height and a dark wet arena floor with scattered
puddles that reflect teal light and the TVs. Centre, quite small (the stack ≈ 45 % of the frame
height, ≈ 15 % of its width): a narrow stepped tower of stacked old TVs, about 15 sets (rows from
the top: 1, 1, 3, 3, 4, 3), different seeded sizes and cabinet shades, slightly uneven. Each
screen shows the owner's picture (image `picture`), each with its own treatment (tint in
`mainColor`/`accentColor`, a crop/zoom offset, scanlines); no picture → a glowing play-button
logo mark. A lightning bolt often hangs from the clouds onto the top TV. Thin hairline spectrum
lines stand along the horizon to the left and right of the stack, and a faint line spectrum lies
on the ground in front of it. Title wide and spaced in thin capitals just under the stack, artist
small under it.

**Motion.** The `react` setting (the reference's "Logo is Main / Media is Main"):
`centre` — the top TV is the bright "main" one, the others dim and flicker in step with the beat;
`all` — every screen pulses together. Screens flash to static (seeded noise, ≤ 0.15 s) on strong
hits. Lightning: on hits above a threshold, a bolt (toolkit `lightningPath`) strikes from the
clouds down to the top TV (sometimes a second one off to the side), the sky and the stack's rim
light flash (release 0.4 s), and the puddles flash with it. Horizon hairlines and ground spectrum
`mirrorBars` (bass centre), up to 60 px.

**Extra settings:** `picture` (image), `react` (`centre` / `all`, default `centre`). Defaults:
font `Oswald`, main `#2affd8`, accent `#ffffff`, spectrum 30–1000 Hz, boost 8×, bands 100 %.

**Presets:** Original (teal storm, `centre`), Broadcast (`#ff3a3a`/`#ffd0d0`, `all`), Amber
(`#ffb02a`/`#fff0c0`), Ghost (`#b0c0ff`/`#ffffff`, `all`).

**Build notes:** three.js. Each TV is a voxel cabinet (a `tv-voxels.js` builder with seeded size
and shade variants) with a screen quad that shows the picture as a texture through a small shader
(tint, crop offset, scanlines, static). Sky and lightning glow as a backdrop shader plus additive
bolt sprites; the ground spectrum as thin glowing quads.

### 5.7 Hyper Tunnel (`hyper-tunnel`), after RoboWave

**Look.** A neon sci-fi tunnel rushing toward the camera: receding octagonal frames, many thin
bright neon edge lines (`mainColor`, jagged like circuit traces) on dark metal panels, cables
sagging across the tunnel, a bright vanishing point behind the robot's head. Centre: a **chrome
voxel robot**, waist up (head at ≈ 30 % from the top, filling ≈ 85 % of the frame height),
glossy dark chrome with bright reflections, a segmented chest plate, arms held out at its sides
with open hands, wearing a chunky **VR headset** with a cable from its side, head turned a
little to one side. On beats, big soft `accentColor` light washes / flares sweep across the frame
from one side. A HUD frame over everything: a thin rounded-rectangle border inset ≈ 20 px
(`accentColor` with `mainColor` corners), small bar meters at the top centre, thin side text.
Bottom-left: artist small, title big. Right edge: a vertical timer (rotated). Top-right: an
optional logo (image `logo`, small; no logo → nothing).

**Motion.** Tunnel speed `1 + 0.7 × loud × intensity`; each frame's neon edge brightness follows
a band (frames nearer the camera = lower bands), so the spectrum runs down the tunnel; on beats
the edges flash (`beatEnvelope`), the headset visor flares, the robot's head nods slightly
(≤ 3°, release 0.3 s), and on strong beats an `accentColor` flare sweeps across (seeded side and
angle from the beat's song frame, fades over 0.5 s); a slow head turn (±8°) and a slight arm
sway follow the song time. The HUD ticks crawl slowly.

**Extra settings:** `logo` (image), `finish` (`silver` / `gold`, the robot's metal, as the
reference's Character Style; default `silver`), `showTimer` (true). Defaults: font `Orbitron`, main
`#2ad9ff`, accent `#ff2abf`, spectrum 30–1000 Hz, boost 4×, bands 30 %.

**Presets:** Electric (cyan/magenta, silver), Matrix (`#2aff6a`/`#c8ffd0`, silver), Original
(`#ff2abf`/`#2ad9ff`, silver), Metal (`#ffb02a`/`#ffffff`, gold).

**Build notes:** three.js. The robot is a voxel model (`robot-voxels.js`; Iron Wraith's skull is
the closest reference: copy its approach, not its shape); the tunnel as instanced frame meshes
with neon edge strips and additive glow; the HUD and text as 2D canvas/HTML over it.

### 5.8 Moon Jelly (`moon-jelly`), after Aqua Reverie

**Look.** Underwater, looking slightly up: the upper ≈ 40 % of the frame is the water surface seen
from below, a bright blue ceiling broken into shimmering cyan, white and lavender light patches
(caustic reflections, soft ellipses) that compress toward a hazy horizon line at ≈ 45 %; below
it deep blue fading to near-black, with drifting bright specks (marine snow). Many translucent
glowing jellyfish at different depths: two large ones in front (bells ≈ 450 px wide, lower left
and lower right, partly cut by the frame), three or four mid-sized, and several small far ones
(dimmer, bluer). Each: a wide domed bell, pale blue body with `mainColor` pink edges and inner
glow, a frilled rim, long thin trailing tentacles and frilly oral arms (`accentColor`), additive
glow. Tiny centred text just under the horizon: "artist · title" and the timer.

**Motion.** Each jellyfish drifts slowly upward on its own seeded path (wrapping softly), and
swims: on each beat its bell contracts (narrower, taller) and relaxes over 0.6 s, pushing it up a
little; tentacles trail and sway as delayed sine chains that lag the bell. Glow brightness follows
loudness. Light shafts sway slowly. Ripple effect (`ripple` on): the surface band and a faint
full-frame refraction wobble pulse on the beat.

**Extra settings:** `ripple` (true), `jellyCount` (3–14, default 9), `showTimer` (true). Defaults: font
`Outfit`, main `#ff7ad8`, accent `#7ad8ff`, beat range `kick`, spectrum 30–1000 Hz,
boost 2×, bands 100 %.

**Presets:** Original (pink/blue), Glow (`#7affd8`/`#d8ff7a`), Abyss (`#7a8aff`/`#ff7ad8`, darker
water), Coral (`#ffb07a`/`#ff7a8a`).

**Build notes:** three.js. Water, shafts and snow as a backdrop shader; each jellyfish a voxel
model (`jelly-voxels.js`: a hollow domed bell of translucent glowing voxels, a frilled rim ring,
tentacles and oral arms as voxel chains) drawn additively so it glows and reads as translucent;
the bell's contraction scales the bell mesh, and the tentacle chains are re-posed per frame from
the motion module. Each jellyfish's state at
time t is a pure function of t and the beat list (`beatEnvelope`), so any frame can be drawn alone.

## 6. Testing (each template)

As M8 spec §7: motion maths in Vitest (caps, silence → rest and no NaN, time-only motion, seeded
choices repeat for the same song time in a section); the template's own Vitest test (settings,
groups, basic, content, presets, thumbnails, no `Math.random`/`Date.now`/timers, 8-bit targets);
`npm run check:templates`; a 30 s Final GPU render of T-REX with a phone copy; `npm run check`
before every commit. `lightningPath` gets toolkit tests (same points for the same seed, ends at the
given points, no NaN).

## 7. Risks

| Risk | Plan |
|---|---|
| Looks were studied from 9 frames of each preview, not every frame | Every look value is here and in presets; the owner reviews each video before merging |
| Voxel stand-ins for licensed art (speaker, TVs, cockpit, robot, jellyfish) look crude | Follow Iron Wraith (the owner approved its voxel look): enough voxels for a clear shape, chrome lighting, glow |
| Six three.js templates render slowly | Iron Wraith and Black Crown took about 5 min per 30 s; keep models at most 15,000 voxels and measure |
| 2D canvas templates with many glowing paths render slowly | Draw glows at reduced resolution and scale up; measure on the 30 s render (≤ 6 min) |
| One picture across ten TVs looks repetitive | Per-screen tint, crop and static variation |

## 8. Working practices

- **Branches:** `feat/m9-final-templates` holds this spec, the plan and Deep Swell. Each later
  template branches from the previous one and gets its own pull request targeting `main`, merged
  in order only when the owner says so.
- Each template: tests first → build → `npm run check` and `npm run check:templates` → look at
  frames → thumbnails → 30 s render → phone copy → CLAUDE.md → commit.
- **CLAUDE.md:** the M9 status line and each render speed.
