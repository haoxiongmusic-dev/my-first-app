# Visualizer catalog: study notes for future templates

Date: 2026-11-04
Purpose: reference notes for the visualizers the owner wants after the first template
(Sunlight-style Particle Horizon) is working. **Nothing here is scheduled yet**: each one gets
its own short design and plan when its turn comes, building on the first template.

## How this was studied

Each Videobolt template was opened in the owner's own Videobolt account (Chrome session, with
the owner's permission), which created a draft named **"Study - <template>"** in
*Projects → Drafts*. For each one we recorded the editable inputs ("placeholders"), presets,
Customize → Basic settings and one preview frame.

Limits of the study:
- **Customize → Advanced was not captured** for these templates: on the newer templates,
  opening the Advanced tab freezes Videobolt's editor (it happened with no automation running).
  Only the Sunlight draft's Advanced settings are known (spec §4.1).
- Previews in the editor are still frames until played, so **motion is inferred** from the
  frame plus the settings (spectrum style, scale-to-beat, shake, ripple, etc.). Before
  building any of these, watch its Videobolt preview or a real export.
- Preview frames were viewed, not saved.

## Ground rule: our own versions, not copies

These are other creators' products sold on Videobolt. We use them to understand **genres,
layouts and which settings people expect**, then design **our own** templates: our own names,
our own artwork and code. Many of them rely on licensed photos or 3D renders (jellyfish,
robot heads, a dancer, a cockpit). We don't copy those; our versions either generate their
visuals in code or let the owner supply the background image/video.

---

## What almost every template shares

These came up again and again, so they belong in the **shared toolkit** (spec §6.7) and the
standard settings form, built once and reused by every template.

| Shared feature | Seen as | Our equivalent |
|---|---|---|
| Song | Song / Track (audio) | App-level song upload (already in spec) |
| Text | Author Name + Song Name, Main Text + Subtitle, Title + Footer | `title`, `subtitle` variables (1–2 text fields, 1–2 fonts) |
| Cover art | Cover / Cover Art image | Optional `coverImage` |
| Logo | Logo image | Optional `logoImage` |
| Background | Background / Your Background image or video | Optional `backgroundMedia` (already planned for Particle Horizon) |
| **Beat Frequency Range** | Dropdown: 20–90 Hz, 90–200 Hz, 20–200 Hz, 200–600 Hz, 600–3000 Hz, 3000–8000 Hz, 8000–20000 Hz, 20–20000 Hz | `beatRange` enum: which frequencies drive the "pulse" (scale/shake/flash). Our analyzer already has 32 bands, so this is just choosing which bands feed the beat signal |
| **Spectrum Frequency Low / High** | Low: 0/20/50/100 Hz; High: 150 Hz–20 kHz | `spectrumLow`, `spectrumHigh`: the frequency window the spectrum shape draws |
| **Spectrum Frequency Boost** | 1×, 2×, 4×, 8× | `spectrumBoost`: gain on spectrum height |
| **Frequency Bands** | 10–100 % | `bandCount`: how many bars/points in the spectrum |
| **Band Thickness** | 2–110 % | `bandThickness` |
| Spectrum Style | Bars / Line / Dots | `spectrumStyle` enum |
| Scale to beat, Shake, Fade In/Out | toggles | `scaleOnBeat`, `shakeOnBeat`, `fadeInOut` |
| Song timer / progress bar | "00:47 – 03:34", progress line; Timer Type: Simple / Song Timer | `showTimer` + `timerStyle` (elapsed–total, progress bar) |
| Presets | 2–14 named looks per template | `template.json` presets (already in spec) |
| Colors panel (newer templates) | Palettes / Scheme / Fine-tune, "your colors", suggested palettes | Later: a palette picker that sets all colour variables at once |

**Key insight:** about half the list is the same recipe: *background image/video +
a spectrum shape + cover art + text + timer*, differing mainly in layout and spectrum style.
One flexible **"Scene Visualizer"** template with layout and spectrum-style options could
cover many of them at once, instead of building each separately.

