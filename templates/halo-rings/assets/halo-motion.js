/*
 * Halo Rings' motion: how the three rings, the pulse and the shake follow the music, and the
 * dusk sky they float in. Everything is worked out from the song time alone (the toolkit's
 * beatEnvelope looks back a little), so any frame can be drawn on its own and every render is
 * identical. Random numbers come only from the toolkit's seeded mulberry32, passed in. Pure:
 * no DOM, so Vitest tests it directly.
 *
 * Sizes are 1080p pixels.
 */
(function () {
  "use strict";

  // Inner, middle and outer ring: base radius (px), points at 100 % Bands, spin (°/s).
  var RINGS = [
    { radius: 250, full: 72, spin: 2 },
    { radius: 325, full: 96, spin: -1.5 },
    { radius: 400, full: 120, spin: 1 },
  ];
  var BAR_SCALE = 48; // px of bar for a full-scale band at intensity 1
  var BAR_MAX = 56; // px: a bar never reaches the next ring (75 px apart)
  var PULSE_RELEASE = 0.2; // seconds for the beat pulse to fall to about a third
  var PULSE = 0.05; // scale added by a full beat at intensity 1
  var SHAKE = 8; // px moved by a full beat at intensity 1
  var SHAKE_RATE = 30; // the shake picks a new direction this often per second of song

  /** Ring 0, 1 or 2's third of the spectrum (low, middle, high), never empty. */
  function ringThird(spectrum, ring) {
    var n = spectrum.length;
    var start = Math.min(n - 1, Math.floor((ring * n) / 3));
    var end = Math.min(n, Math.max(Math.floor(((ring + 1) * n) / 3), start + 1));
    var out = new Float32Array(end - start);
    for (var i = start; i < end; i++) out[i - start] = spectrum[i];
    return out;
  }

  /** Bar lengths in px, outward from the ring. */
  function barLengths(values, intensity) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      out[i] = Math.min(BAR_MAX, values[i] * BAR_SCALE * intensity);
    }
    return out;
  }

  /** How far ring 0, 1 or 2 has turned at this song time, in radians. */
  function spinAngle(ring, songTime, spinPct) {
    return (((RINGS[ring].spin * songTime * spinPct) / 100) * Math.PI) / 180;
  }

  /** The halo's scale on the beat: up to 5 % bigger at a full beat and intensity 1. */
  function pulseScale(env, intensity, on) {
    return on ? 1 + PULSE * env * intensity : 1;
  }

  /**
   * How far the halo is shaken, [dx, dy] px. The direction is seeded by the song frame, so a
   * section of the song shakes exactly like the full render.
   */
  function shakeOffset(env, intensity, songTime, on, mulberry32) {
    if (!on || env <= 0) return [0, 0];
    var angle = 2 * Math.PI * mulberry32(Math.floor(songTime * SHAKE_RATE))();
    var len = SHAKE * env * intensity;
    return [Math.cos(angle) * len, Math.sin(angle) * len];
  }

  /** Glow strength: brighter when the music is loud. */
  function glowLevel(loud) {
    return 0.6 + 0.4 * loud;
  }

  /**
   * The dusk sky: three mountain ridgelines (97 heights, x every 20 px across the frame; far,
   * middle, near) and 300 stars [x, y, size, brightness] in the top 60 %. The same every time.
   */
  function buildSky(mulberry32) {
    var rand = mulberry32(7);
    var bases = [700, 760, 840];
    var amps = [60, 80, 110];
    var ridges = [];
    for (var r = 0; r < 3; r++) {
      var coarse = [],
        fine = [];
      for (var c = 0; c <= 12; c++) coarse.push(2 * rand() - 1); // every 160 px
      for (var f = 0; f <= 48; f++) fine.push(2 * rand() - 1); // every 40 px
      var ridge = new Float32Array(97);
      for (var i = 0; i < 97; i++) {
        var x = i * 20;
        var noise = 0.75 * smooth(coarse, x / 160) + 0.25 * smooth(fine, x / 40);
        ridge[i] = bases[r] - noise * amps[r];
      }
      ridges.push(ridge);
    }
    var stars = new Float32Array(4 * 300);
    for (var s = 0; s < 300; s++) {
      stars[4 * s] = rand() * 1920;
      stars[4 * s + 1] = rand() * 648;
      stars[4 * s + 2] = 1 + 1.2 * rand();
      stars[4 * s + 3] = 0.3 + 0.7 * rand();
    }
    return { ridges: ridges, stars: stars };
  }

  /** Smoothly interpolated value noise between knots. */
  function smooth(knots, x) {
    var i = Math.min(knots.length - 2, Math.floor(x));
    var f = x - i;
    f = f * f * (3 - 2 * f);
    return knots[i] + (knots[i + 1] - knots[i]) * f;
  }

  var api = {
    RINGS: RINGS,
    BAR_SCALE: BAR_SCALE,
    BAR_MAX: BAR_MAX,
    PULSE_RELEASE: PULSE_RELEASE,
    ringThird: ringThird,
    barLengths: barLengths,
    spinAngle: spinAngle,
    pulseScale: pulseScale,
    shakeOffset: shakeOffset,
    glowLevel: glowLevel,
    buildSky: buildSky,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.HaloMotion = api;
})();
