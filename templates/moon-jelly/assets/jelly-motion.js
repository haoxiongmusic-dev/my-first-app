/*
 * Moon Jelly's motion: where each jellyfish is and how it swims, how its tentacles trail, how
 * brightly it glows, the ripple's wobble, the light shafts' sway and the title line's fit.
 *
 * Each jellyfish drifts slowly upward on its own seeded path, wrapping softly (fading out near
 * the top of its range and starting again below the frame), and sways a little sideways. On each
 * beat it swims: its bell contracts (narrower, taller) and relaxes over RELAX seconds, and the
 * stroke pushes it up a little, the push sinking back over a few seconds. Its state at a song time
 * is a pure function of that time and the beats of the last LOOKBACK seconds (which fit in a
 * section's pre-roll): the pushes are summed over those beats, never integrated frame by frame,
 * so any frame can be drawn on its own and a section matches the full render at the same song
 * time. Tentacles trail as delayed chains: each link shows the bell as it was a moment ago (its
 * contraction and its position, up to TRAIL seconds back at the tip) plus a sine wave travelling
 * down the chain.
 *
 * Positions are 1080p pixels, y down (the bell's rim centre); chain offsets are in bell radii, y
 * up (the voxel model's own axes). Random numbers come only from the toolkit's seeded mulberry32,
 * passed in. Pure: no DOM, so Vitest tests it directly.
 */
