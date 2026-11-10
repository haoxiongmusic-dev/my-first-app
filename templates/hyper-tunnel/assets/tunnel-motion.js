/*
 * Hyper Tunnel's motion: the tunnel rushing toward the camera (its travel and its frames), the
 * spectrum running down it (each frame's neon follows a band, nearer frames lower bands), the
 * edges' flash and the visor's glow on the beat, the robot's head nod, slow head turn and arm
 * sway, the accent flares that sweep across on strong beats, the tunnel's seeded details (circuit
 * traces, lit corner lines, sagging cables), the HUD's meters and crawling ticks, and the title's
 * fit. Everything is worked out from the song time and the audio alone, so any frame can be drawn
 * on its own and every render is identical. Random numbers come only from the toolkit's seeded
 * mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * The tunnel's position is the distance travelled, which needs the loudness so far: the page
 * builds a running total of the analysis's loudness once (loudTable). A section's analysis starts
 * a few seconds before it and carries the loudness summed over everything before that
 * (loudBefore, written by the job builder), so a section's tunnel is exactly where the full
 * render's is at the same song time. A strong beat's flare is seeded by its song frame
 * (round(its song time × fps)), and each gap between frames by the frame's own number along the
 * tunnel, so a section draws exactly what the full render draws.
 *
 * Tunnel sizes are tunnel units (the octagon's apothem is APOTHEM); HUD sizes are 1080p pixels.
 */
