/*
 * World Orbit's motion: the title's letters orbiting the planet like a ring (where each letter
 * sits, how big and bright it is, and whether it is in front of the planet or behind it), the
 * planet's turn and beat pulse, the spectrum rays round its rim, the light-leak streak that
 * sweeps across now and then, and the slow camera drift. Everything is worked out from the song
 * time alone (or seeded), so any frame can be drawn on its own, a section matches the full
 * render and every render is identical. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  // The planet: centred, a little above the middle so the artist fits under it.
  var PLANET_X = 960;
  var PLANET_Y = 505;
  var PLANET_R = 230;
  var SPIN_SECONDS = 60; // one turn a minute
  // The ring of letters: an ellipse round the planet, seen from a little above, slightly tilted.
  var RING_RX = 420;
  var RING_RY = 70;
  var RING_TILT = -0.11; // radians: the right side a little higher
  var SIN_VIEW = RING_RY / RING_RX; // how far above the ring we look from (sin of the angle)
  var COS_VIEW = Math.sqrt(1 - SIN_VIEW * SIN_VIEW);
  var DEPTH_SCALE = 0.17; // letters are this much bigger at the front, smaller at the back
  var BACK_BRIGHT = 0.3; // brightness at the very back (the front is 1)
  var MIN_FACE = 0.08; // a letter seen edge-on at the side keeps this share of its width
  var ORBIT_DEFAULT = 12;
  var ORBIT_MIN = 6;
  var ORBIT_MAX = 30;
  // The title: big capitals, repeated round the ring when short, shrunk to fit when long.
  var TITLE_SIZE = 120; // px: the font size at most
  // The beat: an envelope with this release (s) pulses the planet.
  var PULSE_RELEASE = 0.25;
  var BEAT_SCALE = 0.03;
  // The rays: fine radial lines from the rim, one per band position.
  var RAY_FULL = 180;
  var RAY_MAX = 60; // px at intensity 1
  var VALLEY = 0.3; // shapeLevels: a level well below the loudest keeps this share
  var SPREAD_MIN = 0.25; // shapeLevels: how far below the loudest a level drops back fully
  // The light leak: one warm diagonal sweep in each period of song time.
  var LEAK_PERIOD = 14;
  // The camera drift: the backdrop slides no more than this (px) in any minute.
  var DRIFT_LIMIT = 40;
  var DRIFT_X = 16,
    DRIFT_X_PERIOD = 180,
    DRIFT_Y = 10,
    DRIFT_Y_PERIOD = 240;

  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function intensityOf(x) {
    return Math.max(0.2, Math.min(2, finite(x, 1)));
  }
  /** x wrapped into [0, period). */
  function wrap(x, period) {
    var r = x % period;
    return r < 0 ? r + period : r;
  }

  /** The orbit time setting (s per turn), clamped to 6..30; 12 when missing. */
  function orbitSeconds(x) {
    var n = Number(x);
    if (!isFinite(n)) return ORBIT_DEFAULT;
    return Math.max(ORBIT_MIN, Math.min(ORBIT_MAX, n));
  }

  /** How far the ring has turned (radians, 0..2π) at this song time: one turn per orbitSeconds. */
  function orbitPhase(songTime, seconds) {
    var s = finite(songTime, 0);
    var T = orbitSeconds(seconds);
    return (TAU * wrap(s, T)) / T;
  }

  /**
   * The title laid out round the ring, from each character's advance (in em) and the
   * separator's (" • ", in em): { size, copies, items: [{ k, a }] }. k is the character's
   * index in the title (-1 for the separator), a its centre angle (radians, increasing in
   * reading order; the first copy's text is centred on 0, the front). The font size is
   * TITLE_SIZE unless one copy and its separator would not fit round the ring, then just small
   * enough to fit. As many whole copies as fit are spaced evenly round the turn, so a short
   * title becomes a ring of "T-REX • T-REX • ..." and a long one goes round once with a gap.
   */
  function titleLayout(widths, sepWidth) {
    var n = widths ? widths.length : 0;
    var w = [];
    var W = 0;
    for (var i = 0; i < n; i++) {
      w.push(Math.max(0, finite(widths[i], 0)));
      W += w[i];
    }
    var S = Math.max(0, finite(sepWidth, 1.1));
    if (n === 0 || W <= 0) return { size: TITLE_SIZE, copies: 0, items: [] };
    var C = TAU * RING_RX; // the ring's length (px)
    var unit = W + S; // one copy and its separator, in em
    var size = Math.min(TITLE_SIZE, C / unit);
    var copies = Math.max(1, Math.floor(C / (unit * size) + 1e-9));
    var pitch = C / copies; // px from one copy to the next
    var gap = pitch - W * size; // px for the separator, with the room to spare
    var items = [];
    for (var c = 0; c < copies; c++) {
      var at = c * pitch - (W * size) / 2; // the copy's left edge, with the first centred on 0
      for (var k = 0; k < n; k++) {
        items.push({ k: k, a: (at + w[k] * size * 0.5) / RING_RX });
        at += w[k] * size;
      }
      items.push({ k: -1, a: (at + gap / 2) / RING_RX });
    }
    return { size: size, copies: copies, items: items };
  }

  /**
   * Where a letter at ring angle theta (0 = the front, increasing to the right across it) is
   * drawn: its centre (x, y), depth (cos theta: 1 front, -1 back), size and brightness by depth,
   * and its horizontal (ux, uy) and vertical (vx, vy) axes on screen. The letters face outward
   * like a real ring of letters seen from a little above: a letter narrows as it turns edge-on
   * at the sides (never quite to nothing) and round the back it is seen from behind (mirrored,
   * so the back half reads as the front's reflection, not as the letters in reverse order).
   */
  function letterPose(theta) {
    var th = finite(theta, 0);
    var s = Math.sin(th),
      c = Math.cos(th);
    var X = RING_RX * s,
      Y = RING_RY * c;
    var hx = (c < 0 ? -1 : 1) * Math.max(MIN_FACE, Math.abs(c)),
      hy = -SIN_VIEW * s; // the ring's tangent, slanting as the ring curves away
    var ct = Math.cos(RING_TILT),
      st = Math.sin(RING_TILT);
    return {
      x: PLANET_X + X * ct - Y * st,
      y: PLANET_Y + X * st + Y * ct,
      depth: c,
      scale: 1 + DEPTH_SCALE * c,
      bright: BACK_BRIGHT + ((1 - BACK_BRIGHT) * (1 + c)) / 2,
      ux: hx * ct - hy * st,
      uy: hx * st + hy * ct,
      vx: -COS_VIEW * st,
      vy: COS_VIEW * ct,
    };
  }

  /**
   * Every letter of a titleLayout at this song time, sorted from the back to the front (so a
   * nearer letter is drawn over a farther one). The ring turns so the letters move right to
   * left across the front, like a ticker.
   */
  function placeLetters(layout, songTime, seconds) {
    var phase = orbitPhase(songTime, seconds);
    var items = (layout && layout.items) || [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var p = letterPose(items[i].a - phase);
      p.k = items[i].k;
      out.push(p);
    }
    out.sort(function (a, b) {
      return a.depth - b.depth;
    });
    return out;
  }

  /** How far the planet has turned (radians, 0..2π): once a minute of song time. */
  function planetSpin(songTime) {
    return (TAU * wrap(finite(songTime, 0), SPIN_SECONDS)) / SPIN_SECONDS;
  }

  /** The planet's size on the beat: 1 + 0.03 × env (1 when switched off). */
  function planetScale(env, on) {
    return on ? 1 + BEAT_SCALE * clamp01(env) : 1;
  }

  /** The Bands setting (10..100 %) as a number of rays: a fifth of the full 180 up to all. */
  function rayCount(bandPct) {
    var pct = Math.max(10, Math.min(100, finite(bandPct, 100)));
    return Math.round(RAY_FULL * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  /** Seeded length variety for the rays (0.25..1), the same every time. */
  function rayWeights(count, mulberry32) {
    var n = Math.max(0, Math.floor(finite(count, RAY_FULL)));
    var rand = mulberry32(5150);
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var r = rand();
      out[i] = 0.25 + 0.75 * r * r;
    }
    return out;
  }

  /**
   * Levels shaped against the loudest of them: the loudest keep their level, ones well below
   * drop back to VALLEY of theirs, so a loud, nearly full spectrum still shows long and short.
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

  /**
   * Each ray's length (px): its spectrum value shaped against the loudest, squared, weighted,
   * and capped at RAY_MAX × intensity. Silence gives 0 (no rays).
   */
  function rayLengths(values, weights, intensity) {
    var shaped = shapeLevels(values);
    var cap = RAY_MAX * intensityOf(intensity);
    var out = new Float32Array(shaped.length);
    for (var i = 0; i < shaped.length; i++) {
      var w = clamp01(weights ? weights[i] : 1);
      out[i] = Math.min(cap, cap * shaped[i] * shaped[i] * w);
    }
    return out;
  }

  /** How brightly the rays shine for the song's loudness (0..1): faint, brighter when loud. */
  function rayLevel(loud) {
    return 0.24 + 0.62 * clamp01(loud);
  }

  /** How brightly the planet's light, rim and haze shine for the loudness: there in silence. */
  function glowLevel(loud) {
    return 0.72 + 0.48 * clamp01(loud);
  }

  /**
   * The warm light-leak streak at this song time: { strength (0 when none), x, y (a point on
   * its centre line), angle (of the line, radians), width (px) }. Each LEAK_PERIOD of song time
   * is seeded by its index in the song, so a section shows exactly the full render's streak; in
   * each one a diagonal streak fades in a few seconds after the period starts, sweeps right
   * across the right side of the frame for 3.4–5 s and fades out.
   */
  function lightLeak(songTime, mulberry32) {
    var none = { strength: 0, x: 0, y: 0, angle: 0, width: 0 };
    if (!(songTime >= 0) || !isFinite(songTime)) return none;
    var slot = Math.floor(songTime / LEAK_PERIOD);
    var rand = mulberry32(7717 + slot * 131);
    var start = 4.5 + 4 * rand();
    var dur = 3.4 + 1.6 * rand();
    var peak = 0.6 + 0.4 * rand();
    var angle = -(0.62 + 0.36 * rand());
    var y = 260 + 340 * rand();
    var x0 = 980 + 260 * rand();
    var travel = 650 + 350 * rand();
    var width = 70 + 60 * rand();
    var p = (songTime - slot * LEAK_PERIOD - start) / dur;
    if (!(p > 0 && p < 1)) return none;
    var e = Math.sin(Math.PI * p);
    return { strength: peak * e * e, x: x0 + travel * p, y: y, angle: angle, width: width };
  }

  /** The slow camera drift at this song time: [dx, dy] px, under 40 px in any minute. */
  function drift(songTime) {
    var s = finite(songTime, 0);
    return [
      DRIFT_X * Math.sin((TAU * s) / DRIFT_X_PERIOD),
      DRIFT_Y * Math.sin((TAU * s) / DRIFT_Y_PERIOD + 1.3),
    ];
  }

  var api = {
    PLANET_X: PLANET_X,
    PLANET_Y: PLANET_Y,
    PLANET_R: PLANET_R,
    RING_RX: RING_RX,
    RING_RY: RING_RY,
    RING_TILT: RING_TILT,
    RAY_FULL: RAY_FULL,
    RAY_MAX: RAY_MAX,
    SPIN_SECONDS: SPIN_SECONDS,
    ORBIT_DEFAULT: ORBIT_DEFAULT,
    ORBIT_MIN: ORBIT_MIN,
    ORBIT_MAX: ORBIT_MAX,
    PULSE_RELEASE: PULSE_RELEASE,
    BEAT_SCALE: BEAT_SCALE,
    LEAK_PERIOD: LEAK_PERIOD,
    DRIFT_LIMIT: DRIFT_LIMIT,
    TITLE_SIZE: TITLE_SIZE,
    VALLEY: VALLEY,
    orbitSeconds: orbitSeconds,
    orbitPhase: orbitPhase,
    titleLayout: titleLayout,
    letterPose: letterPose,
    placeLetters: placeLetters,
    planetSpin: planetSpin,
    planetScale: planetScale,
    rayCount: rayCount,
    rayWeights: rayWeights,
    shapeLevels: shapeLevels,
    rayLengths: rayLengths,
    rayLevel: rayLevel,
    glowLevel: glowLevel,
    lightLeak: lightLeak,
    drift: drift,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.OrbitMotion = api;
})();
