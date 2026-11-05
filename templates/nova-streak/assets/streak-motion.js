/*
 * Nova Streak's motion: how the streak, bars, cover, electric arcs and stars follow the music.
 * Everything is worked out from the song time alone (looking back a little where a movement
 * needs a past), so any frame can be drawn on its own and every render is identical.
 * `audio` is a toolkit createAudio(...) result; random numbers come only from the toolkit's
 * seeded mulberry32, passed in. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels measured from the frame centre, y pointing down as on screen.
 */
(function () {
  "use strict";

  var STREAK_BASE = 0.55;
  var BAR_SCALE = 160; // px of bar for a full-scale band at intensity 1
  var BAR_MAX = 200; // px, each way from the streak (clear of the title at 760 px)
  var COVER_GAP = 200; // bars start here with a cover: its half-size (180) plus 20 px
  var BAR_OUTER = 921.6; // 96 % of the half-width
  var COVER_RELEASE = 0.18; // seconds for the cover pulse to fall to about a third
  var COVER_LOOKBACK = 12; // samples at 1/60 s (0.2 s)
  var COVER_PULSE = 0.06;
  var ARC_LIFE = 0.3; // seconds an arc burst lasts
  var ARC_JITTER = 14; // px, perpendicular to the border
  var TWINKLE_LIFE = 0.5; // seconds a star twinkle lasts
  var TWINKLE_GAIN = 0.15;
  var TWINKLE_STEPS = 6; // twinkle changes at most this often per second (grain rule)
  var STAR_COUNT = 900; // at 100 % density
  var STAR_SEED = 11;
  var STAR_DRIFT = 6; // px/s leftwards for the nearest stars
  var WIDTH = 1920;
  var HEIGHT = 1080;

  /** The earliest time this audio knows about (a section keeps some of the song before it). */
  function earliest(audio) {
    return -(audio.offset || 0);
  }

  /** Streak brightness 0.55..1: brighter when the music is loud. */
  function streakLevel(loud, intensity) {
    return Math.min(1, STREAK_BASE + 0.45 * loud * intensity);
  }

  /** The Bands setting (10..100 %) as a number of bars per side (16..96). */
  function bandsToCount(pct) {
    return Math.round(16 + ((pct - 10) / 90) * 80);
  }

  /** Bar heights in px each way from the streak; index 0 is the bass, nearest the centre. */
  function barHeights(values, intensity) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      out[i] = Math.min(BAR_MAX, values[i] * BAR_SCALE * intensity);
    }
    return out;
  }

  /** Where the bars of one side sit: from the cover's edge (or the centre) out to 921.6 px. */
  function barLayout(count, hasCover) {
    var inner = hasCover ? COVER_GAP : 0;
    var width = (BAR_OUTER - inner) / count;
    var centres = new Float32Array(count);
    for (var i = 0; i < count; i++) centres[i] = inner + (i + 0.5) * width;
    return { inner: inner, outer: BAR_OUTER, width: width, centres: centres };
  }

  /** How far the cover is pushed out, 0..1: the strongest recent beat, fading over the release. */
  function coverEnvelope(audio, t) {
    var first = earliest(audio);
    var env = 0;
    for (var k = 0; k < COVER_LOOKBACK; k++) {
      var age = k / 60;
      var beat = audio.sample(Math.max(first, t - age)).beat;
      env = Math.max(env, beat * Math.exp(-age / COVER_RELEASE));
    }
    return Math.max(0, Math.min(1, env));
  }

  /** The cover's scale: up to 6 % bigger on a full beat at intensity 1. */
  function coverScale(env, intensity) {
    return 1 + COVER_PULSE * env * intensity;
  }

  /**
   * A point on the square border of half-size `half`, walked clockwise from the top-left
   * corner, `s` px along it; with the outward normal there. Returns [x, y, nx, ny].
   */
  function borderPoint(s, half) {
    var side = 2 * half;
    var p = 4 * side;
    s = ((s % p) + p) % p;
    if (s < side) return [-half + s, -half, 0, -1]; // top, left to right
    s -= side;
    if (s < side) return [half, -half + s, 1, 0]; // right, top to bottom
    s -= side;
    if (s < side) return [half - s, half, 0, 1]; // bottom, right to left
    s -= side;
    return [-half, half - s, -1, 0]; // left, bottom to top
  }

  /**
   * The electric arcs around the cover: a burst of 3–6 jagged arcs for each beat younger than
   * 0.3 s, fading as it ages. A burst's shape comes only from its beat's moment in the whole
   * song, so the same beat looks the same in every render and in any section of the song.
   * Returns [{ alpha, points: Float32Array [x0, y0, x1, y1, ...] }].
   */
  function arcBursts(audio, t, half, glow, mulberry32) {
    var arcs = [];
    var songStart = audio.songStart || 0;
    var perimeter = 8 * half;
    var hits = audio.recentHits(t, 4);
    for (var h = 0; h < hits.length; h++) {
      var age = hits[h][0];
      if (age >= ARC_LIFE) continue;
      var hitSong = songStart + t - age; // the beat's time in the whole song
      var rand = mulberry32(Math.round(hitSong * 1000));
      var alpha = (1 - age / ARC_LIFE) * (glow / 100);
      var count = 3 + Math.floor(rand() * 4);
      for (var a = 0; a < count; a++) {
        var s0 = rand() * perimeter;
        var len = (0.08 + 0.17 * rand()) * perimeter;
        var n = 8 + Math.floor(rand() * 7);
        var points = new Float32Array(2 * n);
        for (var k = 0; k < n; k++) {
          var b = borderPoint(s0 + (len * k) / (n - 1), half);
          var j = k === 0 || k === n - 1 ? 0 : (2 * rand() - 1) * ARC_JITTER;
          points[2 * k] = b[0] + b[2] * j;
          points[2 * k + 1] = b[1] + b[3] * j;
        }
        arcs.push({ alpha: alpha, points: points });
      }
    }
    return arcs;
  }

  /** Star brightness multiplier: up to 15 % brighter after a hit, changing at most 6×/s. */
  function starTwinkle(audio, t) {
    var songStart = audio.songStart || 0;
    var tq = Math.floor((t + songStart) * TWINKLE_STEPS) / TWINKLE_STEPS - songStart;
    var hits = audio.recentHits(tq, 4);
    var boost = 0;
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0];
      if (age < TWINKLE_LIFE) boost = Math.max(boost, hits[i][1] * (1 - age / TWINKLE_LIFE));
    }
    return 1 + TWINKLE_GAIN * boost;
  }

  /** The starfield: [x, y, depth, size, brightness] per star, the same every time. */
  function buildStars(density, mulberry32) {
    var n = Math.round((STAR_COUNT * density) / 100);
    var rand = mulberry32(STAR_SEED);
    var out = new Float32Array(5 * n);
    for (var i = 0; i < n; i++) {
      out[5 * i] = rand() * WIDTH;
      out[5 * i + 1] = rand() * HEIGHT;
      out[5 * i + 2] = 0.2 + 0.8 * rand();
      out[5 * i + 3] = 1 + 1.5 * rand();
      out[5 * i + 4] = 0.3 + 0.7 * rand();
    }
    return out;
  }

  /** A star's x at a song time: drifting left, nearer stars faster, wrapping around. */
  function starX(x0, depth, songTime) {
    return (((x0 - STAR_DRIFT * depth * songTime) % WIDTH) + WIDTH) % WIDTH;
  }

  var api = {
    streakLevel: streakLevel,
    bandsToCount: bandsToCount,
    barHeights: barHeights,
    barLayout: barLayout,
    coverEnvelope: coverEnvelope,
    coverScale: coverScale,
    arcBursts: arcBursts,
    starTwinkle: starTwinkle,
    buildStars: buildStars,
    starX: starX,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.StreakMotion = api;
})();
