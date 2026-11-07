/*
 * Neon Sundown's motion and scene: how the sun, its bars, the grid and the mountains follow
 * the music, and the fixed scenery (mountain ridges, stars). Everything is worked out from the
 * song time alone (the toolkit's beatEnvelope looks back a little), so any frame can be drawn
 * on its own and every render is identical. Random numbers come only from the toolkit's
 * seeded mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels. Shapes are measured from the frame centre, y down; the mountain
 * ridges and stars are in screen pixels from the top-left corner.
 */
(function () {
  "use strict";

  var ARC = 220; // degrees of bars around the sun, centred on the top
  var SUN = { x: 0, y: -110, r: 200 }; // screen (960, 430)
  var COVER_R = 140;
  var HORIZON = 100; // screen y 640
  var OUT_START = 212; // outside bars start this far from the sun's centre
  var OUT_SCALE = 120;
  var OUT_MAX = 120;
  var IN_SCALE = 50;
  var IN_MAX = 50;
  var COVER_GAP = 6; // inside bars stop at least this far outside the cover
  var PULSE_RELEASE = 0.2;

  /**
   * Bar lengths in px (before the sun's pulse) for each value: outward from just outside the
   * sun, and inward from the sun's edge. Squared, so quiet bands drop back and peaks stand out.
   */
  function barLengths(values, intensity, side, hasCover) {
    var n = values.length;
    var outer = new Float32Array(n),
      inner = new Float32Array(n);
    var innerMax = hasCover ? Math.min(IN_MAX, SUN.r - COVER_R - COVER_GAP) : IN_MAX;
    for (var i = 0; i < n; i++) {
      var v2 = values[i] * values[i] * intensity;
      if (side !== "inside") outer[i] = Math.min(OUT_MAX, v2 * OUT_SCALE);
      if (side !== "outside") inner[i] = Math.min(innerMax, v2 * IN_SCALE);
    }
    return { outer: outer, inner: inner };
  }

  /** The Bands setting as a number of bars around the 220° arc. */
  function barCount(V, pct) {
    return V.bandsToRingCount(pct, 96);
  }

  /** The sun's scale on the beat: up to 4 % bigger at a full beat and intensity 1. */
  function sunPulse(env, intensity) {
    return 1 + 0.04 * env * intensity;
  }

  /** How far the grid has scrolled toward the viewer, as a fraction of one cell. */
  function gridOffset(songTime, speedPct) {
    var cells = (songTime * 2 * speedPct) / 100;
    return cells - Math.floor(cells);
  }

  /** Grid line brightness: flashes brighter on the beat. */
  function gridBrightness(env) {
    return 0.55 + 0.45 * env;
  }

  /** Mountain outline brightness: brighter when the music is loud. */
  function mountainLevel(loud) {
    return 0.6 + 0.4 * loud;
  }

  /** How far the sun's gaps have drifted down: one gap spacing every 4 s. */
  function stripeOffset(songTime) {
    var s = songTime / 4;
    return s - Math.floor(s);
  }

  /**
   * The gaps cut across the lower half of the sun, as [top, bottom] in sun units (0 = centre,
   * 1 = bottom edge). Thicker toward the bottom.
   */
  function sunGaps(offset) {
    var gaps = [];
    for (var i = 0; i <= 6; i++) {
      var c = (i + offset) / 6;
      if (c <= 0 || c >= 1) continue;
      var half = 0.008 + 0.035 * c;
      gaps.push([c - half, c + half]);
    }
    return gaps;
  }

  /** Smoothly interpolated value noise between knots. */
  function smooth(knots, x) {
    var i = Math.min(knots.length - 2, Math.floor(x));
    var f = x - i;
    f = f * f * (3 - 2 * f);
    return knots[i] + (knots[i + 1] - knots[i]) * f;
  }

  /**
   * Two mountain ridgelines, far and near: the screen y of the ridge top at x = 0, 20, …, 1920.
   * Low in the middle, so the sun shows through the valley; tallest at the frame edges.
   */
  function buildMountains(mulberry32) {
    var rand = mulberry32(5);
    function ridge(maxH) {
      var coarse = [],
        fine = [];
      for (var c = 0; c <= 12; c++) coarse.push(rand());
      for (var f = 0; f <= 48; f++) fine.push(rand());
      var out = new Float32Array(97);
      for (var i = 0; i < 97; i++) {
        var x = i * 20;
        var noise = 0.75 * smooth(coarse, x / 160) + 0.25 * smooth(fine, x / 40); // 0..1
        var envelope = Math.pow(Math.max(0, Math.min(1, (Math.abs(x - 960) - 160) / 600)), 0.8);
        out[i] = 640 - envelope * maxH * (0.55 + 0.45 * noise);
      }
      return out;
    }
    var far = ridge(150);
    var near = ridge(230);
    return { far: far, near: near };
  }

  /** 200 faint stars [x, y, size, brightness] in the top half of the sky. */
  function buildStars(mulberry32) {
    var rand = mulberry32(13);
    var out = new Float32Array(4 * 200);
    for (var s = 0; s < 200; s++) {
      out[4 * s] = rand() * 1920;
      out[4 * s + 1] = rand() * 540;
      out[4 * s + 2] = 1 + rand();
      out[4 * s + 3] = 0.2 + 0.5 * rand();
    }
    return out;
  }

  /**
   * How the grid's lines are drawn at a preview size (1 = the full-size render): a 2 px line,
   * never thinner than 1.2 screen pixels (drawn wider and dimmer instead); a soft edge of half
   * a screen pixel; and lines fade out where they crowd closer than 4..10 screen pixels, so
   * the far grid doesn't shimmer.
   */
  function gridLineParams(previewScale) {
    var w = Math.max(2, 1.2 / previewScale);
    return {
      half: w / 2,
      gain: 2 / w,
      soft: 0.5 / previewScale,
      crowdLo: 4 / previewScale,
      crowdHi: 10 / previewScale,
    };
  }

  // VHS scanlines: every 3 rows (1080p units) the first 0.34 of the period is darkened by 12 %.
  // An export samples each pixel's centre (footprint 1). A smaller preview pixel covers
  // `footprint` rows, so it shows the average darkness over them (a box filter): the same lines
  // the export has, seen from further away, without moire. The VHS shader does the same sums.
  var SCAN_PERIOD = 3;
  var SCAN_DARK = 0.34 * SCAN_PERIOD;
  function scanCovered(y) {
    var whole = Math.floor(y / SCAN_PERIOD);
    return whole * SCAN_DARK + Math.min(y - whole * SCAN_PERIOD, SCAN_DARK);
  }
  function scanlineDark(y, footprint) {
    if (footprint <= 1) {
      var f = y / SCAN_PERIOD - Math.floor(y / SCAN_PERIOD);
      return f < 0.34 ? 0.12 : 0;
    }
    var a = y - footprint / 2;
    var b = y + footprint / 2;
    return (0.12 * (scanCovered(b) - scanCovered(a))) / footprint;
  }

  var api = {
    scanlineDark: scanlineDark,
    gridLineParams: gridLineParams,
    ARC: ARC,
    SUN: SUN,
    COVER_R: COVER_R,
    HORIZON: HORIZON,
    OUT_START: OUT_START,
    OUT_MAX: OUT_MAX,
    IN_MAX: IN_MAX,
    PULSE_RELEASE: PULSE_RELEASE,
    barLengths: barLengths,
    barCount: barCount,
    sunPulse: sunPulse,
    gridOffset: gridOffset,
    gridBrightness: gridBrightness,
    mountainLevel: mountainLevel,
    stripeOffset: stripeOffset,
    sunGaps: sunGaps,
    buildMountains: buildMountains,
    buildStars: buildStars,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.SundownMotion = api;
})();
