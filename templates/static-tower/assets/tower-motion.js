/*
 * Static Tower's motion: the TV screens' brightness (react "centre": the top TV is the bright
 * main one and the others dim, flickering with the beat; "all": every screen pulses together),
 * the static the screens flash to on strong hits, the lightning strike and the flash it brings to
 * the sky, the stack's rim and the puddles, the sky's light from the loudness, the horizon and
 * ground spectrum lines, the clouds' drift, the stack's slow sway and the title's fit.
 * Everything is worked out from the song time and the audio alone, so any frame can be drawn on
 * its own and every render is identical. Random numbers come only from the toolkit's seeded
 * mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * A strong hit's effects (its bolt, which screens go to static) are seeded by its song frame
 * (round(its song time × fps)), and the screens' flicker pattern by the newest beat's song frame,
 * so a section draws exactly what the full render draws at the same song time.
 */
(function () {
  "use strict";

  var SEED = 7741;
  var STRIKE = 0.8; // a hit at least this strong brings lightning (and static)
  var STRIKE_LIFE = 0.35; // s: the bolt shows this long
  var FLASH_RELEASE = 0.4; // s: the sky's, the rim's and the puddles' flash fades over this
  var STATIC_LIFE = 0.15; // s: the screens' static
  var STATIC_SHARE = 0.55; // of the screens go to static on a strong hit
  var SIDE_CHANCE = 0.35; // a second bolt off to the side
  var SPEC_MAX = 60; // px: the horizon and ground lines' tallest
  var SPEC_SHAPE = 2; // each value relative to the loudest, squared: the peaks stand out
  var CLOUD_SPEED = 7; // px a second: the clouds' drift (slow: big files otherwise)
  var CLOUD_PERIOD = 2048; // px: the cloud picture repeats sideways after this
  var LEAN = 0.1; // radians: the stack tips toward the camera (its tops catch the light) …
  var TURN = -0.2; // … and it turns a little, showing its right sides …
  var SWAY_X = 0.012; // … swaying this much …
  var SWAY_Y = 0.04; // … and this much, slowly …
  var SWAY_RATE = 2; // … moving twice a second
  var LOUD_WINDOW = 0.5; // s: the sky's light follows the loudness averaged over this

  function finite(x, fallback) {
    return typeof x === "number" && isFinite(x) ? x : fallback;
  }
  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function intensityOf(i) {
    return Math.max(0, Math.min(2, finite(i, 1)));
  }

  // ---------- the hits ----------

  /**
   * The strong hits of the last FLASH_RELEASE seconds, newest first: [{ age, strength, frame }],
   * frame being the hit's song frame (round(its song time × fps)), the same in a section.
   */
  function hitEvents(audio, t) {
    var out = [];
    var tt = finite(t, 0);
    var recent = audio.recentHits(tt, 24);
    for (var i = 0; i < recent.length; i++) {
      var age = recent[i][0],
        strength = recent[i][1];
      if (age > FLASH_RELEASE) break;
      if (!(strength >= STRIKE)) continue;
      out.push({
        age: age,
        strength: strength,
        frame: Math.round((tt + audio.songStart - age) * audio.fps),
      });
    }
    return out;
  }

  /** The newest hit of any strength, { age, strength, frame }, or null (the screens' beat). */
  function lastHit(audio, t) {
    var tt = finite(t, 0);
    var recent = audio.recentHits(tt, 1);
    if (!recent.length) return null;
    return {
      age: recent[0][0],
      strength: recent[0][1],
      frame: Math.round((tt + audio.songStart - recent[0][0]) * audio.fps),
    };
  }

  function strengthOf(e) {
    return clamp01((finite(e.strength, 0) - STRIKE) / (1 - STRIKE));
  }

  /**
   * The lightning of the newest strong hit, for STRIKE_LIFE seconds, or null:
   * { frame, age, seed, from, forks, bright, side }. The bolt keeps its shape all its life (seed,
   * from: where in the clouds it starts, px sideways from the top TV; forks), flashing on and
   * fading with a second, weaker stroke a moment later (bright, 0..1). side: sometimes a second
   * bolt off to the side, from the clouds above x down to the horizon near `to`.
   */
  function strike(events, mulberry32) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var age = e.age;
      if (!(age >= 0) || age >= STRIKE_LIFE) continue;
      var r = mulberry32(SEED + 3000 + e.frame);
      var from = Math.round((r() * 2 - 1) * 240);
      var forks = 2 + Math.floor(r() * 3);
      var again = 0.09 + 0.08 * r(); // the second stroke's moment …
      var againPeak = 0.55 + 0.4 * r(); // … and strength
      var hasSide = r() < SIDE_CHANCE;
      var sideRight = r() < 0.5;
      var sideX = 960 + (sideRight ? 1 : -1) * (420 + 420 * r());
      var sideTo = sideX + (r() * 2 - 1) * 140;
      var b = Math.exp(-age / 0.07);
      if (age >= again) b = Math.max(b, againPeak * Math.exp(-(age - again) / 0.06));
      // fade out toward the end of its life, so it never just vanishes
      b *= clamp01((STRIKE_LIFE - age) / 0.08);
      return {
        frame: e.frame,
        age: age,
        seed: (SEED + e.frame * 17) | 0,
        from: from,
        forks: forks,
        bright: clamp01(b * (0.75 + 0.25 * strengthOf(e))),
        side: hasSide
          ? { x: Math.round(sideX), to: Math.round(sideTo), seed: (SEED + e.frame * 29 + 5) | 0 }
          : null,
      };
    }
    return null;
  }

  /** The strikes' flash (0..1): each strong hit's, fading to nothing over FLASH_RELEASE. */
  function flash(events, intensity) {
    var f = 0;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!(e.age >= 0) || e.age >= FLASH_RELEASE) continue;
      var k = 1 - e.age / FLASH_RELEASE;
      f = Math.max(f, (0.6 + 0.4 * strengthOf(e)) * k * k);
    }
    return clamp01(f * Math.min(1, 0.35 + 0.65 * intensityOf(intensity)));
  }

  /**
   * The screens' static after the newest strong hit: { amount: per screen 0..1, seed }. A seeded
   * share of the screens (picked by the hit's song frame) goes to static for STATIC_LIFE seconds,
   * fading; the noise changes every frame meanwhile (seed), and is still the rest of the time.
   */
  function screenStatic(events, count, fps, mulberry32) {
    var amount = new Float32Array(count);
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!(e.age >= 0) || e.age >= STATIC_LIFE) continue;
      var r = mulberry32(SEED + 5000 + e.frame);
      var k = 1 - e.age / STATIC_LIFE;
      var any = false;
      for (var s = 0; s < count; s++) {
        if (r() < STATIC_SHARE) {
          amount[s] = clamp01(k);
          any = true;
        }
      }
      if (!any && count > 0) amount[Math.floor(r() * count)] = clamp01(k);
      return {
        amount: amount,
        seed: (SEED + e.frame * 31 + Math.round(e.age * finite(fps, 30))) | 0,
      };
    }
    return { amount: amount, seed: SEED };
  }

  // ---------- the screens ----------

  /**
   * Each screen's brightness (about 0.25..1.5). "centre": the top TV (index 0) is the bright main
   * one, pulsing a little with the beat; the others stay dim and light up with the beat, each its
   * own amount, a new pattern for each beat (seeded by its song frame). "all": every screen pulses
   * together. Louder music lifts them all a little (level 0..1).
   */
  function screenLevels(react, env, hit, level, count, mulberry32) {
    var out = new Float32Array(count);
    var e = clamp01(env);
    var lift = 0.85 + 0.3 * clamp01(level);
    if (react === "all") {
      for (var a = 0; a < count; a++) {
        var wobble = a === 0 ? 1 : 0.94 + 0.06 * mulberry32(SEED + 900 + a)();
        out[a] = Math.min(1.5, (0.62 + 0.55 * e) * lift * wobble);
      }
      return out;
    }
    var r = mulberry32(SEED + 7000 + (hit ? finite(hit.frame, 0) : 0));
    for (var i = 0; i < count; i++) {
      if (i === 0) {
        out[i] = Math.min(1.5, (1.05 + 0.3 * e) * lift);
        continue;
      }
      var flick = hit ? 0.15 + 0.85 * r() : 0.5;
      out[i] = Math.min(1.5, (0.27 + 0.6 * e * flick) * lift);
    }
    return out;
  }

  /**
   * Each screen's own fixed treatment: { tint (0 main colour, 1 accent), amount (how much of the
   * tint, 0..1), zoom (1..2: a crop of the picture), ox, oy (the crop's offset, inside the
   * picture), scan (scanline spacing, px) }. The main screen shows the whole picture nearly as it is.
   */
  function screenLooks(count, mulberry32) {
    var r = mulberry32(SEED + 11);
    var out = [];
    for (var i = 0; i < count; i++) {
      var tint = r() < 0.55 ? 0 : 1;
      var amount = 0.38 + 0.4 * r();
      var zoom = 1 + 0.9 * r();
      var room = (1 - 1 / zoom) / 2;
      var ox = (r() * 2 - 1) * room;
      var oy = (r() * 2 - 1) * room;
      var scan = 2.5 + 1.5 * r();
      if (i === 0) {
        out.push({ tint: 1, amount: 0.15, zoom: 1, ox: 0, oy: 0, scan: 3 });
        continue;
      }
      if (i === 1) tint = 0; // both colours always show
      if (i === 2) tint = 1;
      out.push({ tint: tint, amount: amount, zoom: zoom, ox: ox, oy: oy, scan: scan });
    }
    return out;
  }

  // ---------- the sky ----------

  /** The loudness averaged over the last LOUD_WINDOW seconds, shaped (0..1, 0 in silence). */
  function loudLevel(audio, t) {
    var tt = finite(t, 0);
    var first = -(audio.offset || 0);
    var sum = 0,
      n = 0;
    for (var k = 0; k < 8; k++) {
      var at = tt - (k * LOUD_WINDOW) / 8;
      if (at < first) break;
      sum += clamp01(audio.sample(at).loud);
      n++;
    }
    if (!n) return 0;
    var x = clamp01((sum / n - 0.1) / 0.75);
    return x * (2 - x); // eased: the light rises quickly, then settles
  }

  /** The sky's and floor's light (1 = as drawn) and the stack's rim light, from loudness and flash. */
  function skyLight(level, flashAmount) {
    var l = clamp01(level),
      f = clamp01(flashAmount);
    return {
      sky: 0.6 + 0.62 * l + 0.55 * f,
      floor: 0.7 + 0.45 * l + 0.45 * f,
      rim: 0.12 + 0.2 * l + 1.6 * f,
    };
  }

  /**
   * The horizon's and ground's line heights (px, 0..maxPx) from mirrorBars of the unboosted
   * spectrum: each relative to the frame's loudest, squared, so only the peaks stand tall; the
   * boost acts on the loudest one's level (1 - (1 - peak)^boost). Silence gives none.
   */
  function specHeights(values, intensity, boost, maxPx) {
    var n = values.length;
    var out = new Float32Array(n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(values[i]));
    if (!(peak > 0)) return out;
    var b = Math.max(1, Math.min(8, finite(boost, 1)));
    var level = 1 - Math.pow(1 - peak, b);
    var top = finite(maxPx, SPEC_MAX);
    var scale = top * Math.min(1.25, intensityOf(intensity)) * level;
    for (var k = 0; k < n; k++) {
      out[k] = Math.min(top, scale * Math.pow(clamp01(values[k]) / peak, SPEC_SHAPE));
    }
    return out;
  }

  /**
   * How far the clouds have drifted (whole px, wrapping at CLOUD_PERIOD) at a song time. Whole
   * pixels: the sky stays exactly the same between steps (a step every few frames is invisible on
   * soft clouds), which keeps the video quick to encode.
   */
  function cloudDrift(songTime) {
    var d = Math.floor(finite(songTime, 0) * CLOUD_SPEED + 1e-6);
    d = d - Math.floor(d / CLOUD_PERIOD) * CLOUD_PERIOD;
    return d >= 0 && d < CLOUD_PERIOD ? d : 0;
  }

  /**
   * The stack's turn, [x, y] radians: tipped toward the camera a little (seen from a little
   * above), turned aside, swaying slowly. It moves only SWAY_RATE times a second, by a fraction
   * of a pixel each time, so the frames between match exactly (quick to encode).
   */
  function towerSway(songTime, mulberry32) {
    var r = mulberry32(SEED + 41);
    var p0 = r() * 2 * Math.PI,
      p1 = r() * 2 * Math.PI;
    var s = Math.floor(finite(songTime, 0) * SWAY_RATE + 1e-6) / SWAY_RATE;
    var tau = 2 * Math.PI;
    return [
      LEAN + SWAY_X * Math.sin(tau * 0.031 * s + p0),
      TURN + SWAY_Y * Math.sin(tau * 0.023 * s + p1),
    ];
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
    STRIKE: STRIKE,
    STRIKE_LIFE: STRIKE_LIFE,
    FLASH_RELEASE: FLASH_RELEASE,
    STATIC_LIFE: STATIC_LIFE,
    SPEC_MAX: SPEC_MAX,
    CLOUD_SPEED: CLOUD_SPEED,
    CLOUD_PERIOD: CLOUD_PERIOD,
    LEAN: LEAN,
    TURN: TURN,
    hitEvents: hitEvents,
    lastHit: lastHit,
    strike: strike,
    flash: flash,
    screenStatic: screenStatic,
    screenLevels: screenLevels,
    screenLooks: screenLooks,
    loudLevel: loudLevel,
    skyLight: skyLight,
    specHeights: specHeights,
    cloudDrift: cloudDrift,
    towerSway: towerSway,
    fitTitle: fitTitle,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.TowerMotion = api;
})();
