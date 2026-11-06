# M7 Polish: Presets panel, undo/redo, loose ends

Approved in conversation on 2026-11-07. Builds on the app spec
(`docs/superpowers/specs/2026-11-04-music-visualizer-app-design.md` §4.1, §13 row 7).

## 1. Goal

Finish version 1. The owner can switch a template's look in one click and step back through
setting changes, and no known loose ends remain from milestones M6 and the online test version.

**Done means:** the Presets panel and undo/redo work in the editor; every fix in §5 is made;
`npm run check`, `npm run build` and `npm run check:templates` pass; CI is green.

## 2. Scope

In: the Presets panel (§3), undo/redo (§4), the fixes in §5.

Out (the owner chose not to include them in M7): moving gallery cards, the ambilight glow,
Preview still, remembered settings. Proper session revocation on Log out is also out (§5.6).

## 3. Presets panel

- **Where:** a new **Presets** icon on the icon rail, between Content and Customize
  (`PanelId` gains `"presets"`). The panel lists the template's `manifest.presets` in their
  declared order as cards: the thumbnail (served as `/preview/<templateId>/sample/<thumbnail>`,
  the same address the gallery uses) with the preset's name under it. A preset without a
  thumbnail shows its name on a plain card. A template with no presets shows
  "This template has no presets."
- **Applying a preset:** the template's **look fields** are the union of the value keys of all its
  presets. Picking a preset sets every look field to the template's default, then applies the
  preset's values. Fields outside the look fields (title, artist, images, anything no preset
  touches) keep their current values. This is one pure function (no React), so it is
  unit-tested.
- **Highlight:** a card is highlighted when every look field's current value equals what that
  preset would set (computed from the values; no separate "chosen preset" state). After a
  manual change to a look field, no card is highlighted. Equal-looking colours compare
  case-insensitively and with 3-digit hex expanded (`#f61` equals `#ff6611`).
- Picking a preset is one undo step (§4). Fields shown in Customize update at once (text boxes
  already follow outside changes through `useDraft`).
- Exports are unchanged: a preset only sets values.

## 4. Undo / redo

- **What it covers:** the editor's settings values (everything in `values`, including image
  settings such as the cover picture) and the chosen background picture. The song and the
  section are not part of undo: they are what the user starts from.
- **Steps:** each change is one step, except that changes to the **same field** less than
  1 second apart join the step before (one slider drag, one burst of typing, one colour-picker
  drag). A preset is one step. Undo/redo itself never joins steps. History keeps the last
  **100** steps; a new change after an undo drops the redo steps.
- **Controls:** two buttons in the editor's top bar (↶ Undo, ↷ Redo, disabled when there is
  nothing to undo/redo) and the shortcuts **Ctrl+Z** (undo), **Ctrl+Shift+Z** and **Ctrl+Y**
  (redo); **Cmd** instead of Ctrl on a Mac. The shortcuts do nothing while the focus is in a text
  box, number box, text area or anything editable, so the browser's own undo of typing
  works there.
- **Design:** the history is a pure reducer in `src/lib/` (state in, state out; the time is passed
  in), unit-tested; the editor holds it with `useReducer`.

## 5. Fixes

Each item names where it came from. Template changes must keep `npm run check:templates`
passing and must not change the look of an export except where the item says so.

### 5.1 Halo Rings (PR #9)
1. **Shake seed:** the shake picks its direction from `floor(songTime * 30)`, which lands exactly on
   frame boundaries, so a preview section can shake differently from the full render. Add
   `1e-6` before the `floor`, with a test over every frame of a section that starts at a
   fractional time (the section's frames must match the full song's).
2. **360p preview dots:** they flicker in brightness. Draw them exactly one screen pixel wide, with
   brightness matched to the export.
3. **Comments:** `index.html` says "bass always at the top", which is wrong: the values travel with
   their points, so each ring's pattern turns. Also fix the wrong test comment about the
   rounded-square corners.

