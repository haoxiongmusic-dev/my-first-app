/*
 * Neon Coil's motion: the coil (a fan of glowing lines twisted into a ribbon that sweeps from
 * the bottom-left, up and over to the right, slowly turning), its beat pump, the blobs that
 * bulge up and down along the glowing line, and the rare glitch streaks near the top.
 * Everything is worked out from the song time alone (or seeded), so any frame can be drawn on
 * its own, a section matches the full render and every render is identical. Pure: no DOM, so
 * Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  // The cover (square, left-middle) and the glowing line that runs from it to the right edge.
  var COVER_X = 340; // centre
  var COVER_Y = 545;
  var COVER_SIZE = 300;
  var LINE_Y = 600;
  var LINE_X0 = COVER_X + COVER_SIZE / 2;
  var LINE_X1 = 1920;
  // The blobs on the line: 12 lens shapes side by side, bass at the left.
  var BLOB_COUNT = 12;
  var BLOB_MAX = 50; // px each way from the line at intensity 1
  var BLOB_X0 = 556;
  var BLOB_X1 = 1876;
  var BLOB_TAPER = 0.3; // values are tilted toward the bass: the rightmost loses this share
  var VALLEY = 0.35; // shapeLevels: a level well below the loudest keeps this share
  var SPREAD_MIN = 0.25; // shapeLevels: how far below the loudest a level drops back fully
  // The beat: an envelope with this release (s) pumps the coil and scales the cover and text.
  var PUMP_RELEASE = 0.3;
  var BEAT_SCALE = 0.03;
  var PUMP_SPREAD = 0.12; // the fan opens this much wider on a full beat (intensity 1)
  var PUMP_GLOW = 0.7; // and shines this much brighter
  // The coil.
  var LINE_FULL = 52; // lines in the fan at Bands 100 % (≈ 40 at the default 75 %)
  var SEGMENTS = 110; // straight pieces along each line
  var STRIDE = 4; // x, y, depth (-1 back .. 1 front), fade (0..1 along the coil)
  var PHASE_RATE = 0.32; // rad/s: how fast the ribbon turns about its spine
  var TWIST = 1.6; // turns of the ribbon along the coil's length
  var BOW = 0.3; // the ribbon is a little curved across, so its pinches are not one line
  var LIFT = 0.06; // a loud line sits this much farther out in the fan
  var WIDTH_ROOT = 34; // half-width (px) at the bottom-left root
  var WIDTH_FULL = 236; // half-width (px) once it has fanned out
  // The spine through these points (Catmull-Rom), gently swaying with the time.
  var SPINE = [
    [-260, 1290],
    [-60, 1110],
    [250, 800],
    [560, 390],
    [960, 150],
    [1420, 150],
    [1790, 400],
    [2010, 760],
    [2150, 1000],
  ];
  var SWAY = 22; // px
  // Glitch streaks: in each slot of song time, maybe one short burst near the top.
  var GLITCH_SLOT = 0.5; // s
  var GLITCH_CHANCE = 0.2;
  var GLITCH_TOP = 300; // px: streaks stay above this

  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function smoothstep(a, b, x) {
    var f = clamp01((x - a) / (b - a));
    return f * f * (3 - 2 * f);
  }
  function intensityOf(x) {
    return Math.max(0.2, Math.min(2, finite(x, 1)));
  }

  /** The Bands setting (10..100 %) as a number of coil lines: a fifth of the full fan up to all. */
  function lineCount(bandPct) {
    var pct = Math.max(10, Math.min(100, finite(bandPct, 75)));
    return Math.round(LINE_FULL * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  /** How far the ribbon has turned about its spine (radians) at this song time. */
  function coilPhase(songTime) {
    var s = finite(songTime, 0);
    return s === 0 ? 0 : s * PHASE_RATE;
  }

  function catmull(p0, p1, p2, p3, f) {
    var f2 = f * f,
      f3 = f2 * f;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * f +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * f3)
    );
  }
  /** The spine before it sways: s 0 (bottom-left root) .. 1 (off the right edge). */
  function baseSpine(s) {
    var n = SPINE.length - 3; // pieces between SPINE[1] and SPINE[n + 1]
    var x = Math.max(0, Math.min(1, s)) * n;
    var i = Math.min(n - 1, Math.floor(x));
    var f = x - i;
    return [
      catmull(SPINE[i][0], SPINE[i + 1][0], SPINE[i + 2][0], SPINE[i + 3][0], f),
      catmull(SPINE[i][1], SPINE[i + 1][1], SPINE[i + 2][1], SPINE[i + 3][1], f),
    ];
  }
  /**
   * A point on the coil's spine at s (0..1) and song time: [x, y, nx, ny], (nx, ny) the unit
   * normal (to the left of the direction of travel). The spine sways a little with the time.
   */
  function spinePoint(s, songTime) {
    s = Math.max(0, Math.min(1, finite(s, 0)));
    var time = finite(songTime, 0);
    var e = 0.002;
    var a = baseSpine(s - e),
      b = baseSpine(s + e),
      p = baseSpine(s);
    var dx = b[0] - a[0],
      dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dy / len,
      ny = -dx / len;
    var sway = SWAY * Math.sin(2 * Math.PI * 0.9 * s - 0.3 * time) * smoothstep(0, 0.3, s);
    return [p[0] + nx * sway, p[1] + ny * sway, nx, ny];
  }

  /** The ribbon's half-width (px) at s: narrow at its root, fanning out as it rises. */
  function coilWidth(s) {
    return WIDTH_ROOT + (WIDTH_FULL - WIDTH_ROOT) * smoothstep(0, 0.55, finite(s, 0));
  }

  /** The beat pump: how much wider the fan opens and how much brighter it shines (≥ 1). */
  function pump(env, intensity) {
    var e = clamp01(env) * intensityOf(intensity);
    return { spread: 1 + PUMP_SPREAD * e, glow: 1 + PUMP_GLOW * e };
  }

  /**
   * Every coil line as points along the coil: `count` lines × (SEGMENTS + 1) points, each
   * x, y, depth, fade (STRIDE values). Line i sits at u (-1..1) across a slightly curved
   * ribbon that turns about the spine (TWIST turns along it, advancing with the song time), so
   * each line is a helix-like curve offset in phase from its neighbours: where the ribbon turns
   * edge-on they bunch together (white-hot), where it faces the viewer they fan out. `levels`
   * (one per line, 0..1) set each line a little farther out when loud; `env` (the beat
   * envelope) opens the fan.
   */
  function coilLines(count, levels, songTime, env, intensity) {
    var n = Math.max(1, Math.floor(finite(count, 1)));
    var P = SEGMENTS + 1;
    var out = new Float32Array(n * P * STRIDE);
    var time = finite(songTime, 0);
    var phase = coilPhase(time);
    var spread = pump(env, intensity).spread;
    for (var j = 0; j < P; j++) {
      var s = j / SEGMENTS;
      var sp = spinePoint(s, time);
      var a = coilWidth(s) * spread;
      var phi = TWIST * 2 * Math.PI * s + phase;
      var c = Math.cos(phi),
        sn = Math.sin(phi);
      var fade = smoothstep(0, 0.07, s) * smoothstep(1, 0.93, s);
      for (var i = 0; i < n; i++) {
        var u = n > 1 ? (2 * i) / (n - 1) - 1 : 0;
        var lift = 1 + LIFT * clamp01(levels ? levels[i] : 0);
        var X = u * lift,
          Z = BOW * (1 - u * u);
        var off = (X * c - Z * sn) * a;
        var depth = X * sn + Z * c;
        var o = (i * P + j) * STRIDE;
        out[o] = sp[0] + sp[2] * off;
        out[o + 1] = sp[1] + sp[3] * off;
        out[o + 2] = Math.max(-1, Math.min(1, depth));
        out[o + 3] = fade;
      }
    }
    return out;
  }

  /**
   * Levels shaped against the loudest of them: the loudest keep their level, ones well below
   * drop back to VALLEY of theirs, so a loud, nearly full spectrum still shows big and small.
   */
  function shapeLevels(values) {
    var n = values.length;
    var hi = 0;
    for (var i = 0; i < n; i++) hi = Math.max(hi, clamp01(values[i]));
    var out = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var x = clamp01(values[k]);
      out[k] = x * (VALLEY + (1 - VALLEY) * clamp01(1 - (hi - x) / SPREAD_MIN));
    }
    return out;
  }

  /** Seeded size variety for the 12 blobs (0.7..1), the same every time. */
  function blobWeights(mulberry32) {
    var rand = mulberry32(4242);
    var out = new Float32Array(BLOB_COUNT);
    for (var i = 0; i < BLOB_COUNT; i++) out[i] = 0.7 + 0.3 * rand();
    return out;
  }

  /** The centre (x) of blob i along the line. */
  function blobCentre(i) {
    return BLOB_X0 + ((BLOB_X1 - BLOB_X0) * (i + 0.5)) / BLOB_COUNT;
  }

  /**
   * How far each blob bulges (px, each way from the line): the 12 values sampled along the
   * line (bass at the left), tilted toward the bass, shaped and raised to the power 1.6 so
   * they vary, weighted, and capped at BLOB_MAX × intensity. Silence gives 0 (the bare line).
   */
  function blobHeights(values, weights, intensity) {
    // tilt toward the bass before shaping, so the left end leads (as the reference does)
    var tilted = new Float32Array(BLOB_COUNT);
    for (var k = 0; k < BLOB_COUNT; k++) {
      tilted[k] = clamp01(values[k]) * (1 - (BLOB_TAPER * k) / (BLOB_COUNT - 1));
    }
    var shaped = shapeLevels(tilted);
    var cap = BLOB_MAX * intensityOf(intensity);
    var out = new Float32Array(BLOB_COUNT);
    for (var i = 0; i < BLOB_COUNT; i++) {
      var w = clamp01(weights ? weights[i] : 1);
      out[i] = Math.min(cap, cap * Math.pow(shaped[i], 1.6) * w);
    }
    return out;
  }

  /**
   * The bulge (px, each way from the line) at x: each blob a symmetric lens, tallest at its
   * centre and pinched back to the bare line where it meets its neighbours.
   */
  function blobProfile(heights, x) {
    var span = (BLOB_X1 - BLOB_X0) / BLOB_COUNT;
    var i = Math.floor((x - BLOB_X0) / span);
    if (!(i >= 0 && i < BLOB_COUNT)) return 0;
    var d = (x - blobCentre(i)) / (span / 2);
    var f = 1 - d * d;
    var h = heights[i] > 0 ? heights[i] : 0;
    return f > 0 ? h * f * f : 0;
  }

  /**
   * The glitch streaks on screen at this song time: [{ y, x0, x1, thick, alpha }]. Each slot
   * of GLITCH_SLOT seconds is seeded by its index in the song, so a section shows exactly the
   * streaks of the full render; about one slot in five has a short burst of one to three thin
   * lines near the top.
   */
  function glitchStreaks(songTime, mulberry32) {
    if (!(songTime >= 0) || !isFinite(songTime)) return [];
    var slot = Math.floor(songTime / GLITCH_SLOT);
    var rand = mulberry32(90001 + slot * 7);
    if (rand() >= GLITCH_CHANCE) return [];
    var dur = 0.06 + 0.16 * rand();
    var start = (GLITCH_SLOT - dur) * rand();
    var local = songTime - slot * GLITCH_SLOT;
    if (local < start || local > start + dur) return [];
    var lines = 1 + Math.floor(rand() * 2);
    var y = 26 + (GLITCH_TOP - 60) * rand();
    var x = -100 + 1700 * rand();
    var out = [];
    for (var k = 0; k < lines; k++) {
      // each line is broken into a few dashes with gaps, like a torn scanline
      var ly = Math.min(GLITCH_TOP, y + (k === 0 ? 0 : 4 + 12 * rand()));
      var lx = x + (k === 0 ? 0 : (rand() - 0.5) * 300);
      var parts = 1 + Math.floor(rand() * 4);
      var thick = k === 0 ? 1.2 + 1.3 * rand() : 0.8 + 0.7 * rand();
      for (var d = 0; d < parts; d++) {
        var len = 30 + 260 * rand();
        out.push({
          y: ly,
          x0: lx,
          x1: lx + len,
          thick: thick,
          alpha: (k === 0 ? 0.6 : 0.35) + 0.4 * rand(),
        });
        lx += len + 8 + 60 * rand();
      }
    }
    return out;
  }

  /** The cover and text block's size on the beat: 1 + 0.03 × env (1 when switched off). */
  function coverScale(env, on) {
    return on ? 1 + BEAT_SCALE * clamp01(env) : 1;
  }

  /** How brightly the coil shines for the song's loudness (0..1): dim but there in silence. */
  function glowLevel(loud) {
    return 0.38 + 0.9 * clamp01(loud);
  }

  var api = {
    COVER_X: COVER_X,
    COVER_Y: COVER_Y,
    COVER_SIZE: COVER_SIZE,
    LINE_Y: LINE_Y,
    LINE_X0: LINE_X0,
    LINE_X1: LINE_X1,
    BLOB_COUNT: BLOB_COUNT,
    BLOB_MAX: BLOB_MAX,
    PUMP_RELEASE: PUMP_RELEASE,
    BEAT_SCALE: BEAT_SCALE,
    LINE_FULL: LINE_FULL,
    SEGMENTS: SEGMENTS,
    STRIDE: STRIDE,
    PHASE_RATE: PHASE_RATE,
    GLITCH_TOP: GLITCH_TOP,
    GLITCH_SLOT: GLITCH_SLOT,
    VALLEY: VALLEY,
    lineCount: lineCount,
    coilPhase: coilPhase,
    spinePoint: spinePoint,
    coilWidth: coilWidth,
    pump: pump,
    coilLines: coilLines,
    shapeLevels: shapeLevels,
    blobWeights: blobWeights,
    blobCentre: blobCentre,
    blobHeights: blobHeights,
    blobProfile: blobProfile,
    glitchStreaks: glitchStreaks,
    coverScale: coverScale,
    glowLevel: glowLevel,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.CoilMotion = api;
})();
