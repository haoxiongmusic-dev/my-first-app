/*
 * Afterglow's motion and layout: the slow push-in of the background, the dotted line and its
 * hairline bars, the beat's brightness lift, where each layout puts the text, the progress bar
 * and the player card, and the seeded lights of the generated night city. Everything is worked
 * out from the song time alone (the toolkit's beatEnvelope looks back a little), so any frame
 * can be drawn on its own and every render is identical. Random numbers come only from the
 * toolkit's seeded mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var LINE_Y = 540;
  var LINE_LEFT = 288; // the line runs across the middle 70 % of the frame
  var LINE_RIGHT = 1632;
  var DOT_GAP = 6; // a 2 px dot every 6 px
  var DOT_SIZE = 2;
  var BAR_WIDTH = 2;
  var BAR_MAX = 180; // px each way, at intensity 1
  var BAR_FULL = 112; // bars along the full line at Bands 100 %
  var BEAT_RELEASE = 0.3; // seconds for the beat's brightness lift to fall to about a third
  var BRIGHT_LIFT = 0.05;
  var PUSH_PERIOD = 120; // seconds: in for 60 s, back out for 60 s
  var PUSH_MAX = 0.06;
  var LAYOUTS = ["classic", "bigTitle", "bigTimer", "player"];

  function clamp01(x) {
    return x > 0 ? Math.min(1, x) : 0;
  }

  /** The background's slow push-in: 1 → 1.06 over 60 s and back, a smooth cosine. */
  function pushScale(songTime) {
    return 1 + (PUSH_MAX / 2) * (1 - Math.cos((2 * Math.PI * songTime) / PUSH_PERIOD));
  }

  /** The overall brightness on the beat: up to 5 % brighter. */
  function brightness(env) {
    return 1 + BRIGHT_LIFT * clamp01(env);
  }

  /** The Bands setting (10..100 %) as a bar count for a line this wide (112 on the full line). */
  function barCount(bandPct, width) {
    var full = (BAR_FULL * width) / (LINE_RIGHT - LINE_LEFT);
    var pct = Math.max(10, Math.min(100, Number(bandPct) || 10));
    return Math.max(2, Math.round(full * (0.2 + (0.8 * (pct - 10)) / 90)));
  }

  /** Each bar's left edge: even whole pixels, so a 2 px bar covers exactly two pixels. */
  function barXs(count, left, right) {
    var out = new Float32Array(count);
    var span = right - BAR_WIDTH - left;
    for (var i = 0; i < count; i++) {
      var u = count > 1 ? i / (count - 1) : 0;
      out[i] = left + 2 * Math.round((u * span) / 2);
    }
    return out;
  }

  /** Each dot's left edge along the line, DOT_GAP apart. */
  function dotXs(left, right) {
    var n = Math.floor((right - DOT_SIZE - left) / DOT_GAP) + 1;
    var out = new Float32Array(Math.max(0, n));
    for (var i = 0; i < out.length; i++) out[i] = left + i * DOT_GAP;
    return out;
  }

  /** Bar lengths each way, px: squared (like Halo Rings), so only the peaks stand tall. */
  function barLengths(values, intensity, max) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      var v = clamp01(values[i]);
      out[i] = v * v * max * intensity;
    }
    return out;
  }

  var SPIKE_FLOOR = 0.1; // the smallest share of its length a bar keeps between spikes
  var SPIKE_PUMP = 0.45; // share of every bar's length that comes with the beat
  var spikeParams = {}; // per bar count: each bar's seeded speed and phase
  /**
   * Each bar's share (0..1) of its spectrum length, for the reference's sparse hairline look:
   * the analyzer's 32 smooth bands (and a strong boost) would make a solid block of bars, so
   * every bar rises to a spike now and then on its own seeded rhythm. Bars at the bass end
   * are taller and spike broadly (they nearly always have a tall one); the rest spike rarely
   * and sharply, so most bars are tiny. The beat pumps them all. Song time only.
   */
  function spikes(count, songTime, env, mulberry32) {
    var params = spikeParams[count];
    if (!params) {
      var rand = mulberry32(4242 + count);
      params = [];
      for (var i = 0; i < count; i++) params.push([0.35 + 0.75 * rand(), rand()]);
      spikeParams[count] = params;
    }
    var pump = 1 - SPIKE_PUMP + SPIKE_PUMP * clamp01(env);
    var out = new Float32Array(count);
    for (var k = 0; k < count; k++) {
      var u = count > 1 ? k / (count - 1) : 0;
      var amp = 0.28 + 0.72 * Math.exp(-5 * u);
      var sharp = 1.5 + 12 * Math.min(1, u * 1.6);
      var wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * (params[k][0] * songTime + params[k][1]));
      var peak = Math.pow(wave, sharp);
      out[k] = Math.min(1, amp * (SPIKE_FLOOR + (1 - SPIKE_FLOOR) * peak) * pump);
    }
    return out;
  }

  /** How far along the progress bar is filled, px. */
  function progressFill(fraction, width) {
    return clamp01(fraction) * width;
  }

  // Where each layout puts its parts. Text: x, y (the middle of the line of text), size (px),
  // the widest it may be, and its alignment. times: the small elapsed / total clock, beside
  // the progress bar (gap px away) or under its two ends.
  var LAYOUT = {
    classic: {
      line: { y: LINE_Y, left: LINE_LEFT, right: LINE_RIGHT, max: BAR_MAX },
      caption: { x: 960, y: 752, size: 22, maxWidth: 1344, align: "center" },
      title: null,
      artist: null,
      bigTime: null,
      times: { size: 16, y: 797, gap: 22, under: false },
      progress: { x: 660, y: 792, w: 600, h: 10 },
      card: null,
    },
    bigTitle: {
      line: { y: 650, left: LINE_LEFT, right: LINE_RIGHT, max: 110 },
      caption: null,
      title: { x: 960, y: 400, size: 110, maxWidth: 1600, align: "center" },
      artist: { x: 960, y: 500, size: 26, maxWidth: 1344, align: "center" },
      bigTime: null,
      times: { size: 14, y: 803, gap: 18, under: false },
      progress: { x: 810, y: 800, w: 300, h: 6 },
      card: null,
    },
    bigTimer: {
      line: { y: 460, left: LINE_LEFT, right: LINE_RIGHT, max: 130 },
      caption: { x: 960, y: 625, size: 20, maxWidth: 1344, align: "center" },
      title: null,
      artist: null,
      bigTime: { x: 960, y: 760, size: 150, maxWidth: 1344, align: "center" },
      times: { size: 16, y: 882, gap: 22, under: false },
      progress: { x: 560, y: 880, w: 800, h: 4 },
      card: null,
    },
    player: {
      line: { y: 562, left: 554, right: 1366, max: 40 },
      caption: null,
      title: { x: 554, y: 456, size: 36, maxWidth: 812, align: "left" },
      artist: { x: 554, y: 494, size: 19, maxWidth: 812, align: "left" },
      bigTime: null,
      times: { size: 15, y: 648, gap: 0, under: true },
      progress: { x: 554, y: 618, w: 812, h: 6 },
      card: { x: 510, y: 410, w: 900, h: 260, r: 24 },
    },
  };

  /** A layout's geometry (a fresh copy); an unknown name gives the classic one. */
  function layout(name) {
    var key = Object.prototype.hasOwnProperty.call(LAYOUT, name) ? name : "classic";
    var copy = JSON.parse(JSON.stringify(LAYOUT[key]));
    copy.name = key;
    return copy;
  }

  /** How bright the night city's lights are (1 = as drawn): they swell with the music. */
  function lightsLevel(loud) {
    return 0.5 + 0.9 * clamp01(loud);
  }

  /** The night city's horizon glow (its strength): it brightens with the music. */
  function glowLevel(loud) {
    return 0.05 + 0.2 * clamp01(loud);
  }

  /** The dim veil over the background: loud music lifts it by up to 45 % of itself. */
  function veil(dim, loud) {
    return dim * (1 - 0.45 * clamp01(loud));
  }

  /** The Dim setting (0..100 %) as the strength of a black veil, 0..1. */
  function dimAlpha(pct) {
    return clamp01(Number(pct) / 100);
  }

  /** The template ships a tiny placeholder picture; anything that small means no picture. */
  function isPicture(w, h) {
    return w >= 32 && h >= 32;
  }

  /** The text and controls fade in from 0.3 s to 1.9 s (easing out). */
  function textFade(t) {
    var u = clamp01((t - 0.3) / 1.6);
    return 1 - (1 - u) * (1 - u);
  }

  /**
   * The generated night city's lights, seeded: out-of-focus bokeh discs over the street and
   * long horizontal light trails of passing cars on it. tone 0 = the main colour, 1 = the
   * accent, 2 = a warm mix of the two.
   */
  function cityLights(seed, mulberry32) {
    var rand = mulberry32(seed);
    var bokeh = [];
    for (var i = 0; i < 90; i++) {
      var x = -60 + 2040 * rand();
      // gathered round the horizon (y ≈ 470), thinning out above and below it
      var y = 470 + 240 * (rand() + rand() + rand() - 1.5) * 0.9;
      var size = rand();
      var pick = rand();
      var r = 5 + 44 * size * size * size; // mostly small, a few large
      bokeh.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        r: Math.round(r * 10) / 10,
        tone: pick < 0.35 ? 0 : pick < 0.75 ? 1 : 2,
        // small lights are brighter, the big soft ones faint
        alpha: Math.round((0.05 + (0.32 - 0.24 * size) * rand()) * 1000) / 1000,
      });
    }
    var streaks = [];
    for (var k = 0; k < 30; k++) {
      var depth = Math.pow(rand(), 1.4); // 0 = far (thin, near the horizon), 1 = near
      var sy = 610 + 350 * depth;
      var x0 = -300 + 1700 * rand();
      var len = 500 + 1500 * rand();
      var tone = rand() < 0.55 ? 1 : 0;
      streaks.push({
        y: Math.round(sy * 10) / 10,
        x0: Math.round(x0),
        x1: Math.round(x0 + len),
        width: Math.round((1.2 + 5.5 * depth * (0.5 + 0.5 * rand())) * 100) / 100,
        tone: tone,
        alpha: Math.round((0.3 + 0.5 * rand()) * 1000) / 1000,
      });
    }
    return { bokeh: bokeh, streaks: streaks };
  }

  var api = {
    LINE_Y: LINE_Y,
    LINE_LEFT: LINE_LEFT,
    LINE_RIGHT: LINE_RIGHT,
    DOT_GAP: DOT_GAP,
    DOT_SIZE: DOT_SIZE,
    BAR_WIDTH: BAR_WIDTH,
    BAR_MAX: BAR_MAX,
    BEAT_RELEASE: BEAT_RELEASE,
    LAYOUTS: LAYOUTS,
    pushScale: pushScale,
    brightness: brightness,
    barCount: barCount,
    barXs: barXs,
    dotXs: dotXs,
    barLengths: barLengths,
    spikes: spikes,
    layout: layout,
    progressFill: progressFill,
    lightsLevel: lightsLevel,
    dimAlpha: dimAlpha,
    veil: veil,
    glowLevel: glowLevel,
    isPicture: isPicture,
    textFade: textFade,
    cityLights: cityLights,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.AfterglowMotion = api;
})();
