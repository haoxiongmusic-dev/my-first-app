/*
 * Moon Tide's motion: the ring of bars standing on the water (where each bar is, how tall it
 * stands and how the ring turns), the ripples that spread from it on strong beats, and the
 * dashes of moonlight shimmering on the water. Everything is worked out from the song time
 * alone (or seeded), so any frame can be drawn on its own, a section matches the full render
 * and every render is identical. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var HORIZON_Y = 430; // where the sky meets the water
  // The ring: a circle of radius 480 lying flat on the water, seen in perspective as an
  // ellipse 960 × 180 centred at (960, 640).
  var RING_CX = 960;
  var RING_CY = 640;
  var RING_R = 480;
  var RING_B = 90;
  var BAR_COUNT = 120;
  var BAR_MAX = 140; // px: the tallest bar at the front, at intensity 1
  var BAR_REST = 3; // px: a stub at the front in silence, so the ring is always there
  var FAR_SCALE = 0.62; // a bar at the back of the ring is drawn this much smaller
  var SPIN_RATE = 6; // degrees per second at Spin 100 %
  var SMOOTH = 2; // bands each side blurred into each, so peaks bunch into mountains
  var VALLEY = 0.35; // shapeSpectrum: a band well below the loudest keeps this share
  var SPREAD_MIN = 0.25; // shapeSpectrum: how far below the loudest a band drops back fully
  var RIPPLE_LIFE = 3; // seconds a beat's ripple spreads before it is gone
  var RIPPLE_STRONG = 0.6; // a beat at least this strong starts a ripple
  var RIPPLE_GROW = 520; // px the ripple's radius grows over its life
  var RIPPLE_HITS = 16; // recent beats to look through for ripples still alive
  var DRIFT_PERIOD = 9; // seconds for each faint drifting ripple to cross
  var DRIFT_COUNT = 3;
  var MOON_X = 960;
  var MOON_Y = 150;
  var MOON_R = 30;
  var DASH_COUNT = 30; // dashes of moonlight on the water
  var DASH_STRIDE = 5; // x, y, half-width, thickness, brightness
  var PATH_BOTTOM = 800; // the moonlight path fades out by here
  // The progress line under the titles.
  var LINE_X0 = 750;
  var LINE_X1 = 1170;
  var LINE_Y = 974;

  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function positive(x) {
    return x > 0 ? x : 0; // NaN gives 0
  }
  function finite(x) {
    return typeof x === "number" && isFinite(x) ? x : 0;
  }
  function smoothstep(a, b, x) {
    var f = clamp01((x - a) / (b - a));
    return f * f * (3 - 2 * f);
  }

  /** How far the ring has turned (radians) at this song time, for the Spin setting (%). */
  function spinAngle(songTime, spinPct) {
    return (finite(songTime) * SPIN_RATE * finite(spinPct) * Math.PI) / (100 * 180);
  }

  /**
   * A point on the ring at this angle (0: the back, π: the front, π/2: the right):
   * [x, y, depth (0 back .. 1 front), scale (FAR_SCALE at the back .. 1 at the front)].
   */
  function ringPoint(angle) {
    var a = finite(angle);
    var c = Math.cos(a);
    var depth = (1 - c) / 2;
    return [
      RING_CX + RING_R * Math.sin(a),
      RING_CY - RING_B * c,
      depth,
      FAR_SCALE + (1 - FAR_SCALE) * depth,
    ];
  }

  /**
   * The Bands setting (10..100 %) as the number of separate spectrum columns round the ring,
   * from a fifth of the bars (broad smooth mountains) to one per bar (every bar its own).
   */
  function columnCount(bandPct) {
    var pct = Math.max(10, Math.min(100, finite(bandPct) || 100));
    return Math.round(BAR_COUNT * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  /**
   * Loud music fills every band (0.8–1, and the boost pushes them higher still), which would
   * stand every bar at full height. So each band drops back by how far it sits below this
   * frame's loudest band: the loudest keeps its value, a band SPREAD_MIN or more below it keeps
   * only VALLEY of its value, so the peaks stand out as mountains. Differences smaller than
   * SPREAD_MIN drop back only partly, so small wobbles don't flicker.
   */
  function shapeSpectrum(spectrum) {
    var n = spectrum.length;
    var hi = 0;
    for (var i = 0; i < n; i++) hi = Math.max(hi, clamp01(spectrum[i]));
    var out = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var x = clamp01(spectrum[k]);
      out[k] = x * (VALLEY + (1 - VALLEY) * clamp01(1 - (hi - x) / SPREAD_MIN));
    }
    return out;
  }

  /**
   * Spread `columns` values (evenly round the ring, as ringAngles(count, 360) places them) over
   * `count` bars, each bar reading between its two nearest columns, all the way round.
   */
  function columnsToBars(columns, count) {
    var n = columns.length;
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var c = ((i + 0.5) / count) * n - 0.5;
      var f = c - Math.floor(c);
      var i0 = (Math.floor(c) + n) % n,
        i1 = (i0 + 1) % n;
      out[i] = columns[i0] + (columns[i1] - columns[i0]) * f;
    }
    return out;
  }

  /**
   * A fixed weight for each bar (it turns with its bar): seeded, so neighbours differ and a
   * loud song still shows a skyline of different heights rather than a solid wall.
   */
  function barWeights(count, mulberry32) {
    var rand = mulberry32(6060);
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) out[i] = 0.7 + 0.3 * rand();
    return out;
  }

  /**
   * The bars for this frame, back to front (so drawing them in order lets the front of the
   * ring cover the back): each bar's angle, its foot on the ellipse, depth, scale and height.
   * The pattern's bass (the middle of `values`, as ringValues gives it) faces the viewer
   * before the ring has turned. Heights are squared (quiet bands drop back), weighted, scaled
   * by depth and capped at BAR_MAX × intensity × scale; never shorter than a stub.
   */
  function ringBars(values, weights, spin, intensity) {
    var n = values.length;
    var turn = finite(spin);
    var k = positive(intensity);
    var bars = [];
    for (var i = 0; i < n; i++) {
      var angle = -Math.PI + (2 * Math.PI * (i + 0.5)) / n + Math.PI + turn;
      var p = ringPoint(angle);
      var v = clamp01(values[i]);
      var w = weights ? positive(weights[i]) : 1;
      var cap = BAR_MAX * k * p[3];
      var h = Math.min(cap, v * v * w * BAR_MAX * k * p[3]);
      bars.push({
        angle: angle,
        x: p[0],
        y: p[1],
        depth: p[2],
        scale: p[3],
        height: Math.max(BAR_REST * p[3], h),
      });
    }
    bars.sort(function (a, b) {
      return a.depth - b.depth;
    });
    return bars;
  }

  /**
   * The ripples alive at this song time: one for each strong beat in the last RIPPLE_LIFE
   * seconds (`hits` is audio.recentHits: [age, strength], newest first). Each spreads out
   * from the ring, quickly at first, and fades away. A ripple's small variety is seeded by
   * its beat's song frame, so a section shows exactly the ripples of the full render.
   * Returns { rx, ry, alpha }: the ellipse's half-width and half-height, and its brightness.
   */
  function ripples(hits, songTime, mulberry32) {
    var out = [];
    var now = finite(songTime);
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0],
        strength = hits[i][1];
      if (!(strength >= RIPPLE_STRONG) || !(age >= 0) || !(age < RIPPLE_LIFE)) continue;
      var frame = Math.round((now - age) * 30);
      var rand = mulberry32(9100 + frame * 97);
      var reach = 0.85 + 0.3 * rand();
      var shine = 0.8 + 0.2 * rand();
      var p = age / RIPPLE_LIFE;
      var r = RING_R + RIPPLE_GROW * reach * (1 - (1 - p) * (1 - p));
      var level = (0.55 + 0.45 * clamp01((strength - RIPPLE_STRONG) / (1 - RIPPLE_STRONG))) * shine;
      out.push({
        rx: r,
        ry: (r * RING_B) / RING_R,
        alpha: level * (1 - p) * (1 - p) * Math.min(1, age / 0.12),
      });
    }
    return out;
  }

  /** A few very faint ripples always drifting out from the ring, from the time alone. */
  function driftRipples(songTime) {
    var s = finite(songTime);
    var out = [];
    for (var k = 0; k < DRIFT_COUNT; k++) {
      var x = s / DRIFT_PERIOD + k / DRIFT_COUNT;
      var p = x - Math.floor(x);
      var r = RING_R + RIPPLE_GROW * 1.3 * p;
      out.push({ rx: r, ry: (r * RING_B) / RING_R, alpha: 0.16 * Math.sin(Math.PI * p) });
    }
    return out;
  }

  /**
   * The dashes of the moonlight path, fixed once (seeded): each one's place down the water
   * (closer together toward the horizon, like the far water), size and how it shimmers.
   */
  function buildDashes(mulberry32) {
    var rand = mulberry32(3131);
    var P = 9;
    var params = new Float32Array(DASH_COUNT * P);
    for (var i = 0; i < DASH_COUNT; i++) {
      var f = i / (DASH_COUNT - 1);
      var y = HORIZON_Y + 6 + (PATH_BOTTOM - HORIZON_Y - 6) * Math.pow(f, 1.5);
      var u = (y - HORIZON_Y) / (PATH_BOTTOM - HORIZON_Y);
      var o = i * P;
      params[o] = y;
      params[o + 1] = (6 + 64 * u) * (0.6 + 0.4 * rand()); // half-width
      params[o + 2] = 1.2 + 2.4 * u; // thickness
      params[o + 3] = 0.15 + 0.3 * rand(); // shimmer frequencies, Hz
      params[o + 4] = 0.15 + 0.3 * rand();
      params[o + 5] = 2 * Math.PI * rand(); // and phases
      params[o + 6] = 2 * Math.PI * rand();
      params[o + 7] = 2 * Math.PI * rand(); // sideways sway phase
      params[o + 8] = u;
    }
    return { count: DASH_COUNT, params: params };
  }

  /**
   * The moonlight dashes at this song time, top to bottom: x, y, half-width, thickness and
   * brightness (0..1) for each. They brighten, dim, widen and sway slowly; the path fades out
   * toward the viewer.
   */
  function moonDashes(dashes, songTime) {
    var s = finite(songTime);
    var P = 9;
    var out = new Float32Array(dashes.count * DASH_STRIDE);
    for (var i = 0; i < dashes.count; i++) {
      var o = i * P;
      var u = dashes.params[o + 8];
      var a = Math.sin(2 * Math.PI * dashes.params[o + 3] * s + dashes.params[o + 5]);
      var b = Math.sin(2 * Math.PI * dashes.params[o + 4] * s + dashes.params[o + 6]);
      var level = clamp01(0.5 + 0.32 * a + 0.18 * b) * (1 - 0.85 * smoothstep(0.55, 1, u));
      var q = i * DASH_STRIDE;
      out[q] = MOON_X + 6 * u * Math.sin(2 * Math.PI * 0.11 * s + dashes.params[o + 7]);
      out[q + 1] = dashes.params[o];
      out[q + 2] = dashes.params[o + 1] * (0.75 + 0.25 * b);
      out[q + 3] = dashes.params[o + 2];
      out[q + 4] = level;
    }
    return out;
  }

  /**
   * How much the music lights the scene: the glow on the water round the ring, the haze on
   * the horizon and the moonlight path. Always a little, much brighter when loud.
   */
  function glowLevel(loud) {
    return 0.2 + 0.8 * clamp01(loud);
  }

  /** Where the progress line's dot is for this fraction of the song. */
  function progressX(fraction) {
    return LINE_X0 + (LINE_X1 - LINE_X0) * clamp01(fraction);
  }

  var api = {
    HORIZON_Y: HORIZON_Y,
    RING_CX: RING_CX,
    RING_CY: RING_CY,
    RING_R: RING_R,
    RING_B: RING_B,
    BAR_COUNT: BAR_COUNT,
    BAR_MAX: BAR_MAX,
    BAR_REST: BAR_REST,
    FAR_SCALE: FAR_SCALE,
    SPIN_RATE: SPIN_RATE,
    SMOOTH: SMOOTH,
    VALLEY: VALLEY,
    RIPPLE_LIFE: RIPPLE_LIFE,
    RIPPLE_STRONG: RIPPLE_STRONG,
    RIPPLE_GROW: RIPPLE_GROW,
    RIPPLE_HITS: RIPPLE_HITS,
    MOON_X: MOON_X,
    MOON_Y: MOON_Y,
    MOON_R: MOON_R,
    PATH_BOTTOM: PATH_BOTTOM,
    DASH_STRIDE: DASH_STRIDE,
    LINE_X0: LINE_X0,
    LINE_X1: LINE_X1,
    LINE_Y: LINE_Y,
    spinAngle: spinAngle,
    ringPoint: ringPoint,
    columnCount: columnCount,
    shapeSpectrum: shapeSpectrum,
    columnsToBars: columnsToBars,
    barWeights: barWeights,
    ringBars: ringBars,
    ripples: ripples,
    driftRipples: driftRipples,
    buildDashes: buildDashes,
    moonDashes: moonDashes,
    glowLevel: glowLevel,
    progressX: progressX,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.TideMotion = api;
})();
