/*
 * Ember Mesh's motion: the huge sheet of dots (its rolling waves, its fold into an arch and its
 * twist), the size of each dot, the heat-map colours across its width, the camera (a seeded
 * order of six poses: it glides from one to the next and jumps ahead on strong beats), the
 * overlay's beat pulse and its line waveform.
 *
 * Everything is worked out from the song time and the beat list alone, never from earlier
 * frames, so any frame can be drawn on its own, a section matches the full render and every
 * render is identical. Pure: no DOM, so Vitest tests it directly.
 *
 * World units: the sheet lies along x (220 columns) and across z (70 rows), y up; dots are
 * 0.2 apart. Overlay sizes are 1080p pixels.
 */
(function () {
  "use strict";

  // ---------- the sheet ----------
  var COLS = 220; // dots along the sheet
  var ROWS = 70; // dots across it
  var COUNT = COLS * ROWS; // 15,400: one draw call
  var SPACING = 0.2;
  var HALF_X = ((COLS - 1) * SPACING) / 2; // 21.9
  var HALF_Z = ((ROWS - 1) * SPACING) / 2; // 6.9
  var STRIDE = 4; // per dot: x, y, z, size (× the base dot size)
  var H_MAX = 3.4; // wave heights never pass this (a soft cap)
  var CALM = 0.35; // how high the waves roll in silence
  var LIFT = 2.0; // extra wave height at full bass, intensity 1
  var RIDGE = 1.5; // the spectrum's ridges along the sheet at their loudest, intensity 1
  var RIDGE_FULL = 48; // ridges at Bands 100 % (27 at the default 50 %)

  // ---------- the camera ----------
  // Song time is cut into slots. In each slot the camera glides from this slot's pose to the
  // next one in the order; a strong beat in the slot's first second makes it jump ahead to the
  // next pose in a quarter of a second instead, and it holds that pose to the slot's end. So
  // two jumps are always at least SLOT - JUMP_WINDOW = 4 s apart, and the camera only needs the
  // beats of the current slot (5 s at most): a section's 6 s of analysis before its start is
  // enough for it to match the full render.
  var SLOT = 5;
  var JUMP_WINDOW = 1;
  var MIN_GAP = 4;
  var JUMP_EASE = 0.25;
  var STRONG = 0.5; // a beat at least this strong (the upper half of beats) may move the camera
  var HIT_LOOKBACK = 64; // recent beats asked for (far more than fit in a slot)
  var POSE_SEED = 4049;
  // The six poses. yaw: around the sheet (0 = side-on, from +z); pitch: up from the sheet;
  // dist: from the target; roll: tilts the view; fov: vertical field of view (radians);
  // tx/ty/tz: what the camera looks at; bend: folds the sheet up into an arch (radians of
  // arc over its length; negative: a valley); twist: turns the sheet about its length.
  var POSES = [
    // a band across the screen, side-on
    {
      yaw: 0.06,
      pitch: 0.26,
      dist: 31,
      roll: 0.0,
      fov: 0.78,
      tx: 0,
      ty: 0.6,
      tz: 0,
      bend: 0.15,
      twist: 0.35,
    },
    // a steep close-up: the nearest dots read as spheres
    {
      yaw: 0.95,
      pitch: 0.42,
      dist: 6.5,
      roll: 0.12,
      fov: 0.95,
      tx: 5.5,
      ty: 0.4,
      tz: 0.5,
      bend: -0.2,
      twist: 0.1,
    },
    // the sheet folds up into a tall arch
    {
      yaw: 0.2,
      pitch: 0.14,
      dist: 25,
      roll: -0.04,
      fov: 0.9,
      tx: 0,
      ty: -7,
      tz: 0,
      bend: 2.5,
      twist: 0.25,
    },
    // from high up, tilted, the ribbon twisting under us
    {
      yaw: 0.55,
      pitch: 1.0,
      dist: 21,
      roll: 0.35,
      fov: 0.85,
      tx: -2,
      ty: 0,
      tz: 0,
      bend: -0.5,
      twist: 1.1,
    },
    // low, down the length of the sheet: a river of dots
    {
      yaw: 1.42,
      pitch: 0.2,
      dist: 12,
      roll: -0.08,
      fov: 1.0,
      tx: 9,
      ty: 0.8,
      tz: 0,
      bend: 0.35,
      twist: 0.3,
    },
    // a twisted, bent ribbon, swung round
    {
      yaw: -0.5,
      pitch: 0.32,
      dist: 25,
      roll: -0.22,
      fov: 0.85,
      tx: 0,
      ty: -2.2,
      tz: 0,
      bend: 1.3,
      twist: 2.1,
    },
  ];
  var NEAR = 0.3;
  var FAR = 300;

  // ---------- the overlay ----------
  var PULSE_RELEASE = 0.3; // the beat envelope's release (s)
  var BEAT_SCALE = 0.03; // the overlay grows by this on a full beat
  var COVER_SIZE = 220;
  var WAVE_POINTS = 128;
  var WAVE_CURVES = 3;
  var WAVE_MAX = 28; // px each way from the line
  var WAVES = [
    // cycles across the line, speed (rad/s), phase, gain
    [2.6, 1.9, 0.0, 1.0],
    [3.7, -2.4, 2.1, 0.72],
    [5.1, 3.1, 4.3, 0.5],
  ];

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }
  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }

  /** The Bands setting (10..100 %) as a number of ridges along the sheet. */
  function ridgeCount(bandPct) {
    var p = clamp(finite(Number(bandPct), 50), 10, 100);
    return Math.round(RIDGE_FULL * (0.2 + (0.8 * (p - 10)) / 90));
  }

  /**
   * From the spectrum laid along the sheet (mirrorBars, bass in the middle): `lift`, how much
   * the bass lifts the waves (the mean, squared: 0.3 → 0.09, 0.9 → 0.81), and `ridges`, each
   * value against the loudest, squared, so the ridges stand out even when every band is high.
   */
  function shapeLevels(line) {
    var n = line.length;
    var max = 0,
      sum = 0;
    for (var i = 0; i < n; i++) {
      var v = clamp(finite(line[i], 0), 0, 1);
      sum += v;
      if (v > max) max = v;
    }
    var mean = n > 0 ? sum / n : 0;
    var ridges = new Float32Array(n);
    if (max > 1e-6) {
      for (var k = 0; k < n; k++) {
        var r = clamp(finite(line[k], 0), 0, 1) / max;
        ridges[k] = r * r;
      }
    }
    return { lift: mean * mean, ridges: ridges };
  }

  /** How high the waves roll: calm in silence, lifted by the bass, × intensity. */
  function waveAmp(lift, intensity) {
    return CALM + LIFT * clamp(finite(lift, 0), 0, 1) * Math.max(0, finite(intensity, 1));
  }

  /**
   * The sheet's height at (x, z) (flat sheet coordinates) at a song time: three travelling
   * waves (a long roll along the sheet, a shorter one at an angle and a ripple across it) of
   * height `amp`, plus the spectrum's ridge here (`ridge`), softly capped at H_MAX.
   */
  function heightAt(x, z, songTime, amp, ridge) {
    var s = songTime;
    var w =
      0.55 * Math.sin(0.27 * x + 0.07 * z - 1.1 * s) +
      0.3 * Math.sin(0.52 * x - 0.28 * z - 1.75 * s + 1.3) +
      0.15 * Math.sin(1.05 * z + 0.3 * x + 2.2 * s + 2.1);
    var h = amp * w + ridge * (0.75 + 0.25 * Math.sin(0.6 * x - 2.2 * s));
    return H_MAX * Math.tanh(h / H_MAX);
  }

  /** The ridge value at u (-1..1 along the sheet), smoothly between the given values. */
  function ridgeAt(ridges, u) {
    var n = ridges.length;
    if (n === 0) return 0;
    if (n === 1) return ridges[0];
    var x = clamp((u + 1) / 2, 0, 1) * (n - 1);
    var i0 = Math.floor(x),
      i1 = Math.min(n - 1, i0 + 1);
    var f = (1 - Math.cos(Math.PI * (x - i0))) / 2;
    return ridges[i0] + (ridges[i1] - ridges[i0]) * f;
  }

  /** A dot's size (× the base size) from the wave height under it: crests swell. */
  function dotScale(h) {
    var t = clamp((finite(h, 0) + 0.15 * H_MAX) / (0.95 * H_MAX), 0, 1);
    return 0.7 + t * t * (3 - 2 * t);
  }

  /**
   * Every dot of the sheet for a song time: `levels` from shapeLevels, the pose's bend and
   * twist. Writes x, y, z, size per dot into `out` (dot i = column × ROWS + row) and returns it.
   * The sheet is bent along a circle (so it folds without stretching), twisted about its
   * length, and each dot is pushed out along the sheet's normal by its wave height.
   */
  function buildSheet(out, songTime, levels, intensity, pose) {
    var s = finite(songTime, 0);
    var inten = Math.max(0, finite(intensity, 1));
    var amp = waveAmp(levels.lift, inten);
    var ridgeGain = RIDGE * clamp(finite(levels.lift, 0), 0, 1) * inten;
    var bend = finite(pose.bend, 0);
    var twist = finite(pose.twist, 0);
    var o = 0;
    for (var c = 0; c < COLS; c++) {
      var u = (c / (COLS - 1)) * 2 - 1;
      var x0 = u * HALF_X;
      var th = u * bend;
      var cx, cy;
      if (Math.abs(bend) < 1e-4) {
        cx = x0;
        cy = 0;
      } else {
        cx = (HALF_X * Math.sin(th)) / bend;
        cy = (HALF_X * (Math.cos(th) - 1)) / bend;
      }
      var st = Math.sin(th),
        ct = Math.cos(th);
      var ph = twist * u;
      var sp = Math.sin(ph),
        cp = Math.cos(ph);
      // the sheet's normal and its across direction here
      var nx = st * cp,
        ny = ct * cp,
        nz = sp;
      var bx = -st * sp,
        by = -ct * sp,
        bz = cp;
      var ridge = ridgeAt(levels.ridges, u) * ridgeGain;
      for (var r = 0; r < ROWS; r++) {
        var w = (r / (ROWS - 1)) * 2 - 1;
        var z0 = w * HALF_Z;
        var h = heightAt(x0, z0, s, amp, ridge * (1 - w * w));
        out[o] = cx + z0 * bx + h * nx;
        out[o + 1] = cy + z0 * by + h * ny;
        out[o + 2] = z0 * bz + h * nz;
        out[o + 3] = dotScale(h);
        o += STRIDE;
      }
    }
    return out;
  }

  // ---------- colours ----------
  function toHSV(c) {
    var r = c[0],
      g = c[1],
      b = c[2];
    var max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    var h = 0;
    if (d > 1e-9) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max > 1e-9 ? d / max : 0, max];
  }
  function fromHSV(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = v - c;
    var rgb =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
  }

  /**
   * `n` colours from the main colour to the accent, turning the hue the short way round (the
   * original's yellow → orange → red → magenta → purple: a heat map), as RGB triples 0..1.
   */
  function heatPalette(main, accent, n) {
    var a = toHSV(main),
      b = toHSV(accent);
    if (a[1] < 1e-3) a[0] = b[0]; // a grey takes the other colour's hue
    if (b[1] < 1e-3) b[0] = a[0];
    var dh = b[0] - a[0];
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    var out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) : 0;
      var c = fromHSV(a[0] + dh * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    }
    return out;
  }

  /** Where a row sits in the heat map: 0 (main colour) along the middle, 1 at the edges. */
  function rowHeat(row) {
    var w = Math.abs((row / (ROWS - 1)) * 2 - 1);
    return Math.pow(clamp((w - 0.1) / 0.9, 0, 1), 1.6);
  }

  /** Every dot's colour (r, g, b), from a heat palette: fixed, so worked out once. */
  function sheetColors(palette) {
    var n = palette.length / 3;
    var out = new Float32Array(COUNT * 3);
    for (var c = 0; c < COLS; c++) {
      for (var r = 0; r < ROWS; r++) {
        var x = rowHeat(r) * (n - 1);
        var i0 = Math.floor(x),
          i1 = Math.min(n - 1, i0 + 1),
          f = x - i0;
        var o = (c * ROWS + r) * 3;
        for (var k = 0; k < 3; k++)
          out[o + k] = palette[i0 * 3 + k] + (palette[i1 * 3 + k] - palette[i0 * 3 + k]) * f;
      }
    }
    return out;
  }

  // ---------- the camera ----------
  var permCache = {};
  /** The seeded order of the six poses in block `block` (slots 6·block .. 6·block + 5). */
  function rawPerm(block, mulberry32) {
    var rnd = mulberry32(POSE_SEED + block * 7919);
    var p = [0, 1, 2, 3, 4, 5];
    for (var i = 5; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    return p;
  }
  function perm(block, mulberry32) {
    if (permCache[block]) return permCache[block];
    var p = rawPerm(block, mulberry32);
    // never the same pose twice in a row across the join between two blocks
    if (p[0] === rawPerm(block - 1, mulberry32)[5]) {
      var tmp = p[0];
      p[0] = p[1];
      p[1] = tmp;
    }
    permCache[block] = p;
    return p;
  }
  /** The pose (0..5) the camera arrives at when slot `slot` starts. */
  function poseIndex(slot, mulberry32) {
    var block = Math.floor(slot / 6);
    return perm(block, mulberry32)[slot - block * 6];
  }

  var KEYS = ["yaw", "pitch", "dist", "roll", "fov", "tx", "ty", "tz", "bend", "twist"];
  function lerpPose(a, b, f) {
    var p = {};
    for (var i = 0; i < KEYS.length; i++) p[KEYS[i]] = a[KEYS[i]] + (b[KEYS[i]] - a[KEYS[i]]) * f;
    return p;
  }
  /** Catmull-Rom through four poses: p1 at f = 0, p2 at f = 1, smooth through both. */
  function splinePose(p0, p1, p2, p3, f) {
    var f2 = f * f,
      f3 = f2 * f;
    var p = {};
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      p[k] =
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * f +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
    }
    return p;
  }
  /** The gliding camera in slot `slot`, `f` (0..1) of the way through it. */
  function glidePose(slot, f, mulberry32) {
    return splinePose(
      POSES[poseIndex(slot - 1, mulberry32)],
      POSES[poseIndex(slot, mulberry32)],
      POSES[poseIndex(slot + 1, mulberry32)],
      POSES[poseIndex(slot + 2, mulberry32)],
      f,
    );
  }
  /** A slow sway on top of every pose, from the song time, so the camera never stands still. */
  function drift(p, s) {
    p.yaw += 0.18 * Math.sin(0.11 * s);
    p.pitch += 0.04 * Math.sin(0.17 * s + 1);
    p.dist *= 1 + 0.05 * Math.sin(0.13 * s + 2);
    p.pitch = clamp(p.pitch, -1.25, 1.25);
    p.dist = Math.max(4, p.dist);
    p.fov = clamp(p.fov, 0.4, 1.3);
    return p;
  }

  /**
   * The camera at a song time. `hits` are the recent beats, [age in seconds, strength] newest
   * first (the toolkit's recentHits at this moment); `moves` is the Camera moves setting.
   * Returns the pose, the slot, and the song time of the beat the camera jumped on in this
   * slot (on its song frame, so a section and the full song agree), or -1.
   */
  function cameraAt(songTime, hits, moves, fps, mulberry32) {
    var s = finite(songTime, 0);
    var slot = Math.floor(s / SLOT);
    var slotStart = slot * SLOT;
    var f = (s - slotStart) / SLOT;
    var pose = glidePose(slot, f, mulberry32);
    var jumpAt = -1;
    if (moves && hits && hits.length) {
      var rate = finite(fps, 30);
      var first = Math.round(slotStart * rate);
      var last = Math.round((slotStart + JUMP_WINDOW) * rate); // the window's end (not in it)
      var found = -1;
      for (var i = 0; i < hits.length; i++) {
        var frame = Math.round((s - hits[i][0]) * rate);
        if (frame < first) break; // older than this slot (hits come newest first)
        if (frame < last && hits[i][1] >= STRONG) found = frame; // ends on the earliest
      }
      if (found >= 0) {
        jumpAt = found / rate;
        var target = POSES[poseIndex(slot + 1, mulberry32)];
        var from = glidePose(slot, (jumpAt - slotStart) / SLOT, mulberry32);
        var k = clamp((s - jumpAt) / JUMP_EASE, 0, 1);
        var e = 1 - (1 - k) * (1 - k) * (1 - k);
        pose = lerpPose(from, target, e);
        // then a gentle push in while it holds the pose, back out by the slot's end
        var q = clamp((s - jumpAt - JUMP_EASE) / (slotStart + SLOT - jumpAt - JUMP_EASE), 0, 1);
        pose.dist *= 1 - 0.12 * Math.sin(Math.PI * q);
      }
    }
    return { pose: drift(pose, s), slot: slot, jumpAt: jumpAt };
  }

  function eyeOf(pose) {
    var cp = Math.cos(pose.pitch);
    return [
      pose.tx + pose.dist * cp * Math.sin(pose.yaw),
      pose.ty + pose.dist * Math.sin(pose.pitch),
      pose.tz + pose.dist * cp * Math.cos(pose.yaw),
    ];
  }
  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  /** The pose's view × projection matrix (column-major, for uniformMatrix4fv). */
  function viewProjection(pose, aspect) {
    var eye = eyeOf(pose);
    var fw = norm([pose.tx - eye[0], pose.ty - eye[1], pose.tz - eye[2]]);
    var right = norm(cross(fw, [0, 1, 0]));
    var up = cross(right, fw);
    var cr = Math.cos(pose.roll),
      sr = Math.sin(pose.roll);
    var r2 = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
    var u2 = [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr];
    // the view matrix's rows: right, up, -forward
    var V = [
      [r2[0], r2[1], r2[2], -dot(r2, eye)],
      [u2[0], u2[1], u2[2], -dot(u2, eye)],
      [-fw[0], -fw[1], -fw[2], dot(fw, eye)],
      [0, 0, 0, 1],
    ];
    var fy = 1 / Math.tan(pose.fov / 2);
    var P = [
      [fy / aspect, 0, 0, 0],
      [0, fy, 0, 0],
      [0, 0, (FAR + NEAR) / (NEAR - FAR), (2 * FAR * NEAR) / (NEAR - FAR)],
      [0, 0, -1, 0],
    ];
    var out = new Float32Array(16);
    for (var row = 0; row < 4; row++)
      for (var col = 0; col < 4; col++) {
        var sum = 0;
        for (var k = 0; k < 4; k++) sum += P[row][k] * V[k][col];
        out[col * 4 + row] = sum;
      }
    return out;
  }

  /** Pixels per world unit at depth 1, for a picture `heightPx` tall (dot sizes by depth). */
  function pixelScale(pose, heightPx) {
    return heightPx / 2 / Math.tan(pose.fov / 2);
  }

  // ---------- the overlay ----------
  /** The overlay's scale for a beat envelope (0..1). */
  function overlayScale(env) {
    return 1 + BEAT_SCALE * clamp(finite(env, 0), 0, 1);
  }

  /**
   * The line waveform under the title: WAVE_CURVES smooth curves (px offsets from the line,
   * WAVE_POINTS each) whose height follows `values` (the smoothed spectrum along the line,
   * WAVE_POINTS of them), squared so loud music still varies, tapering to nothing at both ends.
   * Flat in silence; never more than WAVE_MAX.
   */
  function waveCurves(values, songTime, intensity) {
    var s = finite(songTime, 0);
    var gain = 0.55 + 0.45 * Math.max(0, finite(intensity, 1));
    var curves = [];
    for (var c = 0; c < WAVE_CURVES; c++) {
      var w = WAVES[c];
      var out = new Float32Array(WAVE_POINTS);
      for (var i = 0; i < WAVE_POINTS; i++) {
        var x = i / (WAVE_POINTS - 1);
        var v = clamp(finite(values[i], 0), 0, 1);
        var a = WAVE_MAX * w[3] * Math.min(1, v * v * gain);
        var taper = Math.pow(Math.max(0, Math.sin(Math.PI * x)), 1.5);
        out[i] =
          Math.abs(a) < 1e-9 ? 0 : a * taper * Math.sin(2 * Math.PI * w[0] * x + w[2] + w[1] * s);
      }
      curves.push(out);
    }
    return curves;
  }

  var api = {
    COLS: COLS,
    ROWS: ROWS,
    COUNT: COUNT,
    STRIDE: STRIDE,
    SPACING: SPACING,
    HALF_X: HALF_X,
    HALF_Z: HALF_Z,
    H_MAX: H_MAX,
    CALM: CALM,
    SLOT: SLOT,
    JUMP_WINDOW: JUMP_WINDOW,
    MIN_GAP: MIN_GAP,
    JUMP_EASE: JUMP_EASE,
    STRONG: STRONG,
    HIT_LOOKBACK: HIT_LOOKBACK,
    POSES: POSES,
    PULSE_RELEASE: PULSE_RELEASE,
    BEAT_SCALE: BEAT_SCALE,
    COVER_SIZE: COVER_SIZE,
    WAVE_POINTS: WAVE_POINTS,
    WAVE_CURVES: WAVE_CURVES,
    WAVE_MAX: WAVE_MAX,
    ridgeCount: ridgeCount,
    shapeLevels: shapeLevels,
    waveAmp: waveAmp,
    heightAt: heightAt,
    ridgeAt: ridgeAt,
    dotScale: dotScale,
    buildSheet: buildSheet,
    heatPalette: heatPalette,
    rowHeat: rowHeat,
    sheetColors: sheetColors,
    poseIndex: poseIndex,
    cameraAt: cameraAt,
    viewProjection: viewProjection,
    pixelScale: pixelScale,
    overlayScale: overlayScale,
    waveCurves: waveCurves,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.MeshMotion = api;
})();
