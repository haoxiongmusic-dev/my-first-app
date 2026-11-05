/*
 * Iron Wraith's motion: how the jaw, head, eyes, towers and waveforms follow the music.
 * Everything is worked out from the song time alone (looking back a little where a movement
 * needs a past), so any frame can be drawn on its own and every render is identical.
 * `audio` is a toolkit createAudio(...) result. Pure: no DOM, so Vitest tests it directly.
 */
(function () {
  "use strict";

  var JAW_RELEASE = 0.18; // seconds for the jaw to fall to about a third after a beat
  var JAW_LOOKBACK = 12; // samples at 1/60 s (0.2 s)
  var FLARE_TIME = 0.4; // seconds an eye flare lasts after a hit
  var PEAK_HOLD = 0.6; // seconds a tower peak block is remembered
  var PEAK_FALL = 20; // blocks per second a peak block falls
  var EYE_BASE = 0.35;

  /** The earliest time this audio knows about (a section keeps some of the song before it). */
  function earliest(audio) {
    return -(audio.offset || 0);
  }

  /** How open the jaw is, 0..1: the strongest recent beat, fading over JAW_RELEASE. */
  function jawEnvelope(audio, t) {
    var first = earliest(audio);
    var env = 0;
    for (var k = 0; k < JAW_LOOKBACK; k++) {
      var age = k / 60;
      var beat = audio.sample(Math.max(first, t - age)).beat;
      env = Math.max(env, beat * Math.exp(-age / JAW_RELEASE));
    }
    return Math.max(0, Math.min(1, env));
  }

  /** Jaw opening in radians: up to 0.3 rad at full strength, never past 0.45. */
  function jawAngle(env, jawStrength, intensity) {
    return Math.min(0.45, env * 0.3 * (jawStrength / 100) * intensity);
  }

  /** Head nod in radians: about 2 degrees per unit of intensity, never past 0.06. */
  function nodAngle(env, intensity) {
    return Math.min(0.06, env * ((2 * Math.PI) / 180) * intensity);
  }

  /** Eye brightness: a base glow, plus loudness, plus a short flare after each hit. */
  function eyeLevel(audio, t, glow, intensity) {
    var level = EYE_BASE + 0.65 * audio.sample(t).loud * intensity;
    var hits = audio.recentHits(t, 3);
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0];
      if (age < FLARE_TIME) level += hits[i][1] * (1 - age / FLARE_TIME) * (glow / 100);
    }
    return Math.max(EYE_BASE, Math.min(3, level));
  }

  /**
   * Tower heights in whole blocks, one per spectrum column, and a peak block above each that
   * holds the highest recent height and falls at PEAK_FALL blocks per second.
   */
  function towerColumns(audio, t, maxBlocks) {
    maxBlocks = maxBlocks || 18;
    var first = earliest(audio);
    var now = audio.spectrum(t);
    var heights = [];
    var peaks = [];
    for (var i = 0; i < now.length; i++) {
      heights.push(Math.round(now[i] * maxBlocks));
      peaks.push(heights[i]);
    }
    var steps = Math.round(PEAK_HOLD * 30);
    for (var j = 1; j <= steps; j++) {
      var when = t - j / 30;
      if (when < first) break;
      var past = audio.spectrum(when);
      var fallen = Math.floor((j / 30) * PEAK_FALL);
      for (var c = 0; c < past.length; c++) {
        peaks[c] = Math.max(peaks[c], Math.round(past[c] * maxBlocks) - fallen);
      }
    }
    return { heights: heights, peaks: peaks };
  }

  /**
   * Waveform points [x0, y0, x1, y1, ...] left to right, mirrored: values[0] sits at the
   * centre and the last value at both edges.
   */
  function waveformPoints(values, width, baseline, amplitude) {
    var n = values.length;
    var out = new Float32Array(4 * n);
    var half = width / 2;
    for (var i = 0; i < n; i++) {
      var dx = ((i + 0.5) / n) * half;
      var y = baseline - values[i] * amplitude;
      var left = n - 1 - i;
      out[2 * left] = half - dx;
      out[2 * left + 1] = y;
      var right = n + i;
      out[2 * right] = half + dx;
      out[2 * right + 1] = y;
    }
    return out;
  }

  /** The Bands setting (10..100 %) as a number of waveform points per side (16..160). */
  function bandsToCount(pct) {
    return Math.round(16 + ((pct - 10) / 90) * 144);
  }

  /** The Thickness setting (2..110 %) as a line width in pixels (100 % = 12 px). */
  function thicknessToPx(pct) {
    return Math.max(0.75, (pct / 100) * 12);
  }

  var api = {
    jawEnvelope: jawEnvelope,
    jawAngle: jawAngle,
    nodAngle: nodAngle,
    eyeLevel: eyeLevel,
    towerColumns: towerColumns,
    waveformPoints: waveformPoints,
    bandsToCount: bandsToCount,
    thicknessToPx: thicknessToPx,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.WraithMotion = api;
})();
