/*
 * Black Crown's motion: where the camera looks from, how high the ferrofluid crown stands (the
 * bass, held for a moment and released over 0.15 s), where each spike stands and how it wobbles,
 * the ripples that spread over the liquid, and the sky's flare. Everything is worked out from the
 * song time alone (or seeded), so any frame can be drawn on its own, a section matches the full
 * render and every render is identical. Pure: no DOM, so Vitest tests it directly.
 *
 * The 3D world: the liquid is the plane y = 0; the camera looks level along -z from CAM_H above
 * it, with its picture shifted so the horizon sits at HORIZON_Y (65 % down the frame). The crown
 * stands CROWN_DIST in front of it, its foot at CROWN_BASE_Y on screen. One world unit there is
 * PX_PER_UNIT pixels. Screen sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var WIDTH = 1920;
  var HEIGHT = 1080;
  var HORIZON_Y = 702; // the sky fills the upper 65 %
  var CROWN_BASE_Y = 872; // the crown's foot on the liquid
  var CAM_H = 1;
  var FOV = 55; // degrees, over the shifted frustum (twice HORIZON_Y tall)
  var FOCAL = HORIZON_Y / Math.tan((FOV / 2) * (Math.PI / 180));
  var CROWN_DIST = (FOCAL * CAM_H) / (CROWN_BASE_Y - HORIZON_Y);
  var PX_PER_UNIT = FOCAL / CROWN_DIST;

  var CROWN_MAX_PX = 300; // the crown's height at full bass, intensity 1
  var CROWN_RELEASE = 0.15; // seconds: how fast the crown sinks after the bass
  var LOOKBACK = 0.75; // seconds of the past looked through for the release (5 × the release)
  var STEP = 1 / 60;
  var BASS_COLUMNS = 8; // spectrum columns read for the bass (spectrumLow..spectrumHigh)
  var BASS_LOW = 0.3; // a (boosted) bass level at or below this leaves the liquid flat
  var BASS_HIGH = 0.97; // and at or above this raises the crown fully

  var MIN_SPIKES = 12;
  var MAX_SPIKES = 40;
  var DEFAULT_SPIKES = 24;
  var SPREAD = 1.15; // world units: the crown's radius on the liquid
  var EDGE_DROP = 0.62; // the outermost spikes stand this much lower than the middle one
  var TILT = 0.55; // how far the outermost spikes lean out (sideways units per unit of height)
  var WOBBLE = 0.18; // each spike's height dips by up to this share, on its own rhythm
  var DOME_SHARE = 0.16; // the smooth mound under the spikes, as a share of the crown height
  // The mound is a bell (Gaussian) shape, height × exp(-(DOME_FOOT × distance / radius)²): at
  // its radius it is down to 3 % (the shader draws it the same way).
  var DOME_FOOT = Math.sqrt(-Math.log(0.03));
  var P = 8; // numbers per spike in a crown's layout
  var SPIKE_STRIDE = 7; // numbers per spike from spikesAt

  var RIPPLE_STRONG = 0.6; // a beat at least this strong sends out a ripple
  var RIPPLE_LIFE = 4; // seconds a beat's ripple spreads before it is gone
  var RIPPLE_HITS = 16; // recent beats looked through for ripples still alive
  var RIPPLE_REACH = 9; // world units a beat's ripple travels over its life
  var RIPPLE_AMP = 0.06;
  var CALM_EVERY = 2; // seconds between the slow constant rings
  var CALM_LIFE = 6;
  var CALM_SPEED = 1.5; // world units per second
  var CALM_AMP = 0.02;
  var MAX_RINGS = 20; // rings the water shader holds
  var SKY_FLARE = 0.2; // the sky is this much brighter at full loudness
  var HUD_BARS = 80; // the top spectrum's bars at Bands 100 %

  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function positive(x) {
    return x > 0 ? x : 0; // NaN gives 0
  }
  function finite(x) {
    return typeof x === "number" && isFinite(x) ? x : 0;
  }

  /** A world point (x, y, z) on screen: [x, y] in 1080p pixels, y down. */
  function project(x, y, z) {
    var depth = -z;
    return [WIDTH / 2 + (FOCAL * x) / depth, HORIZON_Y - (FOCAL * (y - CAM_H)) / depth];
  }

  /**
   * The bass as 0..1 from the spectrum columns (spectrumLow..spectrumHigh, boosted). Loud music
   * fills the bass bands (0.75..1 once boosted), so only the top of the range raises the crown:
   * the mean is stretched from BASS_LOW..BASS_HIGH, eased and pushed down a little (power 1.5),
   * so the crown swings clearly within a loud passage and lies flat in a quiet one.
   */
  function bassLevel(spectrum) {
    var n = spectrum.length;
    if (!n) return 0;
    var sum = 0;
    for (var i = 0; i < n; i++) sum += clamp01(spectrum[i]);
    var x = clamp01((sum / n - BASS_LOW) / (BASS_HIGH - BASS_LOW));
    var e = x * x * (3 - 2 * x);
    return Math.min(1, Math.pow(e, 1.5));
  }

  /**
   * How high the crown stands at time t (0..1): the bass now, or a recent louder bass fading
   * with a CROWN_RELEASE time constant, whichever is higher. Looks back LOOKBACK seconds in
   * fixed steps (like the toolkit's beatEnvelope), so it depends only on the audio near t and a
   * section (which keeps a few seconds of analysis before its start) matches the full render.
   */
  function crownLevel(audio, t, scratch) {
    var first = -(audio.offset || 0);
    var now = finite(t);
    var level = 0;
    var steps = Math.round(LOOKBACK / STEP);
    for (var k = 0; k <= steps; k++) {
      var age = k * STEP;
      var at = now - age;
      if (at < first) break;
      var fade = Math.exp(-age / CROWN_RELEASE);
      if (fade <= level) break; // nothing older can be higher
      level = Math.max(level, bassLevel(audio.spectrum(at, scratch)) * fade);
    }
    return clamp01(level);
  }

  /** The crown's height in px for this level: flat at 0, CROWN_MAX_PX × intensity at full. */
  function crownHeightPx(level, intensity) {
    return CROWN_MAX_PX * clamp01(level) * positive(intensity);
  }

  /**
   * The spikes' profile power: a spike's radius at height fraction s is (1 - s)^sharpness.
   * Low and blunt when the crown is small, slender and needle-sharp when it is tall.
   */
  function sharpness(level) {
    return 1.25 + 1.6 * clamp01(level);
  }

  /** The Spikes setting as a whole number of spikes, 12..40. */
  function spikeCount(setting) {
    var n = Number(setting);
    if (!isFinite(n)) return DEFAULT_SPIKES;
    return Math.max(MIN_SPIKES, Math.min(MAX_SPIKES, Math.round(n)));
  }

  /**
   * The crown's layout, fixed once (seeded by the spike count): one spike in the middle, the
   * rest spread over a disc like seeds in a sunflower. For each spike: x, z (from the middle,
   * world units), its height share (tallest in the middle, lower outwards, a little varied), its
   * radius share, its wobble's speed (Hz) and phase, and its lean outwards (tilt x, z).
   */
  function buildCrown(count, mulberry32) {
    var n = spikeCount(count);
    var rand = mulberry32(4040 + n * 131);
    var params = new Float32Array(n * P);
    var golden = Math.PI * (3 - Math.sqrt(5));
    var turn = 2 * Math.PI * rand();
    for (var i = 0; i < n; i++) {
      var f = i === 0 ? 0 : Math.sqrt(i / (n - 1));
      var rho = SPREAD * f * (i === 0 ? 0 : 0.9 + 0.1 * rand());
      var angle = turn + i * golden + (rand() - 0.5) * 0.3;
      var x = rho * Math.cos(angle),
        z = rho * Math.sin(angle);
      var share = rho / SPREAD;
      var o = i * P;
      params[o] = x;
      params[o + 1] = z;
      params[o + 2] = (1 - EDGE_DROP * Math.pow(share, 1.2)) * (i === 0 ? 1 : 0.85 + 0.15 * rand());
      params[o + 3] = 0.8 + 0.35 * rand();
      params[o + 4] = 0.5 + 0.8 * rand();
      params[o + 5] = 2 * Math.PI * rand();
      params[o + 6] = rho > 0 ? (TILT * share * x) / rho : 0;
      params[o + 7] = rho > 0 ? (TILT * share * z) / rho : 0;
    }
    return { count: n, params: params };
  }

  /** The smooth mound the spikes rise from: its radius and height (world units). */
  function domeAt(level, intensity) {
    var l = clamp01(level);
    return {
      radius: SPREAD * (0.78 + 0.22 * l),
      height: (DOME_SHARE * crownHeightPx(l, intensity)) / PX_PER_UNIT,
    };
  }

  /**
   * Every spike at this song time, in world units from the crown's middle: x, base y (on the
   * mound), z, height, base radius, and its lean (tilt x, z: sideways per unit of height). A
   * spike's tip stands at its share of the crown height, dipping by up to WOBBLE on its own
   * rhythm, so no tip is ever higher than the crown height. Silence gives zero heights.
   */
  function spikesAt(crown, level, songTime, intensity) {
    var l = clamp01(level);
    var s = finite(songTime);
    var top = crownHeightPx(l, intensity) / PX_PER_UNIT;
    var dome = domeAt(l, intensity);
    var spacing = SPREAD * Math.sqrt(Math.PI / crown.count);
    // taller crowns (higher intensity) get a little wider spikes, so they don't turn to needles
    var girth = 0.75 + 0.25 * Math.min(2, Math.max(0.2, finite(intensity) || 1));
    var out = new Float32Array(crown.count * SPIKE_STRIDE);
    for (var i = 0; i < crown.count; i++) {
      var o = i * P;
      var x = crown.params[o],
        z = crown.params[o + 1];
      var u = (DOME_FOOT * Math.sqrt(x * x + z * z)) / dome.radius;
      var base = dome.height * Math.exp(-u * u) * 0.85; // a little sunk into the mound
      var dip = 0.5 + 0.5 * Math.sin(2 * Math.PI * crown.params[o + 4] * s + crown.params[o + 5]);
      var tip = top * crown.params[o + 2] * (1 - WOBBLE * dip);
      var q = i * SPIKE_STRIDE;
      out[q] = x;
      out[q + 1] = Math.min(base, tip);
      out[q + 2] = z;
      out[q + 3] = Math.max(0, tip - base);
      out[q + 4] = spacing * 0.62 * crown.params[o + 3] * (0.55 + 0.45 * l) * girth;
      out[q + 5] = crown.params[o + 6];
      out[q + 6] = crown.params[o + 7];
    }
    return out;
  }

  /**
   * The ripples a beat sends out, alive at this song time: one for each strong beat in the last
   * RIPPLE_LIFE seconds (`hits` is audio.recentHits: [age, strength], newest first). Each spreads
   * out from the crown, quickly at first, widening and fading away. Its small variety is seeded
   * by its beat's song frame, so a section shows exactly the ripples of the full render.
   * Returns { radius, amp, width } in world units.
   */
  function ripples(hits, songTime, mulberry32) {
    var out = [];
    var now = finite(songTime);
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0],
        strength = hits[i][1];
      if (!(strength >= RIPPLE_STRONG) || !(age >= 0) || !(age < RIPPLE_LIFE)) continue;
      var frame = Math.round((now - age) * 30);
      var rand = mulberry32(7300 + frame * 97);
      var reach = RIPPLE_REACH * (0.85 + 0.3 * rand());
      var shine = 0.8 + 0.2 * rand();
      var p = age / RIPPLE_LIFE;
      var level = 0.55 + 0.45 * clamp01((strength - RIPPLE_STRONG) / (1 - RIPPLE_STRONG));
      out.push({
        radius: SPREAD * 0.9 + reach * (1 - (1 - p) * (1 - p)),
        amp: RIPPLE_AMP * level * shine * (1 - p) * (1 - p) * Math.min(1, age / 0.12),
        width: 0.18 + 0.5 * p,
      });
    }
    return out;
  }

  /** The slow constant rings: one born every CALM_EVERY seconds of the song, from the time alone. */
  function calmRipples(songTime) {
    var s = finite(songTime);
    var k = Math.floor(s / CALM_EVERY);
    var out = [];
    for (var j = 0; j < Math.ceil(CALM_LIFE / CALM_EVERY); j++) {
      var born = (k - j) * CALM_EVERY;
      if (born < 0) continue;
      var age = s - born;
      if (!(age < CALM_LIFE)) continue;
      out.push({
        radius: SPREAD * 0.9 + CALM_SPEED * age,
        amp: CALM_AMP * (1 - age / CALM_LIFE) * Math.min(1, age / 0.6),
        width: 0.3 + (0.25 * age) / CALM_LIFE,
      });
    }
    return out;
  }

  /** The sky's brightness: 1 when quiet, up to 1 + SKY_FLARE at full loudness. */
  function skyFlare(loud) {
    return 1 + SKY_FLARE * clamp01(loud);
  }

  /**
   * The top spectrum's bar heights (0..1) from its values: loud music fills every band, so each
   * bar drops back by how far it sits below this frame's loudest (to 35 % of its value when 0.25
   * or more below), then squared, so the peaks stand out. Silence (or NaN) gives zeros.
   */
  function barHeights(values) {
    var n = values.length;
    var hi = 0;
    for (var i = 0; i < n; i++) hi = Math.max(hi, clamp01(values[i]));
    var out = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var x = clamp01(values[k]);
      var v = x * (0.35 + 0.65 * clamp01(1 - (hi - x) / 0.25));
      out[k] = v * v;
    }
    return out;
  }

  /** The Bands setting (10..100 %) as the top spectrum's bar count: a fifth of 80 up to 80. */
  function hudBarCount(bandPct) {
    var pct = Number(bandPct);
    pct = isFinite(pct) ? Math.max(10, Math.min(100, pct)) : 100;
    return Math.round(HUD_BARS * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  var api = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    HORIZON_Y: HORIZON_Y,
    CROWN_BASE_Y: CROWN_BASE_Y,
    CAM_H: CAM_H,
    FOV: FOV,
    FOCAL: FOCAL,
    CROWN_DIST: CROWN_DIST,
    PX_PER_UNIT: PX_PER_UNIT,
    CROWN_MAX_PX: CROWN_MAX_PX,
    CROWN_RELEASE: CROWN_RELEASE,
    LOOKBACK: LOOKBACK,
    BASS_COLUMNS: BASS_COLUMNS,
    MIN_SPIKES: MIN_SPIKES,
    MAX_SPIKES: MAX_SPIKES,
    SPREAD: SPREAD,
    SPIKE_STRIDE: SPIKE_STRIDE,
    RIPPLE_STRONG: RIPPLE_STRONG,
    RIPPLE_LIFE: RIPPLE_LIFE,
    RIPPLE_HITS: RIPPLE_HITS,
    CALM_EVERY: CALM_EVERY,
    CALM_LIFE: CALM_LIFE,
    MAX_RINGS: MAX_RINGS,
    SKY_FLARE: SKY_FLARE,
    project: project,
    bassLevel: bassLevel,
    crownLevel: crownLevel,
    crownHeightPx: crownHeightPx,
    sharpness: sharpness,
    spikeCount: spikeCount,
    buildCrown: buildCrown,
    spikesAt: spikesAt,
    domeAt: domeAt,
    ripples: ripples,
    calmRipples: calmRipples,
    skyFlare: skyFlare,
    hudBarCount: hudBarCount,
    barHeights: barHeights,
    DOME_FOOT: DOME_FOOT,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.CrownMotion = api;
})();