(function () {
  "use strict";

  var SEED = 9137;
  var TUNNEL_BASE = 7; // tunnel units a second at speed 1
  var TUNNEL_LOUD = 0.7; // speed 1 + 0.7 × loud × intensity
  var FRAME_SPACING = 7; // tunnel units between frames
  var FRAME_COUNT = 16; // frames ahead of the camera
  var APOTHEM = 8; // the octagon's centre-to-wall distance
  var HALF_SIDE = APOTHEM * Math.tan(Math.PI / 8); // half a wall's width
  var NEAR_FADE = 1.5; // frames fade out over their last units before the camera
  var FAR_FADE = 0.5; // … and fade in over the far half of the tunnel
  var LEVEL_SHAPE = 2; // each band relative to the loudest, squared: the peaks stand out
  var NOD_MAX = (3 * Math.PI) / 180;
  var NOD_RELEASE = 0.3; // s
  var TURN_BASE = (30 * Math.PI) / 180; // the head is turned to one side (against the body) …
  var TURN_MAX = (8 * Math.PI) / 180; // … and turns slowly 8° either way about that
  var SWAY_MAX = (2.5 * Math.PI) / 180; // the arms' slight sway
  var SWAY_RATE = 3; // the turn and sway move this often a second (in steps of about a pixel)
  var FLARE = 0.75; // a beat at least this strong sweeps a flare across
  var FLARE_LIFE = 0.5; // s
  var FLARE_ANGLE = (35 * Math.PI) / 180; // a flare's band leans at most this far from upright
  var EDGE_RELEASE = 0.25; // s: the edges' beat flash
  var CRAWL_RATE = 3; // the HUD's ticks crawl a pixel this often a second

  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function intensityOf(i) {
    return Math.max(0, Math.min(2, finite(i, 1)));
  }

  // ---------- the tunnel ----------

  /** The tunnel's speed (1 = the base speed): faster when the music is loud. */
  function tunnelSpeed(loud, intensity) {
    return 1 + TUNNEL_LOUD * clamp01(loud) * intensityOf(intensity);
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

  /** How far the camera has travelled down the tunnel, in tunnel units. */
  function tunnelTravel(songTime, loudSecs, intensity) {
    return (
      TUNNEL_BASE *
      (finite(songTime, 0) +
        TUNNEL_LOUD * intensityOf(intensity) * Math.max(0, finite(loudSecs, 0)))
    );
  }

  /**
   * The frames ahead of the camera, nearest first: [{ index, depth }]. Frame `index` stands at
   * index × FRAME_SPACING along the tunnel, so each keeps its number (and its seeded details) as
   * it rushes toward the camera; the nearest is at most one spacing away.
   */
  function tunnelFrames(travel) {
    var D = FRAME_SPACING;
    var tr = Math.max(0, finite(travel, 0));
    var first = Math.floor(tr / D) + 1;
    var out = [];
    for (var k = 0; k < FRAME_COUNT; k++) {
      var index = first + k;
      out.push({ index: index, depth: index * D - tr });
    }
    return out;
  }

  /** A frame's visibility (0..1) at a depth: faint far away, gone as it passes the camera. */
  function frameFade(depth) {
    var d = finite(depth, -1);
    if (!(d > 0)) return 0;
    var far = FRAME_SPACING * FRAME_COUNT;
    var fadeIn = clamp01((far - d) / (far * FAR_FADE));
    fadeIn = fadeIn * fadeIn * (3 - 2 * fadeIn);
    var fadeOut = clamp01(d / NEAR_FADE);
    return fadeIn * fadeOut;
  }

  /**
   * Which band (0..count-1, fractional) a frame at this depth follows: the nearest frames the
   * lowest band, the farthest the highest, spread by the logarithm of the depth (the near frames
   * fill most of the picture, the far ones crowd round the vanishing point).
   */
  function bandPosition(depth, count) {
    var n = Math.max(1, Math.floor(finite(count, 1)));
    var d = finite(depth, 0);
    var near = FRAME_SPACING,
      far = FRAME_SPACING * FRAME_COUNT;
    if (!(d > near)) return 0;
    var u = clamp01(Math.log(d / near) / Math.log(far / near));
    return u * (n - 1);
  }

  /**
   * Each frame's neon level (0..1) from the spectrum (unboosted, low bands first): its band,
   * relative to the frame's loudest and squared, so only the bands near the top light up (the
   * analyzer's bands saturate in loud music), and the boost acts on the loudest band's level:
   * 1 - (1 - peak)^boost. Silence gives all zeros.
   */
  function frameLevels(spectrum, frames, intensity, boost) {
    var out = new Float32Array(frames.length);
    var n = spectrum.length;
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(spectrum[i]));
    if (!(peak > 0)) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = (1 - Math.pow(1 - peak, b)) * Math.min(1.25, intensityOf(intensity));
    for (var k = 0; k < frames.length; k++) {
      var p = bandPosition(frames[k].depth, n);
      var i0 = Math.floor(p),
        f = p - i0;
      var i1 = Math.min(n - 1, i0 + 1);
      var v = clamp01(spectrum[i0]) * (1 - f) + clamp01(spectrum[i1]) * f;
      out[k] = Math.min(1, level * Math.pow(v / peak, LEVEL_SHAPE));
    }
    return out;
  }

  /** A frame's neon brightness: a calm glow in silence, its level, and the beat's flash. */
  function edgeLevel(level, env, intensity) {
    var l = clamp01(level),
      e = clamp01(env);
    return Math.min(2, 0.22 + 0.9 * l + 0.55 * e * Math.min(1.2, intensityOf(intensity)));
  }

  /** The visor: its panel's brightness (core) and its glow's (glow), flaring on the beat. */
  function visorLevel(loud, env, intensity) {
    var l = clamp01(loud),
      e = clamp01(env) * Math.min(1.2, intensityOf(intensity));
    return {
      core: Math.min(1.6, 0.55 + 0.25 * l + 0.5 * e),
      glow: 0.35 + 0.25 * l + 0.9 * e,
    };
  }

  // ---------- the robot ----------

  /** The head's nod on the beat (radians, at most 3°), from the beat envelope (NOD_RELEASE). */
  function headNod(env, intensity) {
    return NOD_MAX * clamp01(env) * Math.min(1, intensityOf(intensity));
  }

  /** Song time held to SWAY_RATE steps a second (the slow moves change only then). */
  function stepped(songTime) {
    return Math.floor(finite(songTime, 0) * SWAY_RATE + 1e-6) / SWAY_RATE;
  }

  /** The head's turn (radians): turned a little aside, slowly turning 8° either way. */
  function headTurn(songTime, mulberry32) {
    var r = mulberry32(SEED + 11);
    var p0 = r() * 2 * Math.PI,
      p1 = r() * 2 * Math.PI;
    var s = stepped(songTime);
    var tau = 2 * Math.PI;
    return (
      TURN_BASE +
      TURN_MAX * (0.65 * Math.sin(tau * 0.017 * s + p0) + 0.35 * Math.sin(tau * 0.0083 * s + p1))
    );
  }

  /** The arms' slight sway, [left, right] radians, each at most SWAY_MAX. */
  function armSway(songTime, mulberry32) {
    var r = mulberry32(SEED + 23);
    var p0 = r() * 2 * Math.PI,
      p1 = r() * 2 * Math.PI;
    var s = stepped(songTime);
    var tau = 2 * Math.PI;
    return [SWAY_MAX * Math.sin(tau * 0.037 * s + p0), SWAY_MAX * Math.sin(tau * 0.043 * s + p1)];
  }

  // ---------- the flares ----------

  /**
   * The strong beats of the last FLARE_LIFE seconds, newest first: [{ age, strength, frame }],
   * frame being the beat's song frame (round(its song time × fps)), the same in a section.
   */
  function hitEvents(audio, t) {
    var out = [];
    var tt = finite(t, 0);
    var recent = audio.recentHits(tt, 24);
    for (var i = 0; i < recent.length; i++) {
      var age = recent[i][0],
        strength = recent[i][1];
      if (age > FLARE_LIFE) break;
      if (!(strength >= FLARE)) continue;
      out.push({
        age: age,
        strength: strength,
        frame: Math.round((tt + audio.songStart - age) * audio.fps),
      });
    }
    return out;
  }

  /**
   * The newest strong beat's flare, or null: { frame, age, side, angle, progress, bright }. It
   * comes in from one side (side -1: the left, 1: the right) as a soft band leaning by `angle`,
   * sweeping across as `progress` runs 0..1 over FLARE_LIFE, fading as it goes. Its side and angle
   * are seeded by the beat's song frame.
   */
  function flare(events, intensity, mulberry32) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var age = e.age;
      if (!(age >= 0) || age >= FLARE_LIFE) continue;
      var r = mulberry32((SEED + 5000 + e.frame) | 0);
      var side = r() < 0.5 ? -1 : 1;
      var angle = (r() * 2 - 1) * FLARE_ANGLE;
      var p = age / FLARE_LIFE;
      var k = 1 - p;
      var strong = clamp01((finite(e.strength, 0) - FLARE) / (1 - FLARE));
      var bright = k * k * (0.7 + 0.3 * strong) * Math.min(1, 0.35 + 0.65 * intensityOf(intensity));
      return {
        frame: e.frame,
        age: age,
        side: side,
        angle: angle,
        progress: p,
        bright: clamp01(bright),
      };
    }
    return null;
  }

  // ---------- the tunnel's details ----------

  /**
   * The details of the gap behind frame `index` (between it and the next one away), seeded by
   * the frame's number: { traces, corners, cable }. traces: circuit-trace neon lines on the walls,
   * [{ face (0..7, the octagon's walls anticlockwise from the right one), w0, w1 (across the wall,
   * tunnel units from its middle), a, b (where the trace jogs from w0 to w1, as fractions of the
   * gap) }]; corners: which of the 8 corner lines are lit along this gap; cable: a cable sagging
   * across the ceiling ({ sag, at: where along the gap }) or null.
   */
  function gapLayout(index, mulberry32) {
    var r = mulberry32((SEED + 7919 * Math.floor(finite(index, 0))) | 0);
    var corners = [];
    for (var c = 0; c < 8; c++) corners.push(r() < 0.45);
    var traces = [];
    var edge = HALF_SIDE - 0.45;
    for (var face = 0; face < 8; face++) {
      var n = r() < 0.5 ? (r() < 0.3 ? 2 : 1) : 0;
      for (var k = 0; k < n; k++) {
        var w0 = (r() * 2 - 1) * edge;
        var jog = (r() < 0.5 ? -1 : 1) * (0.5 + 1.3 * r());
        var w1 = Math.max(-edge, Math.min(edge, w0 + jog));
        var a = 0.12 + 0.4 * r();
        // the jog runs at 45°: as far along the tunnel as across it
        var b = Math.min(0.95, a + Math.abs(w1 - w0) / FRAME_SPACING);
        traces.push({ face: face, w0: w0, w1: w1, a: a, b: b });
      }
    }
    var cable = r() < 0.22 ? { sag: 0.8 + 1.0 * r(), at: 0.2 + 0.6 * r() } : null;
    return { traces: traces, corners: corners, cable: cable };
  }

  // ---------- the HUD ----------

  /**
   * Bar heights in px (0..maxPx) from mirrorBars of the unboosted spectrum: each relative to the
   * frame's loudest, squared, so only the peaks stand tall; the boost acts on the loudest one's
   * level (1 - (1 - peak)^boost). Silence gives none.
   */
  function meterHeights(values, intensity, boost, maxPx) {
    var n = values.length;
    var out = new Float32Array(n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(values[i]));
    if (!(peak > 0)) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = 1 - Math.pow(1 - peak, b);
    var top = finite(maxPx, 24);
    var scale = top * Math.min(1.25, intensityOf(intensity)) * level;
    for (var k = 0; k < n; k++) {
      out[k] = Math.min(top, scale * Math.pow(clamp01(values[k]) / peak, LEVEL_SHAPE));
    }
    return out;
  }

  /** How far the HUD's ticks have crawled (whole px, 0..period-1): a pixel CRAWL_RATE times a second. */
  function hudCrawl(songTime, period) {
    var p = Math.max(1, Math.floor(finite(period, 1)));
    var c = Math.floor(finite(songTime, 0) * CRAWL_RATE + 1e-6);
    c = c - Math.floor(c / p) * p;
    return c >= 0 && c < p ? c : 0;
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
    TUNNEL_BASE: TUNNEL_BASE,
    TUNNEL_LOUD: TUNNEL_LOUD,
    FRAME_SPACING: FRAME_SPACING,
    FRAME_COUNT: FRAME_COUNT,
    APOTHEM: APOTHEM,
    HALF_SIDE: HALF_SIDE,
    NOD_MAX: NOD_MAX,
    NOD_RELEASE: NOD_RELEASE,
    TURN_MAX: TURN_MAX,
    TURN_BASE: TURN_BASE,
    SWAY_MAX: SWAY_MAX,
    SWAY_RATE: SWAY_RATE,
    FLARE: FLARE,
    FLARE_LIFE: FLARE_LIFE,
    EDGE_RELEASE: EDGE_RELEASE,
    CRAWL_RATE: CRAWL_RATE,
    tunnelSpeed: tunnelSpeed,
    loudTable: loudTable,
    loudSeconds: loudSeconds,
    tunnelTravel: tunnelTravel,
    tunnelFrames: tunnelFrames,
    frameFade: frameFade,
    bandPosition: bandPosition,
    frameLevels: frameLevels,
    edgeLevel: edgeLevel,
    visorLevel: visorLevel,
    headNod: headNod,
    headTurn: headTurn,
    armSway: armSway,
    hitEvents: hitEvents,
    flare: flare,
    gapLayout: gapLayout,
    meterHeights: meterHeights,
    hudCrawl: hudCrawl,
    fitTitle: fitTitle,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.TunnelMotion = api;
})();
