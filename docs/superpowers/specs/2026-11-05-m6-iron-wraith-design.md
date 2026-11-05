# Milestone 6a: Iron Wraith (voxel robot skull): Design Spec

Date: 2026-11-05
Status: **approved in chat on 2026-11-05; awaiting the owner's review of this written version**
Builds on: [`2026-11-04-music-visualizer-app-design.md`](2026-11-04-music-visualizer-app-design.md)
(template contract §6, preview §8, export §9) and the catalog note
[`Iron Wraith`](../../research/2026-11-04-visualizer-catalog.md#7-iron-wraith--milinkovic).

## 1. Summary

Iron Wraith is the second template and the first of milestone 6's five (Iron Wraith,
Scene Visualizer, radial ring, Gridwave Reactor, glass crystal). It is a **3D voxel chrome robot
skull** drawn entirely in code with three.js. The skull's jaw bites on the beat and its eyes glow.
Behind it, **voxel towers** rise and fall with the spectrum. Across the bottom run **two mirrored
waveforms**, each with its own settings, and above them sits "ARTIST – SONG".

The other four M6 templates each get their own short design and plan when their turn comes.
This spec covers only Iron Wraith and the pieces it adds that later templates will reuse:
three.js in a template, and the 8-bit post-processing rule.

## 2. Shared understanding

**What the owner asked for (2026-11-05):**
- The robot is drawn in code, as voxel art made with three.js. It lives in the public repo (no
  licensed or AI-generated picture).
- The jaw moves with the music.
- Voxel towers behind the skull.
- Mirrored waveforms at the bottom.
- Artist and song name. **No logo.**
- Colour presets borrow the reference's scheme: Original, Original Speed, Purple, Green, Blue
  Orange, Red.

**Approved look:** the throwaway three.js sketch from 2026-11-05. It has:
- a chrome voxel skull with angled brows
- plus-shaped glowing eyes
- a hinged jaw with square teeth
- a ribbed neck, with cables fading into the dark bottom third
- blue voxel towers behind

**Success:** the owner exports a song with Iron Wraith from the app, on this PC, and it:
- looks like the sketch
- visibly bites, glows and pulses with the music
- comes out identical on every export
- finishes in reasonable time (§9)

## 3. Scope

**In:**
- the `templates/iron-wraith/` template, with its presets and thumbnails
- three.js packaged for templates
- tests for the skull shape
- updates to the template checks
- CLAUDE.md notes

**Out:**
- **The other four M6 templates**: later specs.
- **Logo, cover art and any new "image" setting type**: added when a template needs one.
- **Song timer and progress bar.**
- **Uploading your own robot picture.**
- **Camera moves beyond a small nod.**

## 4. What the owner sees

Layout at 1920×1080:

| Element | Where | Notes |
|---|---|---|
| Skull | Centred, top of dome ≈ 11 % from the top, chin ≈ 70 % | ≈ 6,000 chrome voxels; neck and cables fade out into the bottom third |
| Voxel towers | Behind the skull, full width | 12 per side, mirrored; bass in the centre, treble at the edges |
| Waveforms | Bottom band, about 78–96 % of the height | Two layers, each mirrored left↔right from the centre and reflected below its baseline at lower opacity |
| Title | Just above the waveforms, centred | "ARTIST – SONG" in capitals, techno font, letter-spaced |

**Reactions** (all driven by the analyzer data through the toolkit, never by timers):

| Part | Signal | Behaviour |
|---|---|---|
| Jaw | `beat` (follows **Beat range**) | Opens up to `jawStrength` × 0.3 rad on a beat, then closes fast (attack ≈ 40 ms, release ≈ 180 ms) |
| Head | `beat` | Small nod (≤ 2°) in step with the jaw |
| Eyes | `loud`, plus recent hits | Brightness follows loudness; hits add a short flare (≤ 0.4 s) scaled by `glow` |
| Rim light | `loud` | Blue rim light on the chrome breathes with loudness (`lightColor`) |
| Towers | Fixed spectrum, 20 Hz–16 kHz, 12 columns | Height in whole blocks (voxel look). A falling "peak" block shows the highest value of the last 0.6 s, computed from time, so seeking gives the same frame |
| Waveform A / B | Their own spectrum window each | Smooth line through `bands` points, mirrored and reflected; line width from `thickness` |

`intensity` (0.2–2, default 1) scales every reaction. "Original Speed" is the livelier preset.