---

## Families and suggested build order (after Sunlight)

| Order | Family | Templates | Why this order |
|---|---|---|---|
| 1 | **Particle fields** (closest to Sunlight) | Particles Wave Visualizer, Pulsing Spheres | Reuse the Particle Horizon engine almost directly |
| 2 | **Scene + spectrum overlay** | Night Lights, Dark Frequency, Soundwave, Star Dance, Through Sky, Storm Signal, Beatwave, Neon Helix, Iron Wraith | One "Scene Visualizer" engine covers most of these; needs user background media |
| 3 | **Radial / ring spectrum** | Astral Pulse, Glasswave Viz, Universal Visualizer, Ocean of Sound, Power Bass | Circular spectrum module + centre object |
| 4 | **Retro synthwave** | Gridwave Reactor, Synthwave | Neon grid + sun + CRT/VHS effects; good fit for code |
| 5 | **3D object / special scenes** | Techno Cube, Aqua Reverie, FerroPulse, RoboWave, Ascension Pulse | Each needs bespoke 3D or simulation work |

---

## Template notes

Format for each: **reference** (Videobolt name · author) → what it looks like → how it
reacts → inputs → settings (Basic) → presets → build notes for our version.

### 1. Astral Pulse · PixBolt
- **Look:** dramatic mountain landscape at dusk (photo); centred **concentric rounded-square
  rings** made of fine dotted spectrum bars, cyan-white glow; small title + subtitle in the centre.
- **Reacts:** rings deform and bars extend with the spectrum; pulse (scale) and shake on beats.
- **Inputs:** Song; Artist Info (Text 1, Text 2).
- **Basic settings:** Fonts (2); Spectrum Style (Bars / Line / Dots); Frequency Bands 100 %;
  Beat Frequency Range 20–200 Hz; Scale ✓; Shake ✓.
- **Presets:** uses the Colors panel (8 suggested palettes).
- **Build notes:** radial spectrum on a "squircle" path, 3 nested rings with different band
  ranges; user-supplied background. Family 3.

### 2. Ocean of Sound · PixBolt
- **Look:** night sea under a full moon with a moonlight reflection; an **elliptical ring of
  spectrum bars lying flat on the water** in perspective, with ripples; spaced title and a
  thin progress bar with timer below.
- **Reacts:** bars rise from the water ring; ripples spread.
- **Inputs:** Song; Text.
- **Basic settings:** Fonts (2); Spectrum Style (Bars/Line/Dots); Frequency Bands 40 %;
  Scale; Beat Frequency Range (incl. 200–600 … 8000–20000 Hz options); Fade In/Out.
- **Presets:** Colors panel.
- **Build notes:** perspective ring (ellipse) spectrum + water reflection shader; calm,
  elegant; pairs well with the AXIOM look. Family 3.

### 3. Glasswave Viz (asked for as "Glass Wave Viz") · MotionBox
- **Look:** blurred purple/pink bokeh background; centre-right a **3D iridescent glass
  crystal**; around it a dotted circular spectrum ring with a burst of bars at the top;
  artist + song name with progress line and timer on the left (monospace).
- **Reacts:** spectrum ring; crystal likely pulses/rotates; optional noise.
- **Inputs:** Song; Author Name, Song Name.
- **Basic settings:** Font; Band Thickness 50 %; Frequency Bands 50 %; Spectrum Frequency
  Boost 1×; Beat Frequency Range; Noise Amount 0 %.
- **Presets:** Original, Amber, Sonic Glass, Iridescent Drift.
- **Build notes:** glass object needs a refraction/iridescence shader (WebGL); hardest part.
  Family 3.

### 4. Aqua Reverie · MotionBox
- **Look:** underwater scene, light shafts from the surface; **glowing translucent
  jellyfish** (pink/blue) drifting; small centred text.
