/*
 * Silk Lights' motion and layout: the glow slab's drifting hot spots and how bright and tall
 * it is, the wave lines' shaped heights, the mini bars, the cover's beat pulse, and where the
 * left block (cover, bars, caption, tag pills, timer) sits. Everything is worked out from the
 * song time alone (the toolkit's beatEnvelope looks back a little), so any frame can be drawn
 * on its own and a section matches the full render. Random numbers come only from the
 * toolkit's seeded mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  // The glow slab: a long soft band across the middle (70 % × 25 % of the frame), a little
  // right of centre so it balances the left block.
  var SLAB = { cx: 1040, cy: 540, w: 1344, h: 270 };
  // The big wave line in the lower third: flat from the left edge, alive from `left` to
  // `right` (clear of the left block), peaks up to `max` px (never past `cap`).
  var WAVE = { y: 860, left: 720, right: 1860, max: 300, cap: 360 };
  // Its fainter, thinner copy along the top, peaks hanging down toward the glow.
  var TOP = { y: 120, max: 90 };
  var COVER = { x: 70, size: 290, r: 28 };
  var MINI = { count: 40, max: 70, width: 2, gap: 3 };
  // Tag pills at full size (they shrink together when the tags are too long for two rows).
  var PILL = { h: 40, padX: 20, gap: 12, rowGap: 12, maxWidth: 600, size: 16 };
  var CAPTION = { size: 30, maxWidth: 620 };
  var WAVE_FULL = 96; // points along the wave line at Bands 100 %
  var BEAT_RELEASE = 0.3;
  var COVER_PULSE = 0.025;
  var EDGE = 0.25; // the share of the slab's length at each end that fades to dark

  function clamp01(x) {
    return x > 0 ? Math.min(1, x) : 0; // NaN gives 0
  }
  function num(x, fallback) {
    var n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  /** The Bands setting (10..100 %) as the number of points along the wave line. */
  function waveCount(bandPct) {
    var pct = Math.max(10, Math.min(100, num(bandPct, 10)));
    return Math.round(WAVE_FULL * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  /**
   * The wave line's heights, px. Loud music pushes every band high (≈ 0.5–1), so each value
   * is taken relative to the frame's loudest band and raised to the 4th power (squared, then
   * squared again): only the bands near the top stand tall, the rest stay calm. The loudest
   * band's own level (squared) sets how tall the peaks are. Both ends meet the baseline, and
   * nothing passes 1.2 × max. Silence (or nonsense) gives a flat line.
   */
  function waveHeights(values, intensity, max) {
    var n = values.length;
    var out = new Float32Array(n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, clamp01(values[i]));
    if (peak <= 0) return out;
    var scale = max * Math.max(0, num(intensity, 1)) * peak * peak;
    var cap = max * 1.2;
    var ramp = Math.max(1, 0.12 * (n - 1));
    for (var k = 0; k < n; k++) {
      var r = clamp01(values[k]) / peak;
      var r2 = r * r;
      var e = Math.min(1, Math.min(k, n - 1 - k) / ramp);
      var taper = e * e * (3 - 2 * e);
      out[k] = Math.min(cap, scale * r2 * r2 * taper);
    }
    return out;
  }

  /**
   * A slow ripple along the wave line, 0.4..1 per point: two soft swells travelling
   * sideways, so a run of equally loud bands (a strong boost flattens them) still reads as
   * rolling silk instead of a flat shelf. Song time only.
   */
  function waveRipple(count, songTime) {
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var u = count > 1 ? i / (count - 1) : 0;
      var a = Math.sin(2 * Math.PI * (u * 2.3 - songTime * 0.21));
      var b = Math.sin(2 * Math.PI * (u * 3.7 + songTime * 0.13) + 1.7);
      out[i] = 0.4 + 0.6 * (0.5 + 0.5 * (0.6 * a + 0.4 * b));
    }
    return out;
  }

  /** The mini bars' lengths, px: the spectrum (cubed, so loud music still moves), capped at 70. */
  function miniBars(values, intensity) {
    var out = new Float32Array(values.length);
    var k = Math.max(0, num(intensity, 1));
    for (var i = 0; i < values.length; i++) {
      var v = clamp01(values[i]);
      out[i] = Math.min(MINI.max, v * v * v * MINI.max * k);
    }
    return out;
  }

  /**
   * The glow's hot spots, seeded: soft round blobs and long thin streaks spread along the
   * slab, each drifting sideways at its own speed (most to the right, every fourth to the
   * left), shimmering at its own rate and lit by its own part of the spectrum. tone: 0 = the
   * main colour, 1 = the accent. y is px from the slab's middle.
   */
  function glowSpots(seed, mulberry32) {
    var rand = mulberry32(seed);
    var spots = [];
    var BLOBS = 14,
      STREAKS = 10;
    for (var i = 0; i < BLOBS + STREAKS; i++) {
      var streak = i >= BLOBS;
      var dir = i % 4 === 3 ? -1 : 1;
      spots.push({
        u: rand(),
        y: (rand() - 0.5) * (streak ? 0.5 : 0.36) * SLAB.h,
        rx: streak ? 220 + 220 * rand() : 110 + 150 * rand(),
        ry: streak ? 9 + 12 * rand() : 46 + 44 * rand(),
        speed: dir * (streak ? 45 + 70 * rand() : 12 + 34 * rand()),
        tone: (i * 0.618034 + 0.2 * rand()) % 1,
        alpha: streak ? 0.45 + 0.4 * rand() : 0.32 + 0.38 * rand(),
        band: rand(),
        freq: 0.12 + 0.4 * rand(),
        phase: rand(),
        streak: streak,
      });
    }
    return spots;
  }

  /** Reads a spectrum at fractional position x (0 = bass, 1 = the last band). */
  function spectrumAt(spectrum, x) {
    var n = spectrum.length;
    if (!n) return 0;
    var p = clamp01(x) * (n - 1);
    var i0 = Math.floor(p),
      i1 = Math.min(n - 1, i0 + 1);
    return clamp01(spectrum[i0] + (spectrum[i1] - spectrum[i0]) * (p - i0));
  }

  /** 0 at the slab's ends (and beyond), rising smoothly to 1 a quarter of the way in. */
  function edgeFade(u) {
    if (!(u > 0 && u < 1)) return 0;
    var e = Math.min(1, Math.min(u, 1 - u) / EDGE);
    return e * e * (3 - 2 * e);
  }

  /**
   * Where each hot spot is at this song time and how bright: it travels a loop a little longer
   * than the slab (so it wraps around unseen, beyond the dark ends), shimmers, follows its
   * band of the spectrum (when given) and the overall glow level.
   */
  function spotsAt(spots, songTime, spectrum, level) {
    var left = SLAB.cx - SLAB.w / 2;
    var from = left - 300;
    var span = SLAB.w + 600;
    var lv = Math.max(0, num(level, 1));
    var out = [];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      var travel = (s.u * span + s.speed * songTime) % span;
      if (travel < 0) travel += span;
      var x = from + travel;
      var wobble = 7 * Math.sin(2 * Math.PI * (0.5 * s.freq * songTime + s.phase + 0.25));
      var shimmer = 0.72 + 0.28 * Math.sin(2 * Math.PI * (s.freq * songTime + s.phase));
      var lit = spectrum ? 0.5 + 0.7 * spectrumAt(spectrum, s.band) : 1;
      out.push({
        x: x,
        y: SLAB.cy + s.y + wobble,
        rx: s.rx,
        ry: s.ry,
        tone: s.tone,
        alpha: clamp01(s.alpha * shimmer * lit * lv * edgeFade((x - left) / SLAB.w)),
      });
    }
    return out;
  }

  /** How bright the glow is: a calm level in silence, up with loudness, flux and the beat. */
  function glowLevel(loud, flux, env, intensity) {
    var k = Math.max(0, num(intensity, 1));
    var lift = 0.62 * clamp01(loud) + 0.4 * clamp01(flux) + 0.32 * clamp01(env);
    return Math.min(1.6, 0.44 + k * lift);
  }

  /** How tall the slab is (1 = 25 % of the frame): taller with loudness and flux. */
  function slabScale(loud, flux) {
    return Math.min(1.2, 0.78 + 0.3 * clamp01(loud) + 0.14 * clamp01(flux));
  }

  /** The cover's beat pulse: 1 + 0.025 × the beat envelope. */
  function coverScale(env) {
    return 1 + COVER_PULSE * clamp01(env);
  }

  /**
   * The tag pills, from their text widths at full size: filled left to right, wrapping onto a
   * second row; when they still don't fit in two rows of maxWidth, all of them shrink
   * together until they do. Positions are px from the block's top left.
   */
  function pillLayout(textWidths, maxWidth) {
    var n = textWidths.length;
    if (!n) return { scale: 1, rows: 0, width: 0, height: 0, pills: [] };
    var scale = 1;
    for (;;) {
      var pills = [];
      var row = 0,
        x = 0,
        widest = 0,
        fits = true;
      for (var i = 0; i < n; i++) {
        var w = (Math.max(0, num(textWidths[i], 0)) + 2 * PILL.padX) * scale;
        if (w > maxWidth) fits = false;
        if (x > 0 && x + w > maxWidth) {
          row++;
          x = 0;
        }
        pills.push({
          index: i,
          x: x,
          y: row * (PILL.h + PILL.rowGap) * scale,
          w: w,
          h: PILL.h * scale,
          row: row,
        });
        widest = Math.max(widest, x + w);
        x += w + PILL.gap * scale;
      }
      var rows = row + 1;
      if ((fits && rows <= 2) || scale < 0.05) {
        return {
          scale: scale,
          rows: rows,
          width: widest,
          height: rows * PILL.h * scale + (rows - 1) * PILL.rowGap * scale,
          pills: pills,
        };
      }
      scale *= 0.95;
    }
  }

  function mix(a, b, f) {
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function lum(c) {
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // Each pill's mix of the two colours, and how much of it is greyed (the fourth is the quiet
  // grey one, as in the reference's row of different tints).
  var TINTS = [
    [0.12, 0],
    [0.88, 0],
    [0.5, 0],
    [0.35, 0.62],
    [0.7, 0.22],
  ];
  /** The fill of pill `index`: its own tint, darkened so white text reads on it. */
  function pillTint(index, main, accent) {
    var t = TINTS[((index % TINTS.length) + TINTS.length) % TINTS.length];
    var c = mix(main, accent, t[0]);
    var g = lum(c);
    c = mix(c, [g * 0.8, g * 0.82, g * 0.9], t[1]);
    var l = lum(c);
    var k = Math.min(0.82, l > 0 ? 0.4 / l : 1);
    return [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];
  }

  /**
   * The left block, top to bottom: the cover (with the mini bars to its lower right), the
   * caption, the tag pills (pillRows rows, pillHeight px in all) and the timer; centred on the
   * frame's middle. Text and pills stay left of the wave line's moving part.
   */
  function blockLayout(pillRows, pillHeight, showTimer) {
    var CAP_GAP = 34,
      CAP_H = 34,
      PILL_GAP = 26,
      TIMER_GAP = 30,
      TIMER_H = 18;
    var total =
      COVER.size +
      CAP_GAP +
      CAP_H +
      (pillRows > 0 ? PILL_GAP + pillHeight : 0) +
      (showTimer ? TIMER_GAP + TIMER_H : 0);
    var top = Math.round(540 - total / 2);
    var coverBottom = top + COVER.size;
    var captionTop = coverBottom + CAP_GAP;
    var pillsTop = captionTop + CAP_H + PILL_GAP;
    var afterPills = pillRows > 0 ? pillsTop + pillHeight : captionTop + CAP_H;
    return {
      top: top,
      cover: { x: COVER.x, y: top, size: COVER.size, r: COVER.r },
      bars: {
        x: COVER.x + COVER.size + 24,
        bottom: coverBottom,
        count: MINI.count,
        max: MINI.max,
        width: MINI.width,
        gap: MINI.gap,
      },
      caption: {
        x: COVER.x,
        y: captionTop + CAP_H / 2,
        size: CAPTION.size,
        maxWidth: CAPTION.maxWidth,
      },
      pills: { x: COVER.x, y: pillsTop, maxWidth: PILL.maxWidth },
      timer: showTimer ? { x: COVER.x, y: afterPills + TIMER_GAP + TIMER_H / 2 } : null,
      bottom: top + total,
    };
  }

  /** The text and the left block fade in over the first two seconds. */
  function textFade(t) {
    var u = clamp01((t - 0.3) / 1.6);
    return 1 - (1 - u) * (1 - u);
  }

  var api = {
    SLAB: SLAB,
    WAVE: WAVE,
    TOP: TOP,
    COVER: COVER,
    MINI: MINI,
    PILL: PILL,
    CAPTION: CAPTION,
    BEAT_RELEASE: BEAT_RELEASE,
    waveCount: waveCount,
    waveHeights: waveHeights,
    waveRipple: waveRipple,
    miniBars: miniBars,
    glowSpots: glowSpots,
    spotsAt: spotsAt,
    glowLevel: glowLevel,
    slabScale: slabScale,
    edgeFade: edgeFade,
    coverScale: coverScale,
    pillLayout: pillLayout,
    pillTint: pillTint,
    blockLayout: blockLayout,
    textFade: textFade,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.SilkMotion = api;
})();