## 5. Settings (generated form)

Declared with `data-composition-variables`. Groups in `template.json`:

| Group | Field id | Type | Default | Range / options |
|---|---|---|---|---|
| Text | `title` | string | `SONG NAME` | |
| | `artist` | string | `ARTIST NAME` | |
| | `font` | enum | `Orbitron` | `Orbitron`, `Audiowide` (both SIL Open Font License, files in `assets/fonts/` with their licence) |
| Colors | `eyeColor` | color | `#3fd0ff` | |
| | `lightColor` | color | `#1f5fff` | towers and rim light |
| | `waveColor` | color | `#5fb4ff` | both waveforms (layer B drawn lighter) |
| Effects | `intensity` | number | 1 | 0.2–2, step 0.1 |
| | `jawStrength` | number | 60 | 0–100 % |
| | `glow` | number | 50 | 0–100 % |
| | `showTowers` | boolean | true | |
| Audio | `beatRange` | enum | `kick` | same options as Particle Horizon |
| Waveform A | `waveALow` / `waveAHigh` | number | 30 / 2000 | 30–16000 Hz, step 10 |
| | `waveABoost` | enum | `2` | 1×, 2×, 4×, 8× |
| | `waveABands` | number | 10 | 10–100 % (10 % ≈ 16 points, 100 % ≈ 160) |
| | `waveAThickness` | number | 7 | 2–110 % (100 % ≈ 12 px) |
| Waveform B | `waveBLow` / `waveBHigh` | number | 60 / 12000 | as above |
| | `waveBBoost` | enum | `1` | as above |
| | `waveBBands` | number | 30 | as above |
| | `waveBThickness` | number | 110 | as above |

The reference's band and thickness defaults (10 % / 30 %, 7 % / 110 %) are kept.

- **Basic tab:** `eyeColor`, `intensity`, `jawStrength`, `glow`, `font`, `showTowers`.
- **Content:** `title`, `artist`.

Each waveform is its own `createAudio(data, { spectrumLow, spectrumHigh, spectrumBoost, spectrumCount })`
from the toolkit, so **no toolkit change is needed**. The towers use a third instance.

## 6. Presets

Borrowed from the reference's names, with our own colours. The chrome stays neutral grey, so
each preset recolours only the eyes, the lights and the waves.

| Preset | `eyeColor` | `lightColor` | `waveColor` | Other |
|---|---|---|---|---|
| Original | `#3fd0ff` | `#1f5fff` | `#5fb4ff` | |
| Original Speed | `#3fd0ff` | `#1f5fff` | `#5fb4ff` | `intensity` 1.5, `jawStrength` 85, `glow` 70 |
| Purple | `#d77bff` | `#7a2cff` | `#b56cff` | |
| Green | `#6bff9a` | `#11b84a` | `#4dff88` | |
| Blue Orange | `#ff9a2e` | `#1f5fff` | `#ff8a1e` | |
| Red | `#ff3b30` | `#c8102e` | `#ff5a4a` | |

Thumbnails come from `npm run thumbs -- iron-wraith`.

## 7. How it's built

**Files**
- `templates/iron-wraith/index.html`: variables, the three.js scene, the waveform layer and the
  title.
- `templates/iron-wraith/template.json`: groups, basic, content and presets.
- `templates/iron-wraith/assets/skull-voxels.js`: a **pure** function `buildSkull()` that
  returns the voxel lists. It touches no DOM and no three.js, so Vitest can test it, and it
  works in the browser (`window.IronWraithSkull`) and in Node (`module.exports`):
  - `{ head, jaw, cables, eyes }`, each voxel `[x, y, z, shade]`
  - plus the jaw pivot
- `templates/shared/three-kit.js` (generated, committed): **one classic script** that bundles
  three.js plus the add-ons we use and exposes `window.THREE_KIT`. The add-ons are
  `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` and `RoomEnvironment`.
  - It is built by `npm run build:three` (esbuild) from **three 0.187.0**. Both three and
    esbuild are pinned to exact versions as dev dependencies.
  - Why a bundle: renders can't fetch from the internet, and one plain script behaves like the
    toolkit (no import maps or module loading inside HyperFrames).
  - The three.js MIT licence notice stays at the top of the file.
- `npm run sync:toolkit` also copies `three-kit.js` into every template whose `index.html`
  references `assets/three-kit.js`. It is kept identical, like the toolkit.

