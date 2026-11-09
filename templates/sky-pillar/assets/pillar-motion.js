/*
 * Sky Pillar's motion: how the beam of light, the stack of lines at its tip, the beat flare and
 * the title follow the music, and the outline of the small figure standing under the beam.
 * Everything is worked out from the song time alone (the toolkit's beatEnvelope and smokeTime
 * below look back a little), so any frame can be drawn on its own and every render is
 * identical. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var TIP_Y = 470; // the beam comes down from the top edge to a point here
  var FLOOR_Y = 600; // the floor's horizon, where the figure stands
  var FIGURE_HEIGHT = 70;
  var LINE_GAP = 6; // px between the tip lines
  var LINE_MAX = 160; // px: the longest a tip line reaches either side of the beam
  var FLARE_RELEASE = 0.25; // seconds for the beat flare to fall to about a third
  var FLARE_LEN = 640; // px each way of a full flare at intensity 1
  var FLARE_MAX = 940; // px each way: never past the frame's edges
  var PULSE = 0.03; // title scale added by a full beat
  var SMOKE_SPEED = 0.05; // smoke drift (noise units) per second of song
  var SMOKE_PUSH = 0.05; // extra drift per second of full flux in the last SMOKE_WINDOW
  var SMOKE_WINDOW = 1.5; // seconds of flux that push the smoke along

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  /** The beam's core width and brightness: 0.7 + 0.5 × loud × intensity. */
  function beamLevel(loud, intensity) {
    return 0.7 + 0.5 * clamp01(loud) * intensity;
  }

  /** The Bands setting (10..100 %) as an odd number of tip lines, 3 to 9 (5 at 55 %). */
  function lineCount(bandPct) {
    var n = Math.round(9 * (0.2 + (0.8 * (bandPct - 10)) / 90));
    if (n % 2 === 0) n += 1;
    return Math.max(3, Math.min(9, n));
  }

  /** Each tip line's offset from the tip, px: LINE_GAP apart, centred. */
  function lineOffsets(count) {
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) out[i] = (i - (count - 1) / 2) * LINE_GAP;
    return out;
  }

  /** Half-widths of the tip lines, px. Squared, so quiet bands drop back and peaks stand out. */
  function lineHalfWidths(values, intensity) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      var v = Math.max(0, values[i]);
      out[i] = Math.min(LINE_MAX, v * v * LINE_MAX * intensity);
    }
    return out;
  }

  /** The beat flare through the tip: how far it reaches each way (px) and how bright. */
  function flare(env, intensity) {
    var e = clamp01(env);
    return { halfWidth: Math.min(FLARE_MAX, FLARE_LEN * e * intensity), strength: e };
  }

  /** The title's scale on the beat. */
  function titleScale(env, on) {
    return on ? 1 + PULSE * env : 1;
  }

  /**
   * How far the smoke has drifted upward (noise units): steadily with the song time, pushed a
   * little further while the music is busy (the flux of the last SMOKE_WINDOW seconds). Only
   * the recent past is read, so a section drifts exactly like the full render.
   */
  function smokeTime(audio, t) {
    var first = -(audio.offset || 0);
    var steps = Math.round(SMOKE_WINDOW * 30);
    var push = 0;
    for (var k = 0; k < steps; k++) {
      var at = t - k / 30;
      if (at < first) break;
      push += audio.sample(at).flux / 30;
    }
    return SMOKE_SPEED * ((audio.songStart || 0) + t) + SMOKE_PUSH * push;
  }

  /**
   * A small standing figure seen from behind, as a closed outline of [x, y] points: feet on
   * y = 0, the top of the head at -FIGURE_HEIGHT, centred on x = 0.
   */
  function figureOutline() {
    var s = FIGURE_HEIGHT / 70;
    var right = [];
    // the head: a circle of radius 4.6 whose top is at -70
    for (var a = 0; a <= 140; a += 20) {
      var r = (a * Math.PI) / 180;
      right.push([4.6 * Math.sin(r), -65.4 - 4.6 * Math.cos(r)]);
    }
    right.push(
      [1.9, -60.2], // neck
      [3.4, -59.0],
      [7.4, -57.8], // shoulder
      [8.8, -55.6],
      [9.2, -49.0], // upper arm
      [9.3, -42.5], // elbow
      [8.9, -36.0],
      [8.3, -33.6], // hand
      [7.2, -34.2],
      [6.9, -41.0], // inner arm, against the body
      [6.2, -36.0], // hip
      [5.6, -26.0],
      [5.0, -12.0], // leg
      [4.3, -2.2], // ankle
      [5.2, 0], // toe
      [0.9, 0], // heel, inside
      [0.7, -12.0], // inner leg
      [0.6, -26.0],
    );
    var out = [[0, -70]];
    for (var i = 1; i < right.length; i++) out.push(right[i]);
    out.push([0, -29.0]); // between the legs
    for (var j = right.length - 1; j >= 1; j--) out.push([-right[j][0], right[j][1]]);
    for (var k = 0; k < out.length; k++) {
      out[k] = [Math.round(out[k][0] * s * 1e6) / 1e6, Math.round(out[k][1] * s * 1e6) / 1e6];
    }
    return out;
  }

  var api = {
    TIP_Y: TIP_Y,
    FLOOR_Y: FLOOR_Y,
    FIGURE_HEIGHT: FIGURE_HEIGHT,
    LINE_GAP: LINE_GAP,
    LINE_MAX: LINE_MAX,
    FLARE_RELEASE: FLARE_RELEASE,
    FLARE_MAX: FLARE_MAX,
    beamLevel: beamLevel,
    lineCount: lineCount,
    lineOffsets: lineOffsets,
    lineHalfWidths: lineHalfWidths,
    flare: flare,
    titleScale: titleScale,
    smokeTime: smokeTime,
    figureOutline: figureOutline,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.PillarMotion = api;
})();