- **Reacts:** jellyfish pulse to the beat; optional ripple effect on the surface.
- **Inputs:** Song; Author Name, Song Name.
- **Basic settings:** Font; Beat Frequency Range; Effects: Ripple Effect.
- **Presets:** Colors panel.
- **Build notes:** procedural jellyfish (bell + tentacles) in WebGL is a real project; or
  abstract "organic glow" shapes instead. Family 5.

### 5. FerroPulse (asked for as "Ferro Pulse") · MotionBox
- **Look:** fiery orange nebula sky over a **dark reflective liquid surface with concentric
  ripples** from the centre; a small spectrum, names and timer at the top centre.
- **Reacts:** ripples/"ferrofluid" spikes on the beat.
- **Inputs:** Song; Author Name, Song Name.
- **Basic settings:** Font; Beat Frequency Range.
- **Presets:** Colors panel.
- **Build notes:** liquid surface with ripple rings from our kick/hit data is very doable
  (same idea as Particle Horizon's hit ripples). Family 5.

### 6. Gridwave Reactor · tinomotion
- **Look:** classic **synthwave**: neon wireframe mountains, glowing grid floor, a striped
  retro sun with the **cover art inside a circle**, radial spectrum bars around the sun,
  neon "ARTIST NAME / SONG NAME", timer, VHS lines.
- **Reacts:** sun spectrum bars; grid/mountains move.
- **Inputs:** Song; Author Name, Song Name, Cover Art.
- **Basic settings:** Fonts (2); Scene Look (Original, Foxy Pink, Red Desert, Dark Night,
  Orange and Teal, Penumbra); Frequency Bands 70 %; Beat Frequency Range; Spectrum Side
  (Outside / Inside / Both); VHS Look.
- **Presets:** Original, Foxy Pink, Red Desert, Dark Night CRT.
- **Build notes:** all drawable in code (grid, mountains, sun, VHS). Family 4.

### 7. Iron Wraith · milinkovic
- **Look:** chrome **robot skull** with glowing eyes and cables (3D render); blurred blue
  vertical light columns behind; **mirrored multi-line waveform spectrum** at the bottom;
  "AUTHOR NAME – SONG NAME" in a techno font.
- **Reacts:** two independent spectra (separate low/high/boost/bands/thickness each); eye
  glow likely pulses.
- **Inputs:** Track; Author Name; Logo.
- **Basic settings:** Font; Beat frequency range; **two spectra**, each with Frequency Low,
  High, Boost, Bands (10 % / 30 %), Thickness (7 % / 110 %).
- **Presets:** Original Theme, Original Speed Theme, Purple, Green, Blue Orange, Red.
- **Build notes:** the robot is licensed art: our version uses the owner's own image.
  Interesting idea to keep: **multiple spectrum layers with separate settings**. Family 2.

### 8. Neon Helix Viz (asked for as "Neon Helix") · tinomotion
- **Look:** dark blue scene with a **neon helix/tunnel of glowing lines** sweeping across;
  square cover art with an RGB-glitch edge on the left; neon magenta artist/song text; a
  thin horizontal waveform spectrum; timer.
- **Reacts:** waveform line; scale to beat.
- **Inputs:** Song; Author Name, Song Name, Cover Art.
- **Basic settings:** Font; Scene Type (Background 1–5); Frequency Bands 75 %; Beat
  Frequency Range; Song Timecode; Scale to Beat.
- **Presets:** Original, Intense Purple, Green Matrix, Orange Beauty, Blue Steps, 8 Bit Red,
  Film Noir, Magic Yellow.
- **Build notes:** helix of lines is code-drawable (WebGL lines). "Scene Type" = a set of
  built-in backgrounds. Family 2.

### 9. Storm Signal · S_WorX
- **Look:** stormy teal night sky with lightning over a dark arena; a **pyramid of stacked
  old TVs** showing the owner's images/logos; thin line spectrum across the ground; wide
  spaced title.
- **Reacts:** TV screens/logos react ("Logo is Main" / "Media is Main"); lightning on beats.
- **Inputs:** Track; Text; **Media 1–14**; **Logos 1–14**.
- **Basic settings:** Font; Logo Media React (Logo is Main / Media is Main); Beat frequency
  range; Spectrum Low 20 Hz, High 1000 Hz, Boost 8×, Bands 100 %, Thickness 2 %.
- **Presets:** Colors panel.
- **Build notes:** a 3D scene with many media slots; ambitious. Lightning-on-hit is a nice
  reusable effect. Family 5 (or 2 with a simpler layout).

### 10. Ascension Pulse · S_WorX
- **Look:** dark grey backdrop; a **vertical beam of blue light** descending to a small core
  with a horizontal flare; spaced serif title and small subtitle below.
- **Reacts:** beam intensity/flare pulses; thin spectrum around the core.
- **Inputs:** Track; Main Text, Subtext.
- **Basic settings:** Font; Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz, Boost
  2×, Bands 55 %, Thickness 2 %.
- **Presets:** Original, Red, Green, Orange, Purple, Pink, Cian.
- **Build notes:** minimal and elegant; easy in code (glow beam + flare + particles).
  Close in spirit to the AXIOM look. Family 5 (easy one).

### 11. Dark Frequency · S_WorX
- **Look:** gritty black-and-white scratched film texture with smoke; **spaced title with
  one red letter**, glitch/blur on the letters; heartbeat-style line spectrum running out
  from both sides of the title.
- **Reacts:** line spectrum; letters glitch/flicker on beats.
- **Inputs:** Track; Text; Background media.
- **Basic settings:** Font; Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz, Boost 8×,
  Bands 100 %, Thickness 2 %.
- **Presets:** Original, Red, Cian.
- **Build notes:** text glitch + film grain + line spectrum: all code. Family 2.

### 12. Power Bass · S_WorX
- **Look:** cracked concrete wall; a **chrome loudspeaker** in the centre with a blue glow;
  **electric arcs** running along cables to the edges; metallic 3D title above and below;
  flying debris.
- **Reacts:** speaker cone pumps with the bass; arcs flicker; debris on hits.
- **Inputs:** Track; Text 1, Text 2; Background.
- **Basic settings:** Font; Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz, Boost 8×,
  Bands 100 %, Thickness 2 %.
- **Presets:** Colors panel.
- **Build notes:** a speaker can be drawn (concentric rings + shading); arcs are a good
  reusable "lightning" effect. Family 3.

### 13. Night Lights Visualizer (asked for as "Night Lights") · Harchenko
- **Look:** photo/video background (a dancer on a neon city street with light trails);
  centred **thin dotted, mirrored line spectrum**; "Author Name – Song Name" and a boxed
  progress bar.
- **Reacts:** line spectrum; timer/progress.
- **Inputs:** Track; Logo; Title; Footer Text.
- **Basic settings:** Font; Original Logo Colors (Original / Color) + Logo Color; Spectrum
  Low 20 Hz, High 1000 Hz, Boost 8×, Bands 100 %, Thickness 5 %; Timer Type (Simple Timer /
  Song Timer).
- **Presets (14 layout variants):** Original, Man Background, Big Timer, Big Timer 2, Big
  Timer Man, Big Timer Man 2, Big Title, Big Title Man, Big Music Player, Big Music Player
  Man, Big Timeline, Big Timeline Man, Big Logo, Big Logo Man.
- **Build notes:** the clearest example of the "Scene Visualizer" idea: presets are really
  **layouts** (what's big: timer, title, player, timeline, logo). Family 2.

### 14. Universal Visualizer · S_WorX
- **Look:** deep-space starfield; **Earth-like planet** in the centre with a fine radial
  spectrum around its edge; gold 3D title across it; website text; lens light.
- **Reacts:** radial spectrum around the planet; glow.
- **Inputs:** Track; Main Text, Subtitle; Cover; Background.
- **Basic settings:** Fonts (2); Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz,
  Boost 8×, Bands 100 %, Thickness 2 %.
- **Presets:** Colors panel.
- **Build notes:** circle (planet = cover image or generated sphere) + radial spectrum.
  Family 3 (easy).

### 15. Techno Cube Visualizer · tarazz
- **Look:** dark room with a reflective floor; **nested neon wireframe cubes** (purple
  outer, orange inner); left: logo, author name, song name, timer; right: a sci-fi HUD
  readout ("MODE", "POWER", "CUBE_1 ACTIVE"…).
- **Reacts:** cubes scale/rotate/flash with the beat; HUD numbers change.
- **Inputs:** Track; Logo; Author Name; Song Name.
- **Basic settings:** Font; Text 1 Font Size 70 px; Text 2 Font Size 30 px; Beat frequency range.
- **Presets:** Original, Fast Fade, Normal Fade, Hold, Raver, Flashbang, Core, Technical Problem
  (behaviour presets, not just colours).
- **Build notes:** wireframe cubes + HUD are code-friendly; **behaviour presets** are a good
  idea to copy as a concept. Family 5.

### 16. Beatwave Visualizer · MotionDesk
- **Look:** blurred neon colour bands (magenta/blue/cyan) streaking horizontally; smooth line
  spectra top and bottom; rounded cover art; "Author Name – Song Name" with a mini spectrum;
  **genre tag pills** (e.g. "Hip Hop").
- **Reacts:** line spectra; colour bands shift.
- **Inputs:** Author Info + Text 1–5 (tags); Cover; Background; Track.
- **Basic settings:** Fonts (2); Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz,
  Boost 2×, Bands 65 %.
- **Presets:** "Visualization of music", Theme 2.
- **Build notes:** soft gradient bands + spline spectra + UI-style cards; code-friendly.
  Family 2.

### 17. Soundwave Visualizer · S_WorX
- **Look:** starry dark background; centre **square cover art with a glowing electric
  border**; a wide **horizontal mirrored bar spectrum** in pink/purple bursting left and
  right through a bright horizontal light streak; spaced title across it.
- **Reacts:** bar spectrum; border crackles on beats.
- **Inputs:** Text; Cover; Your Background; Track.
- **Basic settings:** Font; Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz, Boost 2×,
  Bands 100 %.
- **Presets:** Original, Red Orange, Blue Green, Purple Pink.
- **Build notes:** very achievable; strong, simple look. Family 2.

### 18. RoboWave Visualizer · Shoeeb
- **Look:** chrome **robot in a VR headset** in a neon sci-fi tunnel with cables; HUD frame
  corners; author/song name bottom-left; vertical timer; logo top-right.
- **Reacts:** tunnel neon outlines pulse with the spectrum.
- **Inputs:** Track; Logo; Author Name; Song Name; Website.
- **Basic settings:** Fonts (2); Character Style (Silver / Gold); Beat frequency range;
  Spectrum Low 20 Hz, High 1000 Hz, Boost 4×, Bands 30 %, Thickness 4 %.
- **Presets:** Electric Scifi, Matrix, Original, Metal.
- **Build notes:** the robot is licensed 3D art: use the owner's image. The HUD frame is a
  reusable overlay idea. Family 2/5.

### 19. Synthwave · S_WorX
- **Look:** an **old CRT TV** showing a retro scene: neon grid floor, mountains, chrome
  "SYNTHWAVE"-style title, cover art in the middle, a horizon spectrum line, scanlines.
- **Reacts:** horizon spectrum; screen flicker.
- **Inputs:** Track; Main Text; Tagline; Cover.
- **Basic settings:** Fonts (2); Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz,
  Boost 8×, Bands 100 %, Thickness 2 %.
- **Presets:** Original, Green.
- **Build notes:** shares the grid/sun/CRT pieces with Gridwave Reactor; build them together.
  Family 4.

### 20. Particles Wave Visualizer (asked for as "Particle Wave Visualizer") · EnjoystX
- **Look:** **dense blue particle surface** rolling in soft waves (very close to Sunlight's
  idea, in blue), with large soft bokeh orbs floating in front; a small logo in the centre;
  "Author Name – Song Name".
- **Reacts:** the particle surface swells with the low frequencies (spectrum 0–200 Hz).
- **Inputs:** Text; Logo; Track.
- **Basic settings:** Font; Beat frequency range; Spectrum Low 0 Hz, High 200 Hz, Boost 1×.
- **Presets:** Colors panel.
- **Build notes:** **almost free once Particle Horizon exists**: a different camera angle
  (closer, steeper), blue preset, bigger bokeh. Family 1, first after Sunlight.

### 21. Pulsing Spheres · tarazz
- **Look:** a huge field of **dots/spheres bending into a tunnel**, hot gradient (yellow →
  orange → red → purple); square cover art centre; boxed "AUTHOR NAME – SONG NAME"; a small
  line spectrum and timer below; logo top-right.
- **Reacts:** spheres grow/shrink with the spectrum in waves.
- **Inputs:** Cover; Track; Logo; "Author name – song name".
- **Basic settings:** Fonts (2); Beat frequency range; Spectrum Low 0 Hz, High 200 Hz,
  Boost 1×, Bands 50 %, Thickness 10 %.
- **Presets:** Colors panel.
- **Build notes:** same particle engine with a curved/tunnel layout and size-by-level
  instead of height. Family 1.

### 22. Star Dance · S_WorX
- **Look:** starry night sky with the Milky Way; a **radio telescope dish** silhouette on
  the horizon against an orange sunset glow; a **semicircle of spectrum bars** fanning above
  the dish; thin vertical light streaks; spaced title + website.
- **Reacts:** the fan of bars above the dish; streaks.
- **Inputs:** Main Text; Subtitle; Cover; Track.
- **Basic settings:** Fonts (2); Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz,
  Boost 2×, Bands 100 %, Thickness 2 %.
- **Presets:** Original, House, With Cover, House with cover.
- **Build notes:** sky/horizon can be generated (stars + gradient + silhouette); half-circle
  spectrum module. Family 2/3.

### 23. Through Sky · S_WorX
- **Look:** **spaceship cockpit view** flying above clouds toward a moon; a circular HUD
  (rings) in the centre with the cover art; title at the top; cover shown on a cockpit screen.
- **Reacts:** HUD rings/spectrum; probably flight speed and shake on beats.
- **Inputs:** Text; Cover; Track.
- **Basic settings:** Font; Beat frequency range; Spectrum Low 20 Hz, High 1000 Hz, Boost 8×,
  Bands 100 %, Thickness 2 %.
- **Presets:** Theme, Purple, Orange.
- **Build notes:** cockpit art is licensed; our version could do a generated "flight through
  clouds/stars" with a HUD ring spectrum. Family 5.

---

## Drafts created in the owner's Videobolt account

23 drafts named "Study - …" (Astral Pulse, Ocean of Sound, Glasswave Viz, Aqua Reverie,
FerroPulse, Gridwave Reactor, Iron Wraith, Neon Helix Viz, Storm Signal, Ascension Pulse,
Dark Frequency, Power Bass, Night Lights Visualizer, Universal Visualizer, Techno Cube
Visualizer, Beatwave Visualizer, Soundwave Visualizer, RoboWave Visualizer, Synthwave,
Particles Wave Visualizer, Pulsing Spheres, Star Dance, Through Sky). One extra untitled
"Power Bass" draft may exist from re-opening it, and the Soundwave draft may be untitled.
They can be deleted from *Projects → Drafts* whenever the owner likes; nothing was exported.
