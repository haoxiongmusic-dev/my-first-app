/*
 * Red Letter's motion and layout: which letter is red, how bright the letters are, which
 * letters jump on a strong beat, the oscilloscope line's spikes, the film's exposure and its
 * scratches and dust, and where the title's letters sit. Everything is worked out from the song
 * time alone (looking back at the beat list), so any frame can be drawn on its own and every
 * render is identical. Random numbers come only from the toolkit's seeded mulberry32, passed
 * in as `rng`. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var BEAT_RELEASE = 0.15; // seconds: how fast a beat's flash fades
  var REST_GREY = 0.7; // between beats the letters sit at 70 % of the main colour
  var RED_WHITEN = 0.12; // the red letter flashes at most this far toward white
  var SCOPE_MAX = 160; // px: the tallest spike at intensity 1
  var GLITCH_MIN = 4; // px
  var GLITCH_MAX = 12; // px
  var GLITCH_FRAMES = 2; // a glitch lasts two frames (at 30 frames a second)
  var STRONG_BEAT = 0.7; // beats at least this strong (0..1) glitch
  var WEAR_RATE = 6; // scratches, dust and grain change 6 times a second
  var GRAIN_MAX = 0.02; // the grain's largest amplitude (CLAUDE.md: keep it subtle)
  var LOOKBACK = 4; // s: the red letter's walk looks back this far (a section keeps 6 s)
  var CHAIN_MAX = 64; // beats read from the beat list at most
  // A beat that falls exactly on a frame counts from that frame, in a section too (beat times
  // are rounded to 1 ms, and a section's times differ from the song's in the last digits).
  var HIT_SLACK = 1e-4;
  var LETTER_SEED = 4049;
  var BUMP_SEED = 8111;
  var GLITCH_SEED = 6203;
  var WEAR_SEED = 9341;

  // The title: wide-spaced capitals across the centre of the frame.
  var CENTRE_Y = 540;
  var TITLE_SAFE = 1440; // px: the title block is never wider (the scope line keeps 240 px a side)
  var TITLE_MAX = 110; // px: the biggest title
  var WRAP_BELOW = 64; // px: a title smaller than this on one line wraps onto two
  var SPACING = 0.5; // em between letters
  var LINE_HEIGHT = 1.35;
  var ARTIST_MIN = 14;

  function clamp01(x) {
    return x > 0 ? Math.min(1, x) : 0;
  }

  // ---------- the red letter ----------

  /** Indices of the characters that can be red: letters and digits (else any non-space). */
  function letterSlots(text) {
    var chars = Array.from(String(text || ""));
    var out = [];
    var i;
    for (i = 0; i < chars.length; i++) if (/[\p{L}\p{N}]/u.test(chars[i])) out.push(i);
    if (out.length > 0) return out;
    for (i = 0; i < chars.length; i++) if (!/\s/.test(chars[i])) out.push(i);
    return out;
  }

  /** One step of the walk: from `slot` to another letter, chosen by the beat's song frame. */
  function step(slot, beatFrame, count, rng) {
    var rnd = rng(LETTER_SEED + beatFrame);
    var pick = Math.floor(rnd() * count);
    if (pick === slot) pick = (pick + 1 + Math.floor(rnd() * (count - 1))) % count;
    return pick;
  }

  /**
   * Where the walk ends at beat `from` of `hits` (newest first, [age, strength]): starting on
   * letter 1, one step per beat over the beats up to LOOKBACK seconds before it.
   */
  function walk(hits, from, songNow, fps, count, rng) {
    var newest = hits[from][0];
    var last = from;
    while (last + 1 < hits.length && hits[last + 1][0] - newest <= LOOKBACK + 1e-6) last++;
    var slot = 0;
    for (var i = last; i >= from; i--) {
      slot = step(slot, Math.round((songNow - hits[i][0]) * fps), count, rng);
    }
    return slot;
  }

  /**
   * Which of `count` letters is red at time t: letter 1 (slot 0) before the first beat; on
   * every beat it moves to another letter, never the one it was on. The walk only looks a few
   * seconds back from each beat (identified by its song frame), so a section, which keeps 6 s
   * of the song before its start, lands on the same letters as the full render. When the walks
   * of two beats in a row would end on the same letter, the later beat takes another one.
   */
  function redSlot(audio, t, count, rng) {
    if (!(count > 1)) return 0;
    var hits = audio.recentHits(t + HIT_SLACK, CHAIN_MAX);
    if (hits.length === 0) return 0;
    var songNow = (audio.songStart || 0) + t + HIT_SLACK;
    var fps = audio.fps || 30;
    var mine = walk(hits, 0, songNow, fps, count, rng);
    if (hits.length < 2 || walk(hits, 1, songNow, fps, count, rng) !== mine) return mine;
    var rnd = rng(BUMP_SEED + Math.round((songNow - hits[0][0]) * fps));
    return (mine + 1 + Math.floor(rnd() * (count - 1))) % count;
  }

  // ---------- brightness ----------

  /** 0..1: how far the letters have flashed toward white (the beat envelope × intensity). */
  function letterFlash(env, intensity) {
    return clamp01(env * intensity);
  }

  /** A letter's colour: 70 % of the main colour, flashing toward white. */
  function letterColor(main, flash) {
    var out = [];
    for (var c = 0; c < 3; c++) out.push(main[c] * REST_GREY + (1 - main[c] * REST_GREY) * flash);
    return out;
  }

  /** The red letter's colour: the accent at full strength, a little whiter on the flash. */
  function redColor(accent, flash) {
    var f = RED_WHITEN * clamp01(flash);
    var out = [];
    for (var c = 0; c < 3; c++) out.push(accent[c] + (1 - accent[c]) * f);
    return out;
  }

  // ---------- the glitch ----------

  /**
   * Sideways jumps (px) for each of `count` letters: on a strong beat 2–4 letters jump 4–12 px
   * for two frames, chosen by the song frame. Zeros otherwise.
   */
  function glitchOffsets(audio, t, count, on, rng) {
    var out = new Float32Array(Math.max(0, count));
    if (!on || count < 1) return out;
    var hits = audio.recentHits(t + HIT_SLACK, 1);
    if (hits.length === 0) return out;
    var age = hits[0][0] - HIT_SLACK;
    if (hits[0][1] < STRONG_BEAT || age > (GLITCH_FRAMES - 0.5) / 30) return out;
    var rnd = rng(GLITCH_SEED + Math.floor(((audio.songStart || 0) + t) * 30 + 1e-4));
    var moves = Math.min(count, 2 + Math.floor(rnd() * 3));
    for (var n = 0, guard = 0; n < moves && guard < 64; guard++) {
      var k = Math.floor(rnd() * count);
      var size = GLITCH_MIN + (GLITCH_MAX - GLITCH_MIN) * rnd();
      var sign = rnd() < 0.5 ? -1 : 1;
      if (out[k] !== 0) continue;
      out[k] = sign * size;
      n++;
    }
    return out;
  }

  // ---------- the scope line ----------

  /** The Bands setting (10..100 %) as points along each side: 24 up to 120. */
  function scopeCount(bandPct) {
    var pct = Math.max(10, Math.min(100, Number(bandPct) || 10));
    return Math.round(120 * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  var SPIKE_CHANCE = 0.2; // the share of points that spike in a frame
  var FUZZ = 0.06; // the rest keep this share of their height: a fine, live hiss
  /**
   * Heights (px, up is positive) for the scope line's points, from the toolkit's scopeLine
   * values (-1..1, the bass at index 0, next to the title). A strong boost makes almost every
   * band full, so the values are squared and only a seeded few points in each frame spike;
   * the rest are a fine hiss. Tallest next to the title, fading toward the screen edge.
   */
  function scopeHeights(values, songTime, intensity, seed, rng) {
    var n = values.length;
    var out = new Float32Array(n);
    var rnd = rng(seed * 7 + 3 + Math.floor(songTime * 30 + 1e-4));
    for (var k = 0; k < n; k++) {
      var u = n > 1 ? k / (n - 1) : 0;
      var v = Math.max(-1, Math.min(1, values[k] || 0));
      var spike = rnd() < SPIKE_CHANCE;
      var reach = spike ? 0.4 + 0.6 * rnd() : FUZZ;
      var taper = 0.18 + 0.82 * Math.exp(-2.6 * u);
      out[k] = v * Math.abs(v) * reach * taper * SCOPE_MAX * intensity;
    }
    return out;
  }

  // ---------- the film ----------

  /** The film's brightness: lifts with the music, like a projector lamp opening up. */
  function exposure(loud, intensity) {
    var l = clamp01(Number(loud) || 0);
    return 0.72 + 0.45 * l * Math.max(0, Math.min(2, Number(intensity) || 0));
  }

  /** Scratches, dust and grain change at this step: 6 a second. */
  function wearEpoch(songTime) {
    return Math.floor(songTime * WEAR_RATE + 1e-6);
  }

  /** The grain's amplitude for the Grain setting (0..100 %): at most 0.02. */
  function grainAmount(pct) {
    return GRAIN_MAX * clamp01((Number(pct) || 0) / 100);
  }

  /**
   * This step's scratches (thin vertical lines, some light, some dark), dust specks and the
   * lamp's flicker (a brightness factor within 1.5 %), more of them as the Grain setting
   * rises; none at 0 %. Seeded by the step, so they hold for a sixth of a second and every
   * render is the same.
   */
  function filmWear(epoch, pct, rng) {
    var wear = clamp01((Number(pct) || 0) / 100);
    var out = { scratches: [], specks: [], flicker: 1 };
    if (wear <= 0) return out;
    var rnd = rng(WEAR_SEED + epoch);
    out.flicker = 1 + (rnd() - 0.5) * 0.03 * wear;
    var lines = Math.floor((1 + 3 * rnd()) * wear + 0.5);
    for (var i = 0; i < Math.min(4, lines); i++) {
      var y0 = rnd() < 0.5 ? 0 : 1080 * 0.6 * rnd();
      var len = 300 + 900 * rnd();
      out.scratches.push({
        x: 30 + 1860 * rnd(),
        y0: y0,
        y1: Math.min(1080, y0 + len),
        width: 0.8 + 1.6 * rnd(),
        light: rnd() < 0.55 ? 1 : 0,
      });
    }
    var specks = Math.floor(12 * wear * (0.5 + 0.5 * rnd()));
    for (var s = 0; s < Math.min(12, specks); s++) {
      out.specks.push({
        x: 1920 * rnd(),
        y: 1080 * rnd(),
        r: 0.8 + 3.2 * rnd() * rnd(),
        light: rnd() < 0.35 ? 1 : 0,
      });
    }
    return out;
  }

  /** The text fades in from 0.3 s to 1.9 s (smooth), then stays. */
  function textFade(t) {
    var x = clamp01((t - 0.3) / 1.6);
    return x * x * (3 - 2 * x);
  }

  // ---------- the title's layout ----------

  /** Width of a line at 100 px: its letters plus the spacing between them. */
  function width100(chars, charWidth) {
    var w = 0;
    for (var i = 0; i < chars.length; i++) w += charWidth(chars[i]);
    return w + Math.max(0, chars.length - 1) * SPACING * 100;
  }

  /**
   * Where each of the title's characters sits: one line across the centre at up to 110 px,
   * or two balanced lines when one would be smaller than 64 px; then shrunk so the block is
   * never wider than TITLE_SAFE. charWidth(ch) is a character's advance at 100 px and
   * capHeight the capitals' height at 100 px. Returns the size, the lines, each character's
   * x (left), y (baseline), width and red-letter slot (-1 for spaces), and the block's bounds.
   */
  function placeTitle(text, charWidth, capHeight) {
    var clean = String(text || "")
      .trim()
      .replace(/\s+/g, " ");
    var all = Array.from(clean);
    var lines = [clean];
    var widths = [width100(all, charWidth)];
    var size = widths[0] > 0 ? Math.min(TITLE_MAX, (100 * TITLE_SAFE) / widths[0]) : TITLE_MAX;
    if (size < WRAP_BELOW && clean.indexOf(" ") > 0) {
      var best = null;
      for (var i = 0; i < all.length; i++) {
        if (all[i] !== " ") continue;
        var a = all.slice(0, i),
          b = all.slice(i + 1);
        var wa = width100(a, charWidth),
          wb = width100(b, charWidth);
        if (!best || Math.max(wa, wb) < Math.max(best.wa, best.wb))
          best = { a: a, b: b, wa: wa, wb: wb };
      }
      var size2 = Math.min(TITLE_MAX, (100 * TITLE_SAFE) / Math.max(best.wa, best.wb));
      if (size2 > size) {
        size = size2;
        lines = [best.a.join(""), best.b.join("")];
        widths = [best.wa, best.wb];
      }
    }
    var k = size / 100;
    var cap = capHeight * k;
    var lineGap = size * LINE_HEIGHT;
    var blockHeight = cap + (lines.length - 1) * lineGap;
    var top = CENTRE_Y - blockHeight / 2;
    var chars = [];
    var slots = letterSlots(clean);
    var index = 0; // position in `clean`
    var widest = 0;
    for (var l = 0; l < lines.length; l++) {
      var lineChars = Array.from(lines[l]);
      var x = 960 - (widths[l] * k) / 2;
      widest = Math.max(widest, widths[l] * k);
      var baseline = top + cap + l * lineGap;
      for (var c = 0; c < lineChars.length; c++) {
        var w = charWidth(lineChars[c]) * k;
        chars.push({
          ch: lineChars[c],
          x: x,
          y: baseline,
          w: w,
          slot: slots.indexOf(index),
        });
        x += w + SPACING * size;
        index++;
      }
      index++; // the space the line broke at
    }
    // an empty title still leaves a small gap where it would be
    var half = Math.max(widest, size) / 2;
    return {
      size: size,
      lines: lines,
      chars: chars,
      left: 960 - half,
      right: 960 + half,
      top: top,
      bottom: top + blockHeight,
    };
  }

  /** The artist line's size: about a quarter of the title (14–26 px), shrunk to fit. */
  function artistSize(titleSize, width100AtSize100) {
    var size = Math.max(ARTIST_MIN, Math.min(26, titleSize / 4));
    if (width100AtSize100 > 0) size = Math.min(size, (100 * TITLE_SAFE) / width100AtSize100);
    return size;
  }

  var api = {
    BEAT_RELEASE: BEAT_RELEASE,
    REST_GREY: REST_GREY,
    SCOPE_MAX: SCOPE_MAX,
    GLITCH_MIN: GLITCH_MIN,
    GLITCH_MAX: GLITCH_MAX,
    STRONG_BEAT: STRONG_BEAT,
    WEAR_RATE: WEAR_RATE,
    GRAIN_MAX: GRAIN_MAX,
    TITLE_SAFE: TITLE_SAFE,
    TITLE_MAX: TITLE_MAX,
    CENTRE_Y: CENTRE_Y,
    SPACING: SPACING,
    letterSlots: letterSlots,
    redSlot: redSlot,
    letterFlash: letterFlash,
    letterColor: letterColor,
    redColor: redColor,
    glitchOffsets: glitchOffsets,
    scopeCount: scopeCount,
    scopeHeights: scopeHeights,
    exposure: exposure,
    wearEpoch: wearEpoch,
    grainAmount: grainAmount,
    filmWear: filmWear,
    textFade: textFade,
    placeTitle: placeTitle,
    artistSize: artistSize,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.LetterMotion = api;
})();
