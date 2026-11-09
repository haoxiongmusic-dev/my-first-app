/*
 * Signal Dish's motion: how the radio dish turns, the rays fanning behind it and the hairline
 * spectra on the horizon follow the music, when a shooting star crosses the sky, and the night
 * sky itself (stars and the land's ridge). Everything is worked out from the song time alone
 * (or seeded), so any frame can be drawn on its own, a section matches the full render and
 * every render is identical. Pure: no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels, y down.
 */
(function () {
  "use strict";

  var HORIZON_Y = 984; // the land's top under the dish: the bottom 9 % of the frame is land
  var DISH_X = 960;
  var DISH_HEIGHT = 120; // px from the ground to the tip of the feed, aiming straight up
  var PIVOT_Y = HORIZON_Y - 72; // the dish tilts about this point on top of its stand
  var DISH_R = 46; // the dish's radius
  var DISH_DEPTH = 16; // how deep the bowl is
  var AIM_MAX = 40; // degrees either side of straight up
  var AIM_PERIOD = 40; // seconds for one swing left and back
  var RAY_CY = PIVOT_Y; // the fan of rays is centred on the dish's pivot
  var RAY_INNER = 96; // px from the centre where each ray starts (clear of the dish)
  var RAY_MAX = 120; // px: the longest ray
  var RAY_FULL = 90; // rays at Bands 100 %
  var HAIR_MAX = 260; // px: the tallest hairline
  var HAIR_WIDTH = 2;
  var HAIR_NEAR = 236; // px from the centre to the first hairline (past the longest ray)
  var HAIR_FAR = 780; // px from the centre to the last one
  var HAIR_FULL = 64; // hairlines on each side at Bands 100 %
  var SHOOT_EVERY = 6; // seconds: about one shooting star in each slot this long
  var SHOOT_LIFE = 0.6; // seconds each streak lasts
  var SHOOT_CHANCE = 0.85; // a slot has a shooting star this often
  var STAR_COUNT = 900;
  var STAR_STRIDE = 6; // x, y, size, brightness, twinkle period (0: steady), phase
  var TWINKLE_SHARE = 0.06; // the share of stars that twinkle
  var RIDGE_STEP = 20; // px between the ridge's heights
  var TITLE_Y = 430;
  var PULSE_RELEASE = 0.22; // seconds for the title pulse to fall to about a third
  var PULSE = 0.025; // title scale added by a full beat
  var GLOW_LOUD = 0.15; // the horizon glow brightens this much when loud
  // The Milky Way: a band rising from the lower left to the upper right (x0, y0, x1, y1), with
  // its half-width; the shader draws its haze and some of the stars gather along it.
  var MILKY = [-80, 860, 2000, 60, 110];

  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function positive(x) {
    return x > 0 ? x : 0; // NaN gives 0
  }
  function smoothstep(a, b, x) {
    var f = clamp01((x - a) / (b - a));
    return f * f * (3 - 2 * f);
  }

  /**
   * Where the dish points, in degrees from straight up (negative: left), from the song time.
   * One swing every AIM_PERIOD seconds, its pace gently varied so it never feels mechanical,
   * reaching ±AIM_MAX at each end.
   */
  function dishAim(songTime) {
    var s = songTime || 0;
    var phase = (2 * Math.PI * s) / AIM_PERIOD + 0.3 * Math.sin((2 * Math.PI * s) / 17);
    return AIM_MAX * Math.sin(phase);
  }

  /**
   * How far the dish has turned toward us, as the rim's minor/major ratio (0.14 edge-on to
   * 0.42 nearly face-on), on its own slow path.
   */
  function dishTurn(songTime) {
    var s = songTime || 0;
    return 0.28 + 0.14 * Math.sin((2 * Math.PI * s) / 57 + 1.1);
  }

  /**
   * The dish's silhouette for an aim (degrees) and turn: the rim (an ellipse seen at an angle),
   * the back of the bowl (a parabola), the block it hangs from, the stand, the struts holding
   * the feed and the feed itself ([x, y, radius]). All in 1080p pixels.
   */
  function dishShape(aimDeg, turn) {
    var a = (aimDeg * Math.PI) / 180;
    var ux = Math.sin(a),
      uy = -Math.cos(a); // along the aim
    var wx = Math.cos(a),
      wy = Math.sin(a); // across the dish
    var k = turn;
    function at(base, alongW, alongU) {
      return [base[0] + alongW * wx + alongU * ux, base[1] + alongW * wy + alongU * uy];
    }
    var P = [DISH_X, PIVOT_Y];
    var vertex = at(P, 0, 6);
    var C = at(vertex, 0, DISH_DEPTH);
    var focal = (DISH_R * DISH_R) / (4 * DISH_DEPTH);
    var F = at(vertex, 0, focal);
    var rim = [];
    for (var i = 0; i < 40; i++) {
      var b = (2 * Math.PI * i) / 40;
      rim.push(at(C, DISH_R * Math.cos(b), DISH_R * k * Math.sin(b)));
    }
    var back = [];
    for (var j = 0; j <= 20; j++) {
      var s = -1 + j / 10;
      back.push(at(C, DISH_R * s, -DISH_DEPTH * (1 - s * s)));
    }
    // the block behind the bowl that it tilts on, the bearing, and the stand: a slim
    // tapering tower on a low plinth, with a turntable at its top
    var hub = [at(P, -9, -9), at(P, 9, -9), at(P, 11, 7), at(P, -11, 7)];
    var top = PIVOT_Y + 16;
    var mount = [
      [DISH_X - 26, HORIZON_Y + 8],
      [DISH_X - 26, HORIZON_Y - 4],
      [DISH_X - 13, HORIZON_Y - 7],
      [DISH_X - 6, top + 4],
      [DISH_X - 14, top + 4],
      [DISH_X - 14, top - 2],
      [DISH_X - 4, top - 2],
      [DISH_X - 3, PIVOT_Y],
      [DISH_X + 3, PIVOT_Y],
      [DISH_X + 4, top - 2],
      [DISH_X + 14, top - 2],
      [DISH_X + 14, top + 4],
      [DISH_X + 6, top + 4],
      [DISH_X + 13, HORIZON_Y - 7],
      [DISH_X + 26, HORIZON_Y - 4],
      [DISH_X + 26, HORIZON_Y + 8],
    ];
    var left = at(C, -0.92 * DISH_R, 0),
      right = at(C, 0.92 * DISH_R, 0),
      tip = at(F, 0, 7);
    var struts = [
      [left[0], left[1], F[0], F[1]],
      [right[0], right[1], F[0], F[1]],
      [F[0], F[1], tip[0], tip[1]],
    ];
    return {
      rim: rim,
      back: back,
      hub: hub,
      mount: mount,
      struts: struts,
      feed: [F[0], F[1], 3.5],
    };
  }

  /** The Bands setting (10..100 %) as a ray count: a fifth of RAY_FULL up to all of it. */
  function rayCount(bandPct) {
    return Math.round(RAY_FULL * (0.2 + (0.8 * (bandPct - 10)) / 90));
  }

  /**
   * Ray lengths, px: squared (so quiet bands drop back), times each ray's weight if given,
   * and capped at RAY_MAX.
   */
  function rayLengths(values, intensity, weights) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      var v = positive(values[i]);
      var w = weights ? weights[i] : 1;
      out[i] = Math.min(RAY_MAX, v * v * w * RAY_MAX * intensity);
    }
    return out;
  }

  /**
   * A fixed weight for each ray, seeded and mirrored left/right like the fan itself, so a
   * loud song still gives a fan of different lengths rather than a solid arch.
   */
  function rayWeights(count, mulberry32) {
    var rand = mulberry32(5150);
    var out = new Float32Array(count);
    for (var i = 0; i < Math.ceil(count / 2); i++) {
      var w = 0.5 + 0.5 * rand();
      out[i] = w;
      out[count - 1 - i] = w;
    }
    return out;
  }

  /** The Bands setting as hairlines on each side: a fifth of HAIR_FULL up to all of them. */
  function hairCount(bandPct) {
    return Math.round(HAIR_FULL * (0.2 + (0.8 * (bandPct - 10)) / 90));
  }

  /** Each hairline's distance from the centre, px, nearest the dish first. */
  function hairOffsets(count) {
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      out[i] = count > 1 ? HAIR_NEAR + ((HAIR_FAR - HAIR_NEAR) * i) / (count - 1) : HAIR_NEAR;
    }
    return out;
  }

  /**
   * A fixed weight for each hairline (the same on both sides): seeded, so neighbours differ
   * and a loud song still shows a skyline of different heights, and lower toward the outside.
   */
  function hairWeights(count, mulberry32) {
    var rand = mulberry32(4242);
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var u = count > 1 ? i / (count - 1) : 0;
      out[i] = (0.55 + 0.45 * rand()) * (1 - 0.35 * u * u);
    }
    return out;
  }

  /** Hairline heights, px: squared, weighted and capped at HAIR_MAX. */
  function hairHeights(values, weights, intensity) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      var v = positive(values[i]);
      out[i] = Math.min(HAIR_MAX, v * v * weights[i] * HAIR_MAX * intensity);
    }
    return out;
  }

  /**
   * The shooting star at this song time, or null. The song is cut into SHOOT_EVERY-second
   * slots; each slot's star (if it has one) is seeded by the slot's number, so a section shows
   * exactly the stars the full render shows. Returns its tail (x0, y0), head (x1, y1) and
   * brightness.
   */
  function shootingStar(songTime, mulberry32) {
    var s = songTime || 0;
    var slot = Math.floor(s / SHOOT_EVERY);
    var rand = mulberry32(7919 + slot * 131);
    var chance = rand();
    var start = slot * SHOOT_EVERY + 0.3 + rand() * (SHOOT_EVERY - 2 * SHOOT_LIFE);
    var x = 160 + rand() * 1600;
    var y = 30 + rand() * 170;
    var dir = x < 560 ? 1 : x > 1360 ? -1 : rand() < 0.5 ? -1 : 1;
    var angle = ((10 + rand() * 18) * Math.PI) / 180;
    var dist = 260 + rand() * 160;
    if (chance > SHOOT_CHANCE) return null;
    var age = s - start;
    if (age < 0 || age > SHOOT_LIFE) return null;
    var p = age / SHOOT_LIFE;
    var dx = dir * Math.cos(angle),
      dy = Math.sin(angle);
    var travelled = dist * (1 - (1 - p) * (1 - p));
    var tail = Math.min(travelled, 0.45 * dist) * (1 - 0.4 * p);
    var hx = x + dx * travelled,
      hy = y + dy * travelled;
    return {
      x0: hx - dx * tail,
      y0: hy - dy * tail,
      x1: hx,
      y1: hy,
      alpha: clamp01(Math.sin(Math.PI * p) * 1.4),
    };
  }

  /** Smoothly interpolated value noise between knots. */
  function smooth(knots, x) {
    var i = Math.min(knots.length - 2, Math.max(0, Math.floor(x)));
    var f = x - i;
    f = f * f * (3 - 2 * f);
    return knots[i] + (knots[i + 1] - knots[i]) * f;
  }

  /**
   * The night sky: STAR_COUNT stars (a third gathered along the Milky Way, fewer and dimmer
   * toward the horizon, a few twinkling) and the land's ridge, a height every RIDGE_STEP px,
   * flat under the dish and rising into low hills toward the edges. The same every time.
   */
  function buildSky(mulberry32) {
    var rand = mulberry32(2026);
    var stars = new Float32Array(STAR_COUNT * STAR_STRIDE);
    var bx = MILKY[2] - MILKY[0],
      by = MILKY[3] - MILKY[1];
    var blen = Math.sqrt(bx * bx + by * by);
    var nx = -by / blen,
      ny = bx / blen;
    for (var i = 0; i < STAR_COUNT; i++) {
      var x = 0,
        y = 0;
      var inBand = i % 3 === 0;
      for (var tries = 0; tries < 50; tries++) {
        if (inBand) {
          var t = rand();
          var g = (rand() + rand() + rand() - 1.5) * 1.3 * MILKY[4];
          x = MILKY[0] + bx * t + nx * g;
          y = MILKY[1] + by * t + ny * g;
        } else {
          x = rand() * 1920;
          y = Math.pow(rand(), 1.2) * (HORIZON_Y - 30);
        }
        if (x >= 0 && x <= 1920 && y >= 0 && y < HORIZON_Y - 30) break;
      }
      x = Math.max(0, Math.min(1920, x));
      y = Math.max(0, Math.min(HORIZON_Y - 30, y));
      var o = i * STAR_STRIDE;
      var r = rand();
      stars[o] = x;
      stars[o + 1] = y;
      stars[o + 2] = 0.8 + 1.7 * r * r * r;
      stars[o + 3] =
        (0.22 + 0.78 * rand() * rand()) * (0.3 + 0.7 * smoothstep(HORIZON_Y, HORIZON_Y - 420, y));
      var twinkles = rand() < TWINKLE_SHARE;
      stars[o + 4] = twinkles ? 3 + 4 * rand() : 0;
      stars[o + 5] = rand() * 2 * Math.PI;
      if (twinkles) stars[o + 3] = Math.max(stars[o + 3], 0.55); // a twinkle you can see
    }
    var ridgeRand = mulberry32(77);
    var coarse = [],
      fine = [];
    for (var c = 0; c <= 13; c++) coarse.push(2 * ridgeRand() - 1); // every 160 px
    for (var f = 0; f <= 49; f++) fine.push(2 * ridgeRand() - 1); // every 40 px
    var n = Math.round(1920 / RIDGE_STEP) + 1;
    var ridge = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var px = k * RIDGE_STEP;
      var away = Math.abs(px - DISH_X);
      var open = smoothstep(40, 260, away); // 0 under the dish
      var edge = away / 960;
      var noise = 0.72 * smooth(coarse, px / 160) + 0.28 * smooth(fine, px / 40);
      ridge[k] = HORIZON_Y + open * (7 - 15 * edge * edge - noise * (6 + 8 * edge));
    }
    return { stars: stars, ridge: ridge };
  }

  /** A star's brightness at this song time: steady, or slowly twinkling. */
  function starLevel(sky, index, songTime) {
    var o = index * STAR_STRIDE;
    var b = sky.stars[o + 3];
    var period = sky.stars[o + 4];
    if (!(period > 0)) return b;
    return clamp01(
      b * (0.55 + 0.45 * Math.sin((2 * Math.PI * songTime) / period + sky.stars[o + 5])),
    );
  }

  /** The horizon glow: up to GLOW_LOUD brighter when the music is loud. */
  function glowLevel(loud) {
    return 1 + GLOW_LOUD * clamp01(loud);
  }

  /** The lens streak behind the title: always there, brighter when loud. */
  function streakLevel(loud) {
    return 0.55 + 0.45 * clamp01(loud);
  }

  /** The title's scale on the beat. */
  function titleScale(env, on) {
    return on ? 1 + PULSE * clamp01(env) : 1;
  }

  var api = {
    HORIZON_Y: HORIZON_Y,
    DISH_X: DISH_X,
    DISH_HEIGHT: DISH_HEIGHT,
    PIVOT_Y: PIVOT_Y,
    AIM_MAX: AIM_MAX,
    AIM_PERIOD: AIM_PERIOD,
    RAY_CY: RAY_CY,
    RAY_INNER: RAY_INNER,
    RAY_MAX: RAY_MAX,
    HAIR_MAX: HAIR_MAX,
    HAIR_WIDTH: HAIR_WIDTH,
    HAIR_NEAR: HAIR_NEAR,
    HAIR_FAR: HAIR_FAR,
    SHOOT_EVERY: SHOOT_EVERY,
    SHOOT_LIFE: SHOOT_LIFE,
    STAR_COUNT: STAR_COUNT,
    STAR_STRIDE: STAR_STRIDE,
    RIDGE_STEP: RIDGE_STEP,
    TITLE_Y: TITLE_Y,
    PULSE_RELEASE: PULSE_RELEASE,
    MILKY: MILKY,
    dishAim: dishAim,
    dishTurn: dishTurn,
    dishShape: dishShape,
    rayCount: rayCount,
    rayLengths: rayLengths,
    rayWeights: rayWeights,
    hairCount: hairCount,
    hairOffsets: hairOffsets,
    hairWeights: hairWeights,
    hairHeights: hairHeights,
    shootingStar: shootingStar,
    buildSky: buildSky,
    starLevel: starLevel,
    glowLevel: glowLevel,
    streakLevel: streakLevel,
    titleScale: titleScale,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.DishMotion = api;
})();