**Drawing (per frame, from the `hf-seek` time only)**
1. **The skull is three `InstancedMesh`es** (head, jaw, cables) of 0.92-unit cubes. Only the
   surface voxels are kept.
   - Material: chrome `MeshStandardMaterial` (metalness 1, roughness 0.2).
   - Per-voxel shade comes from `mulberry32` (seed 7).
   - Reflections: `RoomEnvironment` at intensity 0.22, rotated −1.4 rad around X so the ceiling
     lights don't blow out the dome.
   - The jaw is a child group rotated around its pivot.
2. **Eyes:** emissive cube clusters plus two point lights coloured `eyeColor`.
3. **Light:** blue rim lights (`lightColor`) from behind.
4. **Towers:** one `InstancedMesh` of blocks, with instance count and positions rewritten each frame.
5. **Glow:** `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass`. The composer
   target and **every bloom target are forced to `UnsignedByteType`**, because three.js uses
   half-float by default and that renders blank on this PC's Intel UHD 620. The bloom works at
   half resolution.
6. **Waveforms and title** are drawn on a 2D canvas laid over the WebGL canvas. The title is a
   DOM element with `data-var-text`, like Particle Horizon.

**Preview behaviour (spec §8):**
- Settings arriving on the `settings` channel update material colours and numbers, with no
  rebuild.
- The `preview` `{scale}` channel resizes the renderer.
- The template looks the same without either channel.
- It redraws on the timeline's `onUpdate` and never measures the DOM there.

**Errors:** if WebGL or a shader fails, the toolkit's `showError` shows a clear message (the
template contract's compile/link rule). three.js reports shader errors through
`renderer.debug.onShaderError`, which is hooked up to `showError`.

## 8. Testing

| What | How |
|---|---|
| Skull shape | Vitest (`src/lib/iron-wraith-skull.test.ts`, which loads `skull-voxels.js`). Checks: every voxel has its mirror (−x); 3,000–10,000 voxels in total; head and jaw don't overlap; the eyes sit inside the sockets; same output on every call |
| three-kit is current | Vitest: `templates/shared/three-kit.js` exists, names three 0.187.0, and each template's copy is identical |
| 8-bit rule | Vitest: `index.html` contains no `HalfFloatType` or `FloatType`, and forces `UnsignedByteType` on the composer and bloom targets |
| Template rules | `npm run check:templates`: settings rules, `npx hyperframes check`, quiet vs loud reaction |
| Real GPU | `npm run render -- iron-wraith C:\Users\ydogg\Downloads\AXIOM\T-REX.wav --start 60 --end 90` (our job-builder section cut, not HyperFrames' slow `--start/--end`) on this PC: not blank, jaw visibly moves, timed |
| Look | Frames at a quiet and a loud moment compared with the approved sketch; a phone-sized clip (< 30 MB) sent to the owner |
| App | Pick Iron Wraith in the gallery, change presets live in the editor, and export a Draft through the app |

## 9. Performance budget

Particle Horizon renders at ≈ 4× song length on this PC. **Iron Wraith's target is ≤ 6×**
for a Final 1080p export.

If it's slower, cut in this order and measure each step:
1. Bloom resolution to one third.
2. Cable voxels.
3. The tower count.

The measured figure goes into CLAUDE.md "Machine facts".

## 10. Risks

| Risk | Plan |
|---|---|
| HyperFrames doesn't run a large bundled script well | The first plan task proves `three-kit.js` loads in `npx hyperframes check` and in a 5 s render before anything else is built |
| Blank output on the Intel GPU | 8-bit targets everywhere, enforced by a test; checked with a real render early |
| 8-bit bloom bands in dark gradients | Keep the glow tight; check frames; add a tiny static dither (≤ 0.02, slow rule) only if banding shows |
| Repo size | `three-kit.js` ≈ 0.7 MB minified, committed once per template that uses it; acceptable |
| Chrome looks flat or blown out on real hardware | Reflection strength and rotation are named constants; tuned against real frames |

## 11. Working practices for this milestone

- **Branch** `feat/m6-iron-wraith`, then a plan in `docs/superpowers/plans/`, native execution,
  a fresh final reviewer, a PR, and a merge when the owner says so.
- **CLAUDE.md:**
  - mark M5 done
  - add the M6 line
  - add the rule "three.js post-processing: force `UnsignedByteType` on every render target"
  - add the Iron Wraith render speed
