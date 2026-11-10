/*
 * Late Show's motion: the synthwave scene on the TV screen and the TV itself. The grid's
 * scroll, the horizon spectrum, the sun's breathing stripes, the screen's flicker, its dips and
 * roll line on strong hits, the cover's glitch, the camera's slow drift and the title's fit.
 * Everything is worked out from the song time and the audio alone, so any frame can be drawn on
 * its own and every render is identical. Random numbers come only from the toolkit's seeded
 * mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * A beat is known by its song frame, round(song time × fps), never by a running count, so a
 * section's glitches match the full render's: each glitch is seeded by mulberry32(SEED + frame).
 *
 * The grid's position is the distance travelled, which needs the loudness so far: the page builds
 * a running total of the analysis's loudness once (loudTable). A section's analysis starts a few
 * seconds before it, so its grid runs at exactly the full render's speed but may sit at another
 * point of its (endlessly repeating) cells: nobody can tell, as every cell looks the same.
 */
(function () {
  "use strict";

  var SEED = 4417;
  var GRID_BASE = 1.15; // grid cells per second at speed 1
  var GRID_LOUD = 0.6; // speed 1 + 0.6 × loud × intensity
  var SPEC_MAX = 120; // px: the horizon spectrum's tallest peak
  var SPEC_SCALE = 112; // px at full loudness and intensity 1, before the cap
  var SPEC_SHAPE = 2.5; // each band relative to the loudest, to this power: the peaks stand out
  var STRONG = 0.6; // a hit at least this strong glitches the cover and dips the screen
  var LOOKBACK = 1; // seconds of strong beats looked at (a section keeps 6 s before its start)
  var HIT_EPS = 1e-4; // a beat this close after "now" counts already
  var MAX_HITS = 16;
  var GLITCH_TIME = 0.12; // seconds a glitch lasts
  var GLITCH_MAX = 0.12; // a slice moves at most this share of the cover's width
  var DIP_RELEASE = 0.2; // seconds: how fast a hit's dip fades
  var DIP_MAX = 0.11; // the screen dims at most this much on a full hit
  var ROLL_TIME = 0.32; // seconds the roll line takes to cross the screen
  var FLICKER_MAX = 0.04;
  var FLICKER_RATE = 6; // changes a second
  var DRIFT_MAX = Math.PI / 180; // 1°
  var STRIPE_PERIOD = 5; // seconds for the sun's gaps to drift one spacing down

  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function intensityOf(i) {
    return Math.max(0, Math.min(2, finite(i, 1)));
  }

  // ---------- the grid ----------

  /** The grid's speed (1 = its base speed): faster when the music is loud. */
  function gridSpeed(loud, intensity) {
    return 1 + GRID_LOUD * clamp01(loud) * intensityOf(intensity);
  }

  /** Running total of the analysis's loudness, in loud-seconds: table[i] = sum of frames < i. */
  function loudTable(frames, fps) {
    var n = frames.length;
    var table = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) table[i + 1] = table[i] + clamp01(frames[i].l) / fps;
    return table;
  }

  /** The loud-seconds from the analysis's start up to time t (offset: its pre-roll, s). */
  function loudSeconds(table, fps, offset, t) {
    var x = (finite(t, 0) + finite(offset, 0)) * fps;
    var n = table.length - 1;
    if (!(x > 0) || n < 1) return 0;
    if (x >= n) return table[n];
    var i = Math.floor(x);
    // the frame's own loudness spreads evenly over its 1/fps
    return table[i] + (table[i + 1] - table[i]) * (x - i);
  }

  /** How far the grid has travelled, in cells (only its fraction shows). */
  function gridTravel(songTime, loudSecs, intensity) {
    return (
      GRID_BASE *
      (finite(songTime, 0) + GRID_LOUD * intensityOf(intensity) * Math.max(0, finite(loudSecs, 0)))
    );
  }

  // ---------- strong beats: glitch, dip, roll line ----------

  /** Strong beats of the last LOOKBACK seconds, newest first: { frame, age, strength }. */
  function strongBeats(audio, t) {
    var out = [];
    if (!(typeof t === "number" && isFinite(t))) return out;
    var songNow = (audio.songStart || 0) + t;
    var hits = audio.recentHits(t + HIT_EPS, MAX_HITS);
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0] - HIT_EPS;
      if (age > LOOKBACK + 1e-6) break; // (a tie at exactly LOOKBACK never flips on rounding)
      var strength = clamp01(hits[i][1]);
      if (strength < STRONG) continue;
      out.push({
        frame: Math.round((songNow - age) * audio.fps),
        age: age > 1e-9 ? age : 0,
        strength: strength,
      });
    }
    return out;
  }

  /**
   * The cover's glitch: for GLITCH_TIME after a strong beat, 2-4 horizontal slices of it
   * [top, bottom (0..1 down the cover), sideways shift (share of its width)], seeded by the
   * beat's song frame. Halfway through, the slices jump back past their place (half as far),
   * so the glitch changes at most twice per beat. split: a colour split in px.
   */
  function glitch(beats, mulberry32) {
    var b = beats[0];
    if (!b || !(b.age < GLITCH_TIME)) return { active: false, slices: [], split: 0 };
    var r = mulberry32((SEED + Math.round(finite(b.frame, 0))) | 0);
    var count = 2 + Math.min(2, Math.floor(r() * 3));
    var back = b.age >= GLITCH_TIME / 2 ? -0.5 : 1;
    var slices = [];
    for (var i = 0; i < count; i++) {
      var y0 = r() * 0.86;
      var y1 = Math.min(1, y0 + 0.04 + r() * 0.16);
      var dx = (r() < 0.5 ? -1 : 1) * GLITCH_MAX * (0.3 + 0.7 * r());
      slices.push([y0, y1, dx * back]);
    }
    return { active: true, slices: slices, split: 2 + 3 * b.strength };
  }

  /** 0..1: the strong hits, each fading with a DIP_RELEASE time constant. */
  function hitEnvelope(beats) {
    var env = 0;
    for (var i = 0; i < beats.length; i++) {
      env = Math.max(env, beats[i].strength * Math.exp(-beats[i].age / DIP_RELEASE));
    }
    return clamp01(env);
  }

  /** How much the screen dims on a hit (0..DIP_MAX). */
  function screenDip(env, intensity) {
    return DIP_MAX * clamp01(env) * Math.min(1, intensityOf(intensity));
  }

  /** The "signal" roll line after the newest strong hit: pos 0 (top) .. 1 (bottom), alpha. */
  function rollLine(beats) {
    var b = beats[0];
    if (!b) return { pos: 0, alpha: 0 };
    var pos = b.age / ROLL_TIME;
    if (!(pos < 1)) return { pos: 0, alpha: 0 };
    return { pos: pos, alpha: b.strength * (1 - pos) };
  }

  /** The screen's flicker, 0..FLICKER_MAX of its brightness: a new seeded value 6 times a second. */
  function flicker(songTime, mulberry32) {
    // (the small nudge keeps a section's frames on the same step as the full render's)
    var k = Math.floor(finite(songTime, 0) * FLICKER_RATE + 1e-4);
    var r = mulberry32((SEED + 9001 + k) | 0)();
    return FLICKER_MAX * r * r;
  }

  // ---------- the horizon spectrum ----------

  /**
   * `count` values along the horizon: the bass at both ends, mirrored, the highest band in the
   * middle (behind the cover). The reference's tallest peaks sit near the ends; the middle is
   * hidden by the cover anyway.
   */
  function horizonValues(V, spectrum, count) {
    var half = Math.ceil(count / 2);
    var side = V.mirrorBars(spectrum, half, false);
    var out = new Float32Array(count);
    for (var k = 0; k < half; k++) {
      out[k] = side[k];
      out[count - 1 - k] = side[k];
    }
    return out;
  }

  /**
   * Heights in px, from the unboosted spectrum (values 0..1). The Spectrum boost setting can't
   * shape the line: at 8× every band of loud music reads exactly 1, so there would be nothing
   * left to draw. Instead each value is taken relative to the frame's loudest band and
   * raised to SPEC_SHAPE, so only the bands near the top stand tall, and the boost acts on the
   * loudest band's level, which sets how tall the peaks stand: 1 - (1 - peak)^boost, squared.
   * The line rises from the horizon over its outer ends, and never passes SPEC_MAX. Silence
   * gives a flat line.
   */
  function horizonHeights(values, intensity, boost) {
    var n = values.length;
    var out = new Float32Array(n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(values[i]));
    if (!(peak > 0)) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = 1 - Math.pow(1 - peak, b);
    var scale = SPEC_SCALE * intensityOf(intensity) * level * level;
    var ramp = Math.max(1, 0.035 * (n - 1));
    for (var k = 0; k < n; k++) {
      var r = clamp01(values[k]) / peak;
      var e = Math.min(1, Math.min(k, n - 1 - k) / ramp);
      var taper = e * e * (3 - 2 * e);
      out[k] = Math.min(SPEC_MAX, scale * Math.pow(r, SPEC_SHAPE) * taper);
    }
    return out;
  }

  // ---------- the sun and the scene's brightness ----------

  /**
   * The gaps cut across the lower half of the sun, [top, bottom] in sun units (0 = centre,
   * 1 = bottom edge): thicker toward the bottom, drifting slowly down, wider on the beat.
   */
  function sunGaps(songTime, env) {
    var s = finite(songTime, 0) / STRIPE_PERIOD;
    var offset = s - Math.floor(s);
    var breathe = 1 + 0.9 * clamp01(env);
    var gaps = [];
    for (var i = 0; i <= 6; i++) {
      var c = (i + offset) / 6;
      if (c <= 0.02 || c >= 0.98) continue;
      var half = (0.006 + 0.03 * c) * breathe;
      gaps.push([Math.max(0, c - half), Math.min(1, c + half)]);
    }
    return gaps;
  }

  /** Brightness of the grid, the horizon line, the sky's glow and the sun (1 = normal). */
  function sceneLevels(loud, env, intensity) {
    var l = clamp01(loud) * Math.min(1.5, intensityOf(intensity));
    var e = clamp01(env) * Math.min(1, intensityOf(intensity));
    return {
      grid: 0.38 + 0.75 * l + 0.25 * e,
      horizon: 0.6 + 0.45 * l + 0.3 * e,
      glow: 0.35 + 0.7 * l + 0.2 * e,
      sun: 0.72 + 0.28 * l + 0.2 * e,
    };
  }

  // ---------- the camera ----------

  /** The camera's slow drift round the TV, [yaw, pitch] radians, each at most 1°. */
  function cameraDrift(songTime, mulberry32) {
    var r = mulberry32(SEED + 77);
    var p = [r(), r(), r(), r()].map(function (x) {
      return x * 2 * Math.PI;
    });
    var s = finite(songTime, 0);
    var tau = 2 * Math.PI;
    var yaw = 0.6 * Math.sin(tau * 0.029 * s + p[0]) + 0.4 * Math.sin(tau * 0.0137 * s + p[1]);
    var pitch = 0.6 * Math.sin(tau * 0.023 * s + p[2]) + 0.4 * Math.sin(tau * 0.011 * s + p[3]);
    return [DRIFT_MAX * yaw, DRIFT_MAX * pitch];
  }

  // ---------- the title ----------

  /** Words into lines no wider than maxWidth at `size` (breaking words only if `chars`). */
  function wrap(words, measure, size, maxWidth, chars) {
    var lines = [];
    var line = "";
    function fits(s) {
      return measure(s) * size <= maxWidth;
    }
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var tryLine = line ? line + " " + word : word;
      if (fits(tryLine)) {
        line = tryLine;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      if (fits(word)) {
        line = word;
        continue;
      }
      if (!chars) return null;
      // a word too long for a line: break it between letters
      var part = "";
      for (var c = 0; c < word.length; c++) {
        if (part && !fits(part + word[c])) {
          lines.push(part);
          part = "";
        }
        part += word[c];
      }
      line = part;
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * The title's size (px) and lines: as big as `start`, shrinking (down to `floor`) until it
   * fits maxLines lines of maxWidth, wrapping between words. At the smallest size a word too long
   * for a line breaks between letters. measure(text) is the text's width at 1 px.
   */
  function fitTitle(text, measure, maxWidth, maxLines, start, floor) {
    var words = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return { size: start, lines: [] };
    for (var size = start; size >= floor; size -= 2) {
      var lines = wrap(words, measure, size, maxWidth, false);
      if (lines && lines.length <= maxLines) return { size: size, lines: lines };
    }
    return { size: floor, lines: wrap(words, measure, floor, maxWidth, true) };
  }

  var api = {
    SEED: SEED,
    GRID_BASE: GRID_BASE,
    SPEC_MAX: SPEC_MAX,
    STRONG: STRONG,
    GLITCH_TIME: GLITCH_TIME,
    DIP_RELEASE: DIP_RELEASE,
    LOOKBACK: LOOKBACK,
    FLICKER_MAX: FLICKER_MAX,
    FLICKER_RATE: FLICKER_RATE,
    DRIFT_MAX: DRIFT_MAX,
    gridSpeed: gridSpeed,
    loudTable: loudTable,
    loudSeconds: loudSeconds,
    gridTravel: gridTravel,
    strongBeats: strongBeats,
    glitch: glitch,
    hitEnvelope: hitEnvelope,
    screenDip: screenDip,
    rollLine: rollLine,
    flicker: flicker,
    horizonValues: horizonValues,
    horizonHeights: horizonHeights,
    sunGaps: sunGaps,
    sceneLevels: sceneLevels,
    cameraDrift: cameraDrift,
    fitTitle: fitTitle,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.ShowMotion = api;
})();
