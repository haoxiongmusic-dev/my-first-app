/*
 * Live Wire's motion: the speaker cone's pump, the four cables' paths, the electric arcs crawling
 * along them and crackling round the rim, the spectrum's sparks, the bright arc and the debris on
 * strong hits, the faint shake, the wall's light and the title's fit. Everything is worked out
 * from the song time and the audio alone, so any frame can be drawn on its own and every render
 * is identical. Random numbers come only from the toolkit's seeded mulberry32 (and its
 * lightningPath), passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * The arcs are re-seeded 12 times a second from the song time (mulberry32(seed + tick), tick =
 * floor(song time × 12)), and read the music at their tick's moment, so the whole electric layer
 * changes 12 times a second (between ticks the frames match, which keeps the video small) and a
 * section draws exactly the arcs the full render draws at the same song time. A strong hit's
 * effects are seeded by its song frame (round(its song time × fps)).
 *
 * Sizes are 1080p pixels (y down) unless they say voxels; angles are radians, screen-wise
 * (x = cos a, y = sin a, so they turn clockwise on screen).
 */
(function () {
  "use strict";

  var SEED = 5309;
  var TICK_RATE = 12; // the arcs' re-seeds a second
  var CENTRE = { x: 960, y: 540 };
  var VOXEL_PX = 8; // one voxel, in pixels, at the speaker's face
  // the plugs where the cables leave the rim (speaker-voxels.js): degrees anticlockwise, y up
  var PLUG_ANGLES = [25, 155, 205, 335];
  var PLUG_REACH = 23.5; // voxels from the centre to the plugs' tips
  var R_OUT = 20.5; // voxels: the speaker's edge
  var RIM_PX = R_OUT * VOXEL_PX;
  var CONE_PUMP = 0.08; // the cone grows 1 + 0.08 × bass × intensity …
  var CONE_KICK = 0.06; // … plus this much on a full beat
  var CONE_MAX = 1.18;
  var CONE_PUSH = 1.2; // voxels the cone comes forward at its biggest
  var TILT_X = -0.14; // the speaker leans back this far (radians) �
  var TILT_SWAY_X = 0.025; // � swaying this much up and down �
  var TILT_SWAY_Y = 0.07; // � and this much from side to side
  var LOW_BANDS = 6; // the analyzer's lowest bands: the bass
  var MAX_ARCS = 3; // arcs on one cable at once
  var PIECE_PX = 36; // a bolt along a cable is jagged between points this far apart on it
  var STRONG = 0.75; // a hit at least this strong jumps an arc to the rim and throws debris
  var HIT_ARC_LIFE = 0.3; // s
  var HIT_RELEASE = 0.12; // s: the strike's brightness and the shake fade with this
  var DEBRIS_MAX = 40;
  var DEBRIS_LIFE = 0.8; // s
  var SHAKE_MAX = 6; // px
  var SHAKE_SCALE = 4; // px at a full hit and intensity 1, before the cap
  var SHAKE_RATE = 30; // the shake picks a new direction this often per second of song
  var SPARK_SHAPE = 2; // each band relative to the loudest, squared: the peaks stand out

  // the upper-right cable (cable 0) as a cubic Bézier, 1080p pixels; the others are mirrored
  var EXIT = (PLUG_ANGLES[0] * Math.PI) / 180;
  var P0 = [
    CENTRE.x + Math.cos(EXIT) * PLUG_REACH * VOXEL_PX,
    CENTRE.y - Math.sin(EXIT) * PLUG_REACH * VOXEL_PX,
  ];
  var P1 = [P0[0] + Math.cos(EXIT) * 250, P0[1] - Math.sin(EXIT) * 250];
  var P3 = [1990, -50];
  var P2 = [P3[0] - 420, P3[1] + 70];

  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function intensityOf(i) {
    return Math.max(0, Math.min(2, finite(i, 1)));
  }
  function frac(x) {
    return x - Math.floor(x);
  }

  // ---------- the clock of the arcs ----------

  /** The arcs' tick for a song time: floor(song time × 12). */
  function tickOf(songTime) {
    return Math.max(0, Math.floor(finite(songTime, 0) * TICK_RATE + 1e-6));
  }
  /** The song time a tick starts at. */
  function tickTime(tick) {
    return tick / TICK_RATE;
  }

  // ---------- the cone ----------

  /** The bass (the analyzer's lowest bands), shaped: middling bass moves the cone little. */
  function bassLevel(bands) {
    var n = Math.min(LOW_BANDS, bands ? bands.length : 0);
    if (!n) return 0;
    var sum = 0;
    for (var i = 0; i < n; i++) sum += clamp01(bands[i]);
    var x = clamp01((sum / n - 0.25) / 0.7);
    return x * x;
  }

  /** The cone's scale: 1 + 0.08 × bass × intensity, plus a kick on the beat, at most CONE_MAX. */
  function coneScale(bass, env, intensity) {
    var i = intensityOf(intensity);
    var s = 1 + CONE_PUMP * clamp01(bass) * i + CONE_KICK * clamp01(env) * Math.min(1.5, i);
    return Math.min(CONE_MAX, s);
  }

  /** How far (voxels) the cone comes forward at that scale (it stays under the rim). */
  function conePush(scale) {
    return CONE_PUSH * clamp01((finite(scale, 1) - 1) / (CONE_MAX - 1));
  }

  /**
   * The speaker's turn, [x, y] radians: seen a little from above (so its voxels' lit top faces
   * show), swaying slowly and gently from side to side with the song time.
   */
  function speakerTilt(songTime, mulberry32) {
    var r = mulberry32(SEED + 41);
    var p0 = r() * 2 * Math.PI,
      p1 = r() * 2 * Math.PI;
    var s = finite(songTime, 0);
    var tau = 2 * Math.PI;
    return [
      TILT_X + TILT_SWAY_X * Math.sin(tau * 0.037 * s + p0),
      TILT_SWAY_Y * Math.sin(tau * 0.029 * s + p1),
    ];
  }

  // ---------- the cables ----------

  /** Cable c's path (0 upper right, 1 upper left, 2 lower left, 3 lower right): `count` points. */
  function cablePath(cable, count) {
    var n = Math.max(2, Math.floor(finite(count, 2)));
    var mx = cable === 1 || cable === 2,
      my = cable === 2 || cable === 3;
    var pts = new Array(n);
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1),
        v = 1 - u;
      var a = v * v * v,
        b = 3 * v * v * u,
        c = 3 * v * u * u,
        d = u * u * u;
      var x = a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0];
      var y = a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1];
      pts[i] = [mx ? 1920 - x : x, my ? 1080 - y : y];
    }
    return pts;
  }

  /** Running lengths along a polyline: out[i] = length up to point i. */
  function lengths(points) {
    var out = new Float64Array(points.length);
    for (var i = 1; i < points.length; i++) {
      out[i] =
        out[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    return out;
  }
  /** The point a share s (0..1) of the way along a polyline. */
  function pointAt(points, cum, s) {
    var n = points.length;
    var total = cum[n - 1];
    var want = clamp01(s) * total;
    var i = 1;
    while (i < n - 1 && cum[i] < want) i++;
    var seg = cum[i] - cum[i - 1];
    var f = seg > 0 ? (want - cum[i - 1]) / seg : 0;
    f = Math.max(0, Math.min(1, f));
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
    ];
  }

  /**
   * A bolt crawling along a polyline from share s0 to s1 of its length: lightning between points
   * on it PIECE_PX apart, so it hugs the cable and jags over it.
   */
  function boltAlong(points, s0, s1, seed, lightningPath) {
    var cum = lengths(points);
    var total = cum[cum.length - 1];
    var a = clamp01(s0),
      b = clamp01(s1);
    if (!(b > a) || !(total > 0)) return [pointAt(points, cum, a)];
    var n = Math.max(1, Math.round(((b - a) * total) / PIECE_PX));
    var out = [];
    var prev = pointAt(points, cum, a);
    for (var k = 1; k <= n; k++) {
      var next = pointAt(points, cum, a + ((b - a) * k) / n);
      var piece = lightningPath(prev[0], prev[1], next[0], next[1], (seed | 0) + 31 * k, 2, 0.3);
      for (var j = k === 1 ? 0 : 1; j < piece.length; j++) out.push(piece[j]);
      prev = next;
    }
    return out;
  }

  // ---------- the arcs ----------

  /** How lively the arcs are (0..1, in 256 steps): the loudness, shaped. */
  function arcLevel(loud, intensity) {
    var x = clamp01((finite(loud, 0) - 0.12) / 0.72);
    var v = clamp01(Math.pow(x, 1.2) * Math.min(1.25, intensityOf(intensity)));
    return Math.round(v * 256) / 256;
  }

  /**
   * The arcs on cable c at this tick: [{ s0, s1, mid, seed, bright }], shares of the cable from the
   * speaker (0) to the corner (1). Each of MAX_ARCS slots crawls toward the speaker at its own
   * speed; the louder, the more of them show and the brighter; their length, flicker and jag are
   * new every tick.
   */
  function cableArcs(cable, tick, level, mulberry32) {
    var lv = clamp01(level);
    if (!(lv > 0)) return [];
    var slots = mulberry32(SEED + 1000 * (cable + 1));
    var r = mulberry32(SEED + 7919 * (cable + 1) + tick);
    var count = Math.min(MAX_ARCS, Math.floor(lv * MAX_ARCS + 0.35 + 0.3 * r()));
    var out = [];
    var time = tickTime(tick);
    for (var k = 0; k < MAX_ARCS; k++) {
      var phase = slots(),
        speed = 0.12 + 0.12 * slots();
      if (k >= count) continue;
      var mid = frac(phase - speed * time);
      var half = 0.05 + 0.07 * r();
      var s0 = Math.max(0, mid - half),
        s1 = Math.min(1, mid + half);
      var flicker = 0.65 + 0.35 * r();
      if (s1 - s0 < 0.02) continue;
      out.push({
        s0: s0,
        s1: s1,
        mid: mid,
        seed: (SEED + tick * 131 + cable * 17 + k * 7) | 0,
        bright: Math.min(1, (0.35 + 0.65 * lv) * flicker),
      });
    }
    return out;
  }

  /** Arcs crackling round the rim at this tick: [{ a0, a1, seed, bright }], up to 4. */
  function ringArcs(tick, level, mulberry32) {
    var lv = clamp01(level);
    if (!(lv > 0)) return [];
    var r = mulberry32(SEED + 50000 + tick);
    var count = Math.min(4, Math.floor(lv * 4 + 0.3 + 0.4 * r()));
    var out = [];
    for (var k = 0; k < count; k++) {
      var a0 = r() * 2 * Math.PI;
      var span = 0.5 + 0.9 * r();
      out.push({
        a0: a0,
        a1: a0 + span,
        seed: (SEED + 50000 + tick * 37 + k * 11) | 0,
        bright: Math.min(1, (0.4 + 0.6 * lv) * (0.6 + 0.4 * r())),
      });
    }
    return out;
  }

  /**
   * The sparks' lengths round the rim (px, 0..maxLen) from ring values of the unboosted spectrum:
   * each relative to the frame's loudest, squared, so only the peaks reach out; the boost acts on
   * the loudest band's level (1 - (1 - peak)^boost). Silence gives none.
   */
  function sparkLengths(values, intensity, boost, maxLen) {
    var n = values.length;
    var out = new Float32Array(n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(values[i]));
    if (!(peak > 0)) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = 1 - Math.pow(1 - peak, b);
    var scale = maxLen * Math.min(1.25, intensityOf(intensity)) * level;
    for (var k = 0; k < n; k++) {
      out[k] = Math.min(maxLen, scale * Math.pow(clamp01(values[k]) / peak, SPARK_SHAPE));
    }
    return out;
  }

  // ---------- strong hits: the strike, the debris, the shake ----------

  /**
   * The strong hits of the last DEBRIS_LIFE seconds, newest first: [{ age, strength, frame }],
   * frame being the hit's song frame (round(its song time × fps)), the same in a section.
   */
  function hitEvents(audio, t) {
    var out = [];
    var tt = finite(t, 0);
    var recent = audio.recentHits(tt, 24);
    for (var i = 0; i < recent.length; i++) {
      var age = recent[i][0],
        strength = recent[i][1];
      if (age > DEBRIS_LIFE) break;
      if (!(strength >= STRONG)) continue;
      out.push({
        age: age,
        strength: strength,
        frame: Math.round((tt + audio.songStart - age) * audio.fps),
      });
    }
    return out;
  }

  function strengthOf(e) {
    return clamp01((e.strength - STRONG) / (1 - STRONG));
  }

  /**
   * The bright arc of the newest strong hit, for HIT_ARC_LIFE seconds: from a point s along cable
   * `cable` across to the rim, turned toward the middle line by `turn` (strikeEnds; all seeded by
   * the hit), re-jagged every tick, fading fast. Or null.
   */
  function hitArc(events, tick, mulberry32) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!(e.age >= 0) || e.age >= HIT_ARC_LIFE) continue;
      var r = mulberry32(SEED + 70000 + e.frame);
      return {
        cable: Math.min(3, Math.floor(r() * 4)),
        s: 0.28 + 0.32 * r(),
        turn: 0.3 + 0.35 * r(),
        seed: (SEED + e.frame * 13 + tick) | 0,
        bright: Math.exp(-e.age / HIT_RELEASE) * (0.6 + 0.4 * strengthOf(e)),
      };
    }
    return null;
  }

  /**
   * Where a strike runs: from its point on the cable (cable points, as cablePath gives them)
   * across open wall to the rim, turned toward the frame's middle line above or below (so the
   * bolt leaps across the wall instead of running along the cable). { from: [x, y], to: [x, y] }.
   */
  function strikeEnds(points, strike) {
    var from = pointAt(points, lengths(points), strike.s);
    var dx = from[0] - CENTRE.x,
      dy = from[1] - CENTRE.y;
    var a = Math.atan2(dy, dx);
    var toward = dy < 0 ? -Math.PI / 2 : Math.PI / 2;
    var gap = Math.atan2(Math.sin(toward - a), Math.cos(toward - a));
    var at = a + gap * clamp01(strike.turn);
    var r = RIM_PX - 2;
    return { from: from, to: [CENTRE.x + Math.cos(at) * r, CENTRE.y + Math.sin(at) * r] };
  }

  /**
   * Concrete debris thrown out by the strong hits: [{ x, y, dx, dy, len, size, alpha, kind, spin }]
   * (kind "streak": a bright streak len px long along dx, dy; "chip": a small cube size px across
   * turned by spin), at most DEBRIS_MAX, each seeded by its hit's song frame, flying outward from
   * the rim, slowing, and fading out over DEBRIS_LIFE seconds.
   */
  function debris(events, intensity, on, mulberry32) {
    var out = [];
    if (!on) return out;
    var i = intensityOf(intensity);
    for (var h = 0; h < events.length && out.length < DEBRIS_MAX; h++) {
      var e = events[h];
      var age = e.age;
      if (!(age >= 0) || age >= DEBRIS_LIFE) continue;
      var r = mulberry32(SEED + 90000 + e.frame);
      var n = Math.round((6 + 10 * strengthOf(e)) * Math.max(0.5, Math.min(1.5, i)));
      var life = age / DEBRIS_LIFE;
      var alpha = Math.pow(1 - life, 1.4);
      for (var j = 0; j < n && out.length < DEBRIS_MAX; j++) {
        var angle = r() * 2 * Math.PI;
        var speed = 420 + 520 * r();
        var streak = r() < 0.62;
        var size = 5 + 6 * r();
        var len = 24 + 40 * r();
        var spin0 = r() * 2 * Math.PI,
          spinRate = (r() - 0.5) * 24;
        var dx = Math.cos(angle),
          dy = Math.sin(angle);
        var dist = RIM_PX - 6 + speed * age * (1 - 0.45 * life);
        out.push({
          x: CENTRE.x + dx * dist,
          y: CENTRE.y + dy * dist,
          dx: dx,
          dy: dy,
          len: len * (0.45 + 0.55 * alpha),
          size: size,
          alpha: alpha,
          kind: streak ? "streak" : "chip",
          spin: spin0 + spinRate * age,
        });
      }
    }
    return out;
  }

  /** 0..1: the newest strong hits' kick, fading fast (the strike's light and the shake). */
  function hitEnvelope(events) {
    var env = 0;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!(e.age >= 0)) continue;
      env = Math.max(env, clamp01(e.strength) * Math.exp(-e.age / HIT_RELEASE));
    }
    return clamp01(env);
  }

  /**
   * How far the view is shaken on a strong hit, [dx, dy] whole px (at most SHAKE_MAX). The
   * direction is seeded by the song frame, so a section shakes exactly like the full render.
   */
  function shakeOffset(env, intensity, songTime, on, mulberry32) {
    var e = clamp01(env);
    if (!on || !(e > 0)) return [0, 0];
    var len = Math.min(SHAKE_MAX, SHAKE_SCALE * e * intensityOf(intensity));
    if (!(len > 0)) return [0, 0];
    var frame = Math.floor(finite(songTime, 0) * SHAKE_RATE + 1e-6);
    var angle = 2 * Math.PI * mulberry32((SEED + 101 + frame) | 0)();
    // whole pixels: a shifted frame then matches the last one exactly, which keeps the video
    // small and quick to encode (toward zero, so the shake never passes SHAKE_MAX)
    var dx = Math.trunc(Math.cos(angle) * len),
      dy = Math.trunc(Math.sin(angle) * len);
    return [dx === 0 ? 0 : dx, dy === 0 ? 0 : dy];
  }

  /** The wall's light from the middle (1 = at rest) and the rim's coloured glow (0..~1.5). */
  function wallLight(level, env) {
    var l = clamp01(level),
      e = clamp01(env);
    return { light: 0.78 + 0.34 * l + 0.14 * e, glow: 0.22 + 0.78 * l + 0.4 * e };
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
    TICK_RATE: TICK_RATE,
    CENTRE: CENTRE,
    VOXEL_PX: VOXEL_PX,
    RIM_PX: RIM_PX,
    CONE_PUMP: CONE_PUMP,
    CONE_MAX: CONE_MAX,
    STRONG: STRONG,
    DEBRIS_MAX: DEBRIS_MAX,
    DEBRIS_LIFE: DEBRIS_LIFE,
    SHAKE_MAX: SHAKE_MAX,
    HIT_ARC_LIFE: HIT_ARC_LIFE,
    MAX_ARCS: MAX_ARCS,
    tickOf: tickOf,
    tickTime: tickTime,
    bassLevel: bassLevel,
    coneScale: coneScale,
    conePush: conePush,
    speakerTilt: speakerTilt,
    TILT_X: TILT_X,
    arcLevel: arcLevel,
    cablePath: cablePath,
    lengths: lengths,
    pointAt: pointAt,
    boltAlong: boltAlong,
    cableArcs: cableArcs,
    ringArcs: ringArcs,
    sparkLengths: sparkLengths,
    hitEvents: hitEvents,
    hitArc: hitArc,
    strikeEnds: strikeEnds,
    debris: debris,
    hitEnvelope: hitEnvelope,
    shakeOffset: shakeOffset,
    wallLight: wallLight,
    fitTitle: fitTitle,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.WireMotion = api;
})();