### 5.2 Neon Sundown (PR #10)
1. **Far ridge outline (owner's choice: hide it):** draw it so that it shows only where the far
   ridge rises above the near mountains.
2. **VHS scanlines:** in the 360p and 720p preview they must match the export: the same number of
   lines over the frame height.
3. **Grain hash:** it feeds `sin()` very large numbers. Hash on `mod(gl_FragCoord.xy, 256.0)`
   instead.
4. **Comment:** remove the duplicate doc comment above `sunBars`.

### 5.3 Prism Heart (PR #11)
1. **360p preview dots:** under about 28 % Band thickness they can vanish or dim. Keep them at
   least one screen pixel, with matched brightness.
2. **Facet edges:** about 3× bolder in the 360p preview than in the export. Scale them so the
   preview matches.
3. **Background blur slider:** dragging it with Show background on can feel sluggish. Make it
   smooth, for example by redrawing the blurred background at most once per animation frame.
   The export result must not change.
4. **`dispose()`:** also dispose the `OutputPass`.
5. **Grain hash:** hash on `mod(gl_FragCoord.xy, 256.0)`.
6. **Tidy-ups:**
   - remove the duplicate `#songArtist` CSS rule
   - skip the bokeh loop in picture mode, where its result is overwritten

### 5.4 Iron Wraith (PR #7)
1. **Long text:** a long artist together with a long title (up to 123 characters) must fit within the
   safe width, shrinking as needed.
2. **Thinnest wave:** at the thinnest setting it must stay visible in the small preview. Use at
   least one screen pixel.
3. **Tower colours:** they must come out as the exact hex picked, so they skip tone mapping.
4. **Skull nod (owner's choice: keep 3.4°):** correct the Iron Wraith design spec's "≤ 2°" to the
   approved "≤ 3.4°". The code doesn't change.

### 5.5 All templates
1. **GLSL `pow()`:** no `pow()` with a possibly negative base, anywhere. Today it appears in Particle
   Horizon, Nova Streak and Neon Sundown; check every template. Clamp the base, or use the
   form that keeps the current look. It is undefined on other GPUs, such as RunPod's.
2. **Toolkit copies:** a Vitest test checks that each template's `assets/viz-toolkit.js` is identical to
   `templates/shared/viz-toolkit.js`, and that `assets/three-kit.js` (where present) is
   identical to `templates/shared/three-kit.js`.

### 5.6 Online version (PR #12)
1. **Login body:** the login route refuses a request body over 4 KB with status 413 and
   "That request is too big." A password over 256 characters gets the normal wrong-login
   answer without running scrypt.
2. **GPU check overlap:** an export started while the start-up GPU check is running waits for the
   check to finish (whatever its result) before rendering. Meanwhile its progress text says
   "Waiting for the start-up check…", and Cancel works while it waits.
3. **Log out (documented, not changed):** the guide says that Log out signs out only that
   browser, and that changing `SESSION_SECRET` (then restarting the pod) signs everyone out
   everywhere.
4. **`add-user`:** after the line it prints, it says that in a `.env` file each `$` must be written as
   `\$`. RunPod's settings take the line as it is.
5. **Guide:** pods with a network volume may offer only Terminate, not Stop. The guide's §2 says
   so.
6. **`.dockerignore`:** add `**/*.aac` and `**/*.ogg`.
7. **Workflows:** pin every `uses:` action to a full commit SHA, with the version tag in a comment.

### 5.7 Docs
- CLAUDE.md: mark M7 done when merged; remove the stale "PRs #9–#11 merge in order" note.

## 6. Testing

- Unit tests (Vitest):
  - presets: look fields, apply, highlight, colour comparison
  - the undo history: steps, the 1 s join rule, same field only, 100-step cap, redo dropped
    after a new change
  - the shake-seed frames
  - toolkit copies
  - the login body and password caps
  - the export waiting for the GPU check, including Cancel while waiting
  - the add-user hint
- Preview-only template fixes: compare 360p preview frames against export frames at the same
  times (the method used for M6). For the ridge outline, look at a frame where both ridges
  show.
- In the browser: pick each preset, undo and redo it, check the shortcuts are ignored inside a
  text box, and check the highlight.