(function () {
  "use strict";

  var SEED = 6113;
  var MIN_JELLIES = 3;
  var MAX_JELLIES = 14;
  var DEFAULT_JELLIES = 9;
  var HORIZON = 486; // the hazy horizon line, px from the top (45 %)
  var LOOKBACK = 5; // seconds of past beats looked at (a section keeps 6 s before its start)
  var HIT_EPS = 1e-4; // a beat this close after "now" counts already (rounding never hides it)
  var MAX_HITS = 40; // recent beats read (beats are at least 0.15 s apart)
  var ATTACK = 0.08; // s: the bell squeezes in this fast …
  var RELAX = 0.6; // … and relaxes over this long
  var SQUEEZE = 0.17; // a full contraction: the bell this much narrower …
  var STRETCH = 0.15; // … and this much taller
  var STROKE = 0.7; // s: a stroke's push rises over this long …
  var SINK_FROM = 1.2; // … holds, then sinks back from here …
  var SINK_TO = 4; // … to nothing here
  var PUSH = 0.06; // bell widths a full-strength stroke lifts it (before the cap)
  var PUSH_MAX = 0.3; // bell widths: never lifted more than this
  var TRAIL = 0.9; // s: a tentacle's tip shows the bell as it was this long ago
  var RIPPLE_RELEASE = 0.45; // s: the ripple's beat envelope
  var WOBBLE_MAX = 3; // px: the ripple's refraction wobble at most
  var SHAFT_MAX = 0.12; // radians: the light shafts sway at most this far
  var LEVEL_SHAPE = 2; // each band relative to the loudest, squared: the peaks stand out
  var LEAN_RATE = 3; // the lean changes this often a second (a turn moves every voxel)

  // The school, in the order they join as the count goes up: two big ones in front (lower left
  // and right, partly cut by the frame), then mid-sized and small far ones. x: the home position
  // (px); y0: the rim's height at song time 0 for the front ones (the others are seeded); width:
  // the bell's width, px; band: which part of the spectrum (0 low .. 1 high) lights it.
  var SLOTS = [
    { tier: "front", x: 250, y0: 880, width: 460, band: 0.04 },
    { tier: "front", x: 1690, y0: 850, width: 440, band: 0.14 },
    { tier: "mid", x: 1010, width: 250, band: 0.3 },
    { tier: "mid", x: 640, width: 210, band: 0.4 },
    { tier: "far", x: 1290, width: 120, band: 0.62 },
    { tier: "mid", x: 1360, width: 230, band: 0.5 },
    { tier: "far", x: 780, width: 100, band: 0.7 },
    { tier: "far", x: 120, width: 90, band: 0.86 },
    { tier: "mid", x: 1830, width: 190, band: 0.56 },
    { tier: "far", x: 1110, width: 130, band: 0.66 },
    { tier: "far", x: 470, width: 110, band: 0.78 },
    { tier: "far", x: 1560, width: 85, band: 0.94 },
    { tier: "far", x: 930, width: 95, band: 0.9 },
    { tier: "far", x: 1760, width: 105, band: 0.82 },
  ];
  // Per tier: drift speed (px/s, seeded between), sideways sway (px) and its period (s), and
  // where the range wraps: the rim fades out from `top + fade` to `top` (the front ones above
  // the frame; the others into the haze round the horizon) and comes back in at `bottom` (below
  // the frame, except the far ones, which loom up out of the dark water near the horizon).
  var TIERS = {
    front: { speed: [0.9, 1.4], sway: [16, 28], period: [26, 40], fade: 280 },
    mid: { speed: [2.2, 3.6], sway: [12, 22], period: [20, 32], top: 300, fade: 200 },
    far: {
      speed: [2.4, 4],
      sway: [6, 14],
      period: [16, 28],
      top: 400,
      fade: 110,
      bottom: 820,
      fadeIn: 130,
    },
  };

  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function intensityOf(i) {
    return Math.max(0, Math.min(2, finite(i, 1)));
  }
  function smooth(x) {
    var u = clamp01(x);
    return u * u * (3 - 2 * u);
  }
  function lerp(a, b, f) {
    return a + (b - a) * f;
  }

  // ---------- the school ----------

  /** The jellyCount setting as a whole number 3..14 (9 when it is not a number). */
  function jellyCount(value) {
    var n = Number(value);
    if (value === null || value === undefined || value === "" || !isFinite(n)) {
      return DEFAULT_JELLIES;
    }
    return Math.max(MIN_JELLIES, Math.min(MAX_JELLIES, Math.round(n)));
  }

  /** A slot's seeded numbers (the same every time): speed, sway, its look's angles. */
  function slotParams(i, mulberry32) {
    var slot = SLOTS[i] || SLOTS[0];
    var tier = TIERS[slot.tier];
    var r = mulberry32((SEED + 101 * (i + 1)) | 0);
    var bottom = tier.bottom || 1080 + slot.width * 0.4 + 30;
    var top = slot.tier === "front" ? -slot.width * 1.05 - 40 : tier.top;
    var p = {
      speed: lerp(tier.speed[0], tier.speed[1], r()),
      swayAmp: lerp(tier.sway[0], tier.sway[1], r()),
      swayPeriod: lerp(tier.period[0], tier.period[1], r()),
      swayPhase: r() * 2 * Math.PI,
      yaw: (r() * 2 - 1) * 0.6,
      pitch: -0.18 - 0.12 * r(),
      lean0: (r() * 2 - 1) * 0.1,
      top: top,
      bottom: bottom,
      fade: tier.fade,
      fadeIn: tier.fadeIn || 40,
      y0: slot.y0 !== undefined ? slot.y0 : lerp(top + tier.fade, bottom, r()),
    };
    return p;
  }

  // ---------- beats ----------

  /**
   * The beats of the last LOOKBACK seconds, newest first: { frame, age, strength }. frame is the
   * beat's song frame (the same in a section as in the full song), age its seconds before t.
   */
  function beatsAt(audio, t) {
    var out = [];
    if (!(typeof t === "number" && isFinite(t))) return out;
    var songNow = (audio.songStart || 0) + t;
    var hits = audio.recentHits(t + HIT_EPS, MAX_HITS);
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0] - HIT_EPS;
      if (age > LOOKBACK) break;
      out.push({
        frame: Math.round((songNow - age) * audio.fps),
        age: age > 0 ? age : 0,
        strength: clamp01(hits[i][1]),
      });
    }
    return out;
  }

  // ---------- the swim ----------

  /** A beat's squeeze at this age (s): in over ATTACK, out over RELAX; 0 before and after. */
  function squeezeAt(age) {
    if (!(age >= 0)) return 0;
    if (age < ATTACK) return smooth(age / ATTACK);
    var u = (age - ATTACK) / RELAX;
    if (u >= 1) return 0;
    return (1 - u) * (1 - u);
  }

  /** A beat's push at this age (s): rising over STROKE, sinking back from SINK_FROM to SINK_TO. */
  function pushAt(age) {
    if (!(age > 0) || age >= SINK_TO) return 0;
    var up = smooth(age / STROKE);
    var down = 1 - smooth((age - SINK_FROM) / (SINK_TO - SINK_FROM));
    return up * down;
  }

  /** The bell's contraction (0..1) `delay` seconds ago, from the beats' squeezes. */
  function contraction(beats, delay, intensity) {
    var d = Math.max(0, finite(delay, 0));
    var sum = 0;
    for (var i = 0; i < beats.length; i++) {
      sum += clamp01(beats[i].strength) * squeezeAt(finite(beats[i].age, -1) - d);
    }
    return clamp01(sum) * Math.min(1, intensityOf(intensity));
  }

  /** The bell's shape for a contraction: { w (width), h (height) } scales, 1 at rest. */
  function bellScale(c) {
    var k = clamp01(c);
    return { w: 1 - SQUEEZE * k, h: 1 + STRETCH * k };
  }

  /**
   * How far the strokes have lifted the jellyfish `delay` seconds ago, in bell widths: each
   * beat's push summed, softly capped at PUSH_MAX so a run of beats never sends it flying.
   */
  function lift(beats, delay, intensity) {
    var d = Math.max(0, finite(delay, 0));
    var sum = 0;
    for (var i = 0; i < beats.length; i++) {
      sum += clamp01(beats[i].strength) * pushAt(finite(beats[i].age, -1) - d);
    }
    if (!(sum > 0)) return 0;
    var raw = sum * PUSH * Math.min(1.5, intensityOf(intensity));
    return PUSH_MAX * (1 - Math.exp(-raw / PUSH_MAX));
  }

  /** The drifting rim's height (px, y down) before the strokes' lift, and its wrap fade. */
  function drift(p, songTime) {
    var range = p.bottom - p.top;
    var s = p.bottom - p.y0 + p.speed * songTime;
    var m = s - Math.floor(s / range) * range;
    var y = p.bottom - m;
    var fade = smooth((y - p.top) / p.fade) * (1 - smooth((y - (p.bottom - p.fadeIn)) / p.fadeIn));
    return { y: y, fade: fade };
  }

  /** Sideways sway (px about the home x) and its speed (px/s). */
  function sway(p, songTime) {
    var w = (2 * Math.PI) / p.swayPeriod;
    return {
      x: p.swayAmp * Math.sin(w * songTime + p.swayPhase),
      v: p.swayAmp * w * Math.cos(w * songTime + p.swayPhase),
    };
  }

  /**
   * Jellyfish `slot` at a song time (as it was `delay` seconds before, for the tentacles):
   * { x, y (the rim's centre, px), width (px), contraction, w, h (bell scales), lift (bell widths),
   *   lean (radians), yaw, pitch (its look's fixed angles), fade (0..1) }.
   */
  function jellyAt(slot, songTime, beats, intensity, mulberry32, delay) {
    var i = Math.max(0, Math.min(SLOTS.length - 1, Math.floor(finite(slot, 0))));
    var p = slotParams(i, mulberry32);
    var d = Math.max(0, finite(delay, 0));
    var s = finite(songTime, 0) - d;
    var list = beats || [];
    var c = contraction(list, d, intensity);
    var scale = bellScale(c);
    var up = lift(list, d, intensity);
    var dr = drift(p, s);
    var sw = sway(p, s);
    var width = SLOTS[i].width;
    var held = sway(p, Math.floor(s * LEAN_RATE + 1e-6) / LEAN_RATE);
    var lean = p.lean0 + Math.max(-0.12, Math.min(0.12, held.v * 0.02));
    return {
      x: SLOTS[i].x + sw.x,
      y: dr.y - up * width,
      width: width,
      contraction: c,
      w: scale.w,
      h: scale.h,
      lift: up,
      lean: lean,
      yaw: p.yaw,
      pitch: p.pitch,
      fade: dr.fade,
    };
  }

  /**
   * The bell as it was over the last TRAIL seconds, for the tentacles: `samples` delays from 0 to
   * TRAIL, and at each the bell's offset from now (dx, dy px, y down) and width scale (w).
   */
  function trail(slot, songTime, beats, intensity, mulberry32, samples) {
    var n = Math.max(2, Math.floor(finite(samples, 2)));
    var now = jellyAt(slot, songTime, beats, intensity, mulberry32, 0);
    var out = { delays: [], dx: [], dy: [], w: [] };
    for (var k = 0; k < n; k++) {
      var d = (TRAIL * k) / (n - 1);
      var then = k === 0 ? now : jellyAt(slot, songTime, beats, intensity, mulberry32, d);
      out.delays.push(d);
      out.dx.push(then.x - now.x);
      out.dy.push(then.y - now.y);
      out.w.push(then.w);
    }
    return out;
  }

  /** A trail's values at delay d (linear between its samples). */
  function trailAt(tr, d) {
    var n = tr.delays.length;
    var x = (d / TRAIL) * (n - 1);
    if (!(x > 0)) return { dx: tr.dx[0], dy: tr.dy[0], w: tr.w[0] };
    if (x >= n - 1) return { dx: tr.dx[n - 1], dy: tr.dy[n - 1], w: tr.w[n - 1] };
    var i = Math.floor(x),
      f = x - i;
    return {
      dx: lerp(tr.dx[i], tr.dx[i + 1], f),
      dy: lerp(tr.dy[i], tr.dy[i + 1], f),
      w: lerp(tr.w[i], tr.w[i + 1], f),
    };
  }

  /**
   * A chain's pose: for each of its `links` links, its offset from the rest pose [x, y, z, …] in
   * bell radii (y up). Link k shows the bell as it was a moment ago (the further down, the longer
   * ago, up to TRAIL at the tip): the rim's contraction pulls its anchor in (anchorX, anchorZ: the
   * anchor's rest position in bell radii) and the bell's movement since then leaves it behind.
   * On top, a sine wave travels down the chain (sway: { amp (bell radii at the tip), freq (Hz),
   * phase, wave (radians along the chain) }), livelier with the music's energy (0..1).
   */
  function chainPose(tr, radiusPx, anchorX, anchorZ, links, swayIn, songTime, energy) {
    var n = Math.max(1, Math.floor(finite(links, 1)));
    var out = new Float32Array(n * 3);
    var rpx = Math.max(1, finite(radiusPx, 1));
    var ax = finite(anchorX, 0),
      az = finite(anchorZ, 0);
    var s = finite(songTime, 0);
    var amp = Math.max(0, finite(swayIn.amp, 0)) * (0.75 + 0.5 * clamp01(energy));
    var w = 2 * Math.PI * finite(swayIn.freq, 0.2);
    var ph = finite(swayIn.phase, 0);
    var wave = finite(swayIn.wave, 3);
    for (var k = 0; k < n; k++) {
      var u = n > 1 ? k / (n - 1) : 0;
      var lag = trailAt(tr, TRAIL * Math.pow(u, 0.8));
      var reach = u * Math.sqrt(u); // the sway grows toward the tip
      var a = w * s - wave * u + ph;
      out[k * 3] = ax * (lag.w - 1) + lag.dx / rpx + amp * reach * Math.sin(a);
      out[k * 3 + 1] = -lag.dy / rpx;
      out[k * 3 + 2] = az * (lag.w - 1) + amp * 0.6 * reach * Math.cos(a * 0.9 + 0.7);
    }
    return out;
  }

  // ---------- glow, ripple and light ----------

  /**
   * Each slot's band level (0..1) from the spectrum (unboosted, low bands first): its own part of
   * the spectrum relative to the frame's loudest band, squared (the analyzer's bands saturate in
   * loud music), the boost acting on the loudest band's level: 1 - (1 - peak)^boost.
   */
  function bandLevels(spectrum, intensity, boost) {
    var out = new Float32Array(SLOTS.length);
    var n = spectrum.length;
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(spectrum[i]));
    if (!(peak > 0) || n < 1) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = (1 - Math.pow(1 - peak, b)) * Math.min(1.25, intensityOf(intensity));
    for (var k = 0; k < SLOTS.length; k++) {
      var x = SLOTS[k].band * (n - 1);
      var i0 = Math.floor(x),
        f = x - i0;
      var i1 = Math.min(n - 1, i0 + 1);
      var v = clamp01(spectrum[i0]) * (1 - f) + clamp01(spectrum[i1]) * f;
      out[k] = Math.min(1, level * Math.pow(v / peak, LEVEL_SHAPE));
    }
    return out;
  }

  /** A jellyfish's glow (about 0.4 in silence, up to 2): the loudness, its band and its swim. */
  function glowLevel(loud, level, contr, intensity) {
    var k = intensityOf(intensity);
    var g =
      0.42 +
      Math.min(1.2, k) * (0.5 * clamp01(loud) + 0.45 * clamp01(level)) +
      0.3 * clamp01(contr) * Math.min(1, k);
    return Math.min(2, g);
  }

  /** The ripple's refraction wobble (px) from its beat envelope; none when the ripple is off. */
  function wobblePx(env, on, intensity) {
    if (!on) return 0;
    return Math.min(WOBBLE_MAX, 2.2 * clamp01(env) * Math.min(1.35, intensityOf(intensity)));
  }

  /** The light shafts' slow sway (radians), from the song time. */
  function shaftSway(songTime) {
    var s = finite(songTime, 0);
    var tau = 2 * Math.PI;
    return (
      SHAFT_MAX * (0.6 * Math.sin((tau * s) / 47 + 0.4) + 0.4 * Math.sin((tau * s) / 29 + 2.1))
    );
  }

  // ---------- the title ----------

  /** "artist · title" (either alone when the other is empty). */
  function titleLine(artist, title) {
    var a = String(artist || "").trim();
    var t = String(title || "").trim();
    return a && t ? a + " · " + t : a || t;
  }

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
   * The line's size (px) and lines: as big as `start`, shrinking (down to `floor`) until it fits
   * maxLines lines of maxWidth, wrapping between words. At the smallest size a word too long for
   * a line breaks between letters. measure(text) is the text's width at 1 px.
   */
  function fitTitle(text, measure, maxWidth, maxLines, start, floor) {
    var words = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return { size: start, lines: [] };
    for (var size = start; size >= floor; size -= 1) {
      var lines = wrapWords(words, measure, size, maxWidth, false);
      if (lines && lines.length <= maxLines) return { size: size, lines: lines };
    }
    return { size: floor, lines: wrapWords(words, measure, floor, maxWidth, true) };
  }

  /**
   * The text under the horizon: "artist · title" on one line if it fits at `floor` px or more
   * (as big as `start`); otherwise the artist over the title, each on its own line (shrunk
   * together), and only then wrapping. measure(text) is the text's width at 1 px.
   */
  function titleLines(artist, title, measure, maxWidth, start, floor) {
    var a = String(artist || "").trim();
    var t = String(title || "").trim();
    var one = titleLine(a, t);
    if (!one) return { size: start, lines: [] };
    for (var size = start; size >= floor; size -= 1) {
      if (measure(one) * size <= maxWidth) return { size: size, lines: [one] };
    }
    if (!(a && t)) return fitTitle(one, measure, maxWidth, 2, start, floor);
    var wide = Math.max(measure(a), measure(t));
    if (wide * floor <= maxWidth) {
      var fit = Math.min(start, Math.floor(maxWidth / Math.max(wide, 1e-6)));
      return { size: Math.max(floor, fit), lines: [a, t] };
    }
    return fitTitle(one, measure, maxWidth, 3, floor, floor);
  }

  var api = {
    SEED: SEED,
    MIN_JELLIES: MIN_JELLIES,
    MAX_JELLIES: MAX_JELLIES,
    DEFAULT_JELLIES: DEFAULT_JELLIES,
    HORIZON: HORIZON,
    LOOKBACK: LOOKBACK,
    MAX_HITS: MAX_HITS,
    ATTACK: ATTACK,
    RELAX: RELAX,
    PUSH_MAX: PUSH_MAX,
    SINK_TO: SINK_TO,
    TRAIL: TRAIL,
    RIPPLE_RELEASE: RIPPLE_RELEASE,
    WOBBLE_MAX: WOBBLE_MAX,
    SHAFT_MAX: SHAFT_MAX,
    LEAN_RATE: LEAN_RATE,
    SLOTS: SLOTS,
    jellyCount: jellyCount,
    slotParams: slotParams,
    beatsAt: beatsAt,
    contraction: contraction,
    bellScale: bellScale,
    lift: lift,
    jellyAt: jellyAt,
    trail: trail,
    chainPose: chainPose,
    bandLevels: bandLevels,
    glowLevel: glowLevel,
    wobblePx: wobblePx,
    shaftSway: shaftSway,
    titleLine: titleLine,
    fitTitle: fitTitle,
    titleLines: titleLines,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.JellyMotion = api;
})();
