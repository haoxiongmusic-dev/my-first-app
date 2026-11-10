/*
 * Night Flight's motion: the clouds rushing toward you, the plane's gentle bank, the small shake
 * on the beat, the HUD rings (pulse, the inner ring's turn, the spectrum ticks), the gauges'
 * needles, the level meter, the scene's brightness and the title's fit. Everything is worked out
 * from the song time and the audio alone, so any frame can be drawn on its own and every render
 * is identical. Random numbers come only from the toolkit's seeded mulberry32, passed in. Pure:
 * no DOM, so Vitest tests it directly.
 *
 * The clouds' position is the distance flown, which needs the loudness so far: the page builds a
 * running total of the analysis's loudness once (loudTable). A section's analysis starts a few
 * seconds before it and carries the loudness summed over everything before that (loudBefore,
 * written by the job builder), so a section's clouds are exactly where the full render's are at
 * the same song time.
 *
 * Sizes are 1080p pixels.
 */
(function () {
  "use strict";

  var SEED = 7121;
  var CLOUD_BASE = 7; // cloud-sea units flown a second at speed 1 (the camera flies 1 unit up)
  var CLOUD_LOUD = 0.8; // speed 1 + 0.8 × loud × intensity
  var CLOUD_FREQ = 1 / 2; // the cloud pattern's largest cells are 2 units across …
  var CLOUD_PERIOD = 256 / CLOUD_FREQ; // … and it repeats every 256 of them (the shader's hash)
  var BANK_MAX = (2 * Math.PI) / 180; // 2°
  var SHAKE_MAX = 6; // px
  var SHAKE_SCALE = 5; // px at a full beat and intensity 1, before the cap
  var SHAKE_RATE = 30; // the shake picks a new direction this often per second of song
  var PULSE = 0.04; // the rings grow this much on a full beat
  var INNER_SPIN = (6 * Math.PI) / 180; // the inner ring turns 6° a second
  var TICK_SHAPE = 2; // each band relative to the loudest, squared: the peaks stand out
  var TICK_FLOOR = 0.12; // a tick never shrinks below this share of its length while music plays
  var LEVEL_WINDOW = 0.3; // seconds the gauges and the meter average over
  var LEVEL_STEPS = 9;
  var LOW_BANDS = 6; // the analyzer's lowest bands: the bass gauge
  var NEEDLE_SWEEP = (130 * Math.PI) / 180; // each side of straight up

  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function intensityOf(i) {
    return Math.max(0, Math.min(2, finite(i, 1)));
  }

  // ---------- the clouds ----------

  /** The clouds' speed (1 = the base speed): faster when the music is loud. */
  function cloudSpeed(loud, intensity) {
    return 1 + CLOUD_LOUD * clamp01(loud) * intensityOf(intensity);
  }

  /** Running total of the analysis's loudness, in loud-seconds: table[i] = sum of frames < i. */
  function loudTable(frames, fps) {
    var n = frames.length;
    var table = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) table[i + 1] = table[i] + clamp01(frames[i].l) / fps;
    return table;
  }

  /**
   * The loud-seconds from the song's start up to time t: `before` (the loudness before this
   * analysis: 0 for a whole song) plus the table up to t (offset: the analysis's pre-roll, s).
   */
  function loudSeconds(table, fps, offset, t, before) {
    var base = Math.max(0, finite(before, 0));
    var x = (finite(t, 0) + finite(offset, 0)) * fps;
    var n = table.length - 1;
    if (!(x > 0) || n < 1) return base;
    if (x >= n) return base + table[n];
    var i = Math.floor(x);
    // the frame's own loudness spreads evenly over its 1/fps
    return base + table[i] + (table[i + 1] - table[i]) * (x - i);
  }

  /** How far the camera has flown over the clouds, in cloud-sea units. */
  function cloudTravel(songTime, loudSecs, intensity) {
    return (
      CLOUD_BASE *
      (finite(songTime, 0) + CLOUD_LOUD * intensityOf(intensity) * Math.max(0, finite(loudSecs, 0)))
    );
  }

  /** x wrapped into 0..period (the shader never sees big numbers; the pattern repeats anyway). */
  function wrap(x, period) {
    var v = finite(x, 0);
    var w = v - period * Math.floor(v / period);
    return w >= 0 && w < period ? w : 0;
  }

  // ---------- the bank and the shake ----------

  /** The plane's gentle bank (the horizon's tilt), radians, at most 2°, slow and seeded. */
  function bankAngle(songTime, mulberry32) {
    var r = mulberry32(SEED + 31);
    var p0 = r() * 2 * Math.PI,
      p1 = r() * 2 * Math.PI;
    var s = finite(songTime, 0);
    var tau = 2 * Math.PI;
    return (
      BANK_MAX * (0.65 * Math.sin(tau * 0.031 * s + p0) + 0.35 * Math.sin(tau * 0.0127 * s + p1))
    );
  }

  /**
   * How far the view is shaken on the beat, [dx, dy] whole px (at most SHAKE_MAX). The direction
   * is seeded by the song frame, so a section shakes exactly like the full render.
   */
  function shakeOffset(env, intensity, songTime, on, mulberry32) {
    var e = clamp01(env);
    if (!on || !(e > 0)) return [0, 0];
    var len = Math.min(SHAKE_MAX, SHAKE_SCALE * e * intensityOf(intensity));
    if (!(len > 0)) return [0, 0];
    var frame = Math.floor(finite(songTime, 0) * SHAKE_RATE + 1e-6);
    var angle = 2 * Math.PI * mulberry32((SEED + 101 + frame) | 0)();
    // whole pixels: a shifted frame then matches the last one exactly, which keeps the video
    // small and quick to encode (a fraction of a pixel would blur every voxel seam)
    // (toward zero, so the shake never passes SHAKE_MAX)
    var dx = Math.trunc(Math.cos(angle) * len),
      dy = Math.trunc(Math.sin(angle) * len);
    return [dx === 0 ? 0 : dx, dy === 0 ? 0 : dy];
  }

  // ---------- the HUD ----------

  /** The rings' scale on the beat: 1 + 0.04 × the beat envelope. */
  function ringPulse(env) {
    return 1 + PULSE * clamp01(env);
  }

  /** How far the inner ring has turned, radians. */
  function innerTurn(songTime) {
    return INNER_SPIN * finite(songTime, 0);
  }

  /**
   * Tick lengths in px (0..maxLen), from ring values of the unboosted spectrum (0..1). At 8× boost
   * every band of loud music reads 1, so the boost can't shape the ticks: each value is taken
   * relative to the frame's loudest and squared, so only the bands near the top stand tall, and
   * the boost acts on the loudest band's level: 1 - (1 - peak)^boost. Silence gives none.
   */
  function tickLengths(values, intensity, boost, maxLen) {
    var n = values.length;
    var out = new Float32Array(n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(values[i]));
    if (!(peak > 0)) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = 1 - Math.pow(1 - peak, b);
    var scale = maxLen * Math.min(1.25, intensityOf(intensity)) * level;
    for (var k = 0; k < n; k++) {
      var r = clamp01(values[k]) / peak;
      var shaped = TICK_FLOOR + (1 - TICK_FLOOR) * Math.pow(r, TICK_SHAPE);
      out[k] = Math.min(maxLen, scale * shaped * (r > 0 ? 1 : 0));
    }
    return out;
  }

  // ---------- gauges, meter and the scene's brightness ----------

  /** The loudness and the low end (0..1), averaged over the last LEVEL_WINDOW seconds. */
  function levels(audio, t) {
    var loud = 0,
      low = 0;
    var tt = finite(t, 0);
    for (var i = 0; i < LEVEL_STEPS; i++) {
      var a = audio.sample(tt - (LEVEL_WINDOW * i) / (LEVEL_STEPS - 1));
      loud += clamp01(a.loud);
      var sum = 0;
      var nb = Math.min(LOW_BANDS, a.bands.length);
      for (var b = 0; b < nb; b++) sum += clamp01(a.bands[b]);
      low += nb > 0 ? sum / nb : 0;
    }
    return { loud: clamp01(loud / LEVEL_STEPS), low: clamp01(low / LEVEL_STEPS) };
  }

  /** A needle's angle (radians, 0 = straight up, clockwise) for a 0..1 level. */
  function needleAngle(level) {
    return NEEDLE_SWEEP * (2 * clamp01(level) - 1);
  }

  /** How many of the level meter's `count` LEDs are lit. */
  function meterLit(loud, count) {
    return Math.round(clamp01(loud) * count);
  }

  /** Brightness of the horizon glow, the clouds, the moon and the HUD (1 = normal). */
  function skyLevels(loud, env, intensity) {
    var l = clamp01(loud) * Math.min(1.5, intensityOf(intensity));
    var e = clamp01(env) * Math.min(1, intensityOf(intensity));
    return {
      glow: 0.55 + 0.6 * l + 0.25 * e,
      cloud: 0.62 + 0.42 * l + 0.12 * e,
      moon: 0.86 + 0.12 * l + 0.06 * e,
      hud: 0.6 + 0.35 * l + 0.3 * e,
    };
  }

  // ---------- the title ----------

  /** Words into lines no wider than maxWidth at `size` (breaking words only if `chars`). */
  function wrapWords(words, measure, size, maxWidth, chars) {
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
      var lines = wrapWords(words, measure, size, maxWidth, false);
      if (lines && lines.length <= maxLines) return { size: size, lines: lines };
    }
    return { size: floor, lines: wrapWords(words, measure, floor, maxWidth, true) };
  }

  var api = {
    SEED: SEED,
    CLOUD_BASE: CLOUD_BASE,
    CLOUD_FREQ: CLOUD_FREQ,
    CLOUD_PERIOD: CLOUD_PERIOD,
    BANK_MAX: BANK_MAX,
    SHAKE_MAX: SHAKE_MAX,
    PULSE: PULSE,
    NEEDLE_SWEEP: NEEDLE_SWEEP,
    cloudSpeed: cloudSpeed,
    loudTable: loudTable,
    loudSeconds: loudSeconds,
    cloudTravel: cloudTravel,
    wrap: wrap,
    bankAngle: bankAngle,
    shakeOffset: shakeOffset,
    ringPulse: ringPulse,
    innerTurn: innerTurn,
    tickLengths: tickLengths,
    levels: levels,
    needleAngle: needleAngle,
    meterLit: meterLit,
    skyLevels: skyLevels,
    fitTitle: fitTitle,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.FlightMotion = api;
})();
