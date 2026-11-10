/*
 * Deep Swell's motion: how high the dot sea swells with the low end, how it rolls toward the
 * camera, how bright its crests are, the bokeh orbs' slow paths and the logo's pulse.
 * Everything is worked out from the song time alone (the low level looks back a fraction of a
 * second), so any frame can be drawn on its own and a section matches the full render. Random
 * numbers come only from the toolkit's seeded mulberry32, passed in. Pure: no DOM, so Vitest
 * tests it directly.
 *
 * The sea is in world units (the camera sits a few units above it); the orbs and the logo are
 * in 1080p pixels.
 */
(function () {
  "use strict";

  var TAU = Math.PI * 2;

  // ---- the swell ----
  var H_FULL = 2.0; // world units: the base wave height at Wave height 100 %
  // The low level: the spectrum range's mean energy, looked at now and a little in the past
  // (seconds), the newest counting most, so the swell rises and falls smoothly.
  var LOW_AGES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
  var LOW_RELEASE = 0.12;
  // Analyzer values sit around 0.5–0.9 in loud music: map this range onto 0..1 and bend it, so
  // a loud bass line and a quiet one still look different.
  var LOW_FLOOR = 0.15;
  var LOW_CEIL = 0.9;
  var LOW_CURVE = 1.5;

  // The sea is three travelling waves. Each: [weight, kx, kz, offset, × roll phase, × drift
  // phase]. The weights add up to 1, so the surface never leaves ±amp. The first (the long
  // swell) runs along the view direction, toward the camera; the others cross it.
  // The template builds its shader from this same table.
  var WAVES = [
    [0.54, 0.1, 0.28, 0.0, 1, 0],
    [0.26, 0.17, -0.2, 1.3, 0, 1],
    [0.13, 0.43, 0.61, -2.1, 2, -1],
    [0.07, 1.1, 0.42, 0.7, 3, 1], // a fine ripple along the rows
  ];
  // Radians per second at Flow speed 40 % (the default): the roll and a slower drift.
  var ROLL_RATE = 0.6;
  var DRIFT_RATE = 0.23;
  var FLOW_DEFAULT = 40;

  // ---- the spectrum ripple laid over the sea ----
  var RIPPLE_FULL = 64; // points across at Bands 100 %
  var RIPPLE_FLOOR = 0.3;
  var RIPPLE_SPAN = 0.65;

  // ---- the logo ----
  var LOGO_SIZE = 220; // px across
  var LOGO_PULSE = 0.04; // scale added by a full beat
  var PULSE_RELEASE = 0.25; // seconds for the pulse to fall to about a third

  // ---- the bokeh orbs: many, of mixed sizes, all over the frame ----
  var ORB_COUNT = 60;
  // Sizes by kind, in turn through every 20 orbs: 6 small and fairly sharp, 12 mid-sized, 2 large
  // and very soft. [smallest radius, largest radius, faintest, brightest] in px and alpha.
  var ORB_KINDS = [
    [15, 40, 0.3, 0.6],
    [40, 110, 0.12, 0.3],
    [110, 200, 0.07, 0.15],
  ];
  function orbKind(i) {
    var k = i % 20;
    return k < 6 ? 0 : k < 18 ? 1 : 2;
  }
  var ORB_SEED = 7331;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function finite(v, fallback) {
    return typeof v === "number" && isFinite(v) ? v : fallback;
  }
  function wrap(v, span) {
    return ((v % span) + span) % span;
  }

  /** The base wave height (world units) for the Wave height setting (0–100 %). */
  function baseHeight(pct) {
    return (H_FULL * clamp(finite(pct, 0), 0, 100)) / 100;
  }

  /** The mean of a spectrum's values (0 for none). */
  function rangeMean(spectrum) {
    var n = spectrum ? spectrum.length : 0;
    if (!n) return 0;
    var sum = 0;
    for (var i = 0; i < n; i++) sum += finite(spectrum[i], 0);
    return sum / n;
  }

  /**
   * 0..1: how much low end there is. `means` are rangeMean()s at the LOW_AGES (newest first);
   * they are averaged with the newest counting most, then mapped from the analyzer's range.
   */
  function lowLevel(means) {
    var n = Math.min(means ? means.length : 0, LOW_AGES.length);
    var sum = 0,
      weights = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.exp(-LOW_AGES[i] / LOW_RELEASE);
      sum += w * clamp(finite(means[i], 0), 0, 1);
      weights += w;
    }
    if (weights <= 0) return 0;
    var x = clamp((sum / weights - LOW_FLOOR) / (LOW_CEIL - LOW_FLOOR), 0, 1);
    return Math.pow(x, LOW_CURVE);
  }

  /** The spec's swell: base × (0.5 + 1.2 × low × intensity), low 0..1, intensity 0.2..2. */
  function swellHeight(base, low, intensity) {
    var b = Math.max(0, finite(base, 0));
    var l = clamp(finite(low, 0), 0, 1);
    var k = clamp(finite(intensity, 1), 0.2, 2);
    return b * (0.5 + 1.2 * l * k);
  }

  /**
   * The roll and drift phases (radians, 0..2π) at this song time for the Flow speed setting.
   * Kept small (wrapped) so the shader's sums stay precise however long the song; each wave
   * uses whole multiples of them, so the wrap never shows.
   */
  function flowPhases(songTime, flowPct) {
    var t = finite(songTime, 0);
    var f = clamp(finite(flowPct, 0), 0, 100) / FLOW_DEFAULT;
    return [wrap(t * ROLL_RATE * f, TAU), wrap(t * DRIFT_RATE * f, TAU)];
  }

  /** The sea's height (world units) at (x, z), as the shader works it out. */
  function heightAt(x, z, phases, amp) {
    var px = finite(x, 0),
      pz = finite(z, 0);
    var h = 0;
    for (var i = 0; i < WAVES.length; i++) {
      var w = WAVES[i];
      h += w[0] * Math.sin(w[1] * px + w[2] * pz + w[3] + w[4] * phases[0] + w[5] * phases[1]);
    }
    return h * finite(amp, 0);
  }

  /** A spectrum value as ripple height 0..1: quiet bands drop out, loud ones still vary. */
  function rippleShape(value) {
    var x = clamp((finite(value, 0) - RIPPLE_FLOOR) / RIPPLE_SPAN, 0, 1);
    return x * x;
  }

  /** The Bands setting (10–100 %) as ripple points across the sea. */
  function ripplePoints(pct) {
    var p = clamp(finite(pct, 100), 10, 100);
    return Math.round(RIPPLE_FULL * (0.2 + (0.8 * (p - 10)) / 90));
  }

  /** How bright the crests are: with loudness, scaled a little by intensity. */
  function crestGain(loud, intensity) {
    var l = clamp(finite(loud, 0), 0, 1);
    var k = clamp(finite(intensity, 1), 0.2, 2);
    return 0.55 + 0.75 * l * (0.5 + 0.5 * k);
  }

  /** The orbs' fixed character: place, size, drift and brightness, seeded once. */
  var orbCache = null;
  function orbSeeds(mulberry32) {
    if (orbCache && orbCache.fn === mulberry32) return orbCache.list;
    var rnd = mulberry32(ORB_SEED);
    var list = [];
    for (var i = 0; i < ORB_COUNT; i++) {
      var kind = ORB_KINDS[orbKind(i)];
      list.push({
        x0: rnd() * 1920,
        y0: 40 + rnd() * 1000,
        r: kind[0] + rnd() * (kind[1] - kind[0]),
        vx: (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 11), // px per second, left or right
        bob: 10 + rnd() * 20, // px up and down
        bobRate: TAU * (0.025 + rnd() * 0.045), // radians per second
        phase: rnd() * TAU,
        // small orbs are bright points, big ones faint haze, so none dominates
        alpha: kind[2] + rnd() * (kind[3] - kind[2]),
      });
    }
    orbCache = { fn: mulberry32, list: list };
    return list;
  }

  /**
   * The bokeh orbs at this song time: { x, y, r, alpha } in px. They drift slowly sideways
   * (wrapping round the frame) and bob; brightness alpha × (0.6 + 0.4 × loud).
   */
  function orbs(songTime, loud, mulberry32) {
    var t = finite(songTime, 0);
    var light = 0.6 + 0.4 * clamp(finite(loud, 0), 0, 1);
    var seeds = orbSeeds(mulberry32);
    var out = [];
    for (var i = 0; i < seeds.length; i++) {
      var s = seeds[i];
      var span = 1920 + 2 * s.r;
      out.push({
        x: wrap(s.x0 + s.vx * t, span) - s.r,
        y: s.y0 + s.bob * Math.sin(s.bobRate * t + s.phase),
        r: s.r,
        alpha: s.alpha * light,
      });
    }
    return out;
  }

  /** The logo's scale on the beat: 1 + 0.04 × the beat envelope (0..1). */
  function logoScale(env) {
    return 1 + LOGO_PULSE * clamp(finite(env, 0), 0, 1);
  }

  var api = {
    H_FULL: H_FULL,
    LOW_AGES: LOW_AGES,
    WAVES: WAVES,
    PULSE_RELEASE: PULSE_RELEASE,
    LOGO_SIZE: LOGO_SIZE,
    LOGO_PULSE: LOGO_PULSE,
    ORB_COUNT: ORB_COUNT,
    ripplePoints: ripplePoints,
    baseHeight: baseHeight,
    rangeMean: rangeMean,
    lowLevel: lowLevel,
    swellHeight: swellHeight,
    flowPhases: flowPhases,
    heightAt: heightAt,
    rippleShape: rippleShape,
    crestGain: crestGain,
    orbs: orbs,
    logoScale: logoScale,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.SwellMotion = api;
})();
