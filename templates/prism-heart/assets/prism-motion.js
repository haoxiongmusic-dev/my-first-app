/*
 * Prism Heart's geometry and motion: the glass crystal's shape, and how the crystal, its ring
 * of dots, the glow and the bokeh follow the music. Everything is worked out from the song
 * time alone (looking back a little where a movement needs a past), so any frame can be drawn
 * on its own and every render is identical. Random numbers come only from the toolkit's
 * seeded mulberry32, passed in. Pure: no DOM and no three.js, so Vitest tests it directly.
 *
 * The crystal is in three.js units (y up); the ring and bokeh are in 1080p screen pixels.
 */
(function () {
  "use strict";

  var DEG = Math.PI / 180;
  var PULSE_RELEASE = 0.25;
  var FLASH_LIFE = 0.4; // seconds a hit's edge flash lasts
  var FLASH_GAIN = 0.8;
  var RING = { x: 1180, y: 540, r: 330, max: 110 }; // centre, radius, longest bar (px)

  /**
   * The crystal: a six-sided prism with pyramid tips, its corners nudged so the facets look
   * natural. Non-indexed triangles with flat outward normals. `edges` holds each vertex's
   * barycentric corner, so the shader can draw the facet edges; the diagonal of each side
   * face is hidden by fixing the far vertex's component at 1 on all three vertices.
   */
  function buildCrystal(mulberry32) {
    var rand = mulberry32(9);
    var R = 0.75,
      HALF = 0.85,
      TIP = 1.55,
      JITTER = 0.05;
    function nudge() {
      return (2 * rand() - 1) * JITTER;
    }
    var top = [],
      bottom = [];
    for (var i = 0; i < 6; i++) {
      var a = (i * Math.PI) / 3;
      top.push([R * Math.cos(a) + nudge(), HALF + nudge(), R * Math.sin(a) + nudge()]);
      bottom.push([R * Math.cos(a) + nudge(), -HALF + nudge(), R * Math.sin(a) + nudge()]);
    }
    var tipTop = [nudge(), TIP, nudge()];
    var tipBottom = [nudge(), -TIP, nudge()];

    var positions = [],
      normals = [],
      edges = [];
    /** One triangle; `hide` is the index (0..2) of the vertex whose opposite edge is hidden. */
    function triangle(p0, p1, p2, hide) {
      var pts = [p0, p1, p2];
      var n = faceNormal(p0, p1, p2);
      var centroid = [0, 1, 2].map(function (k) {
        return (p0[k] + p1[k] + p2[k]) / 3;
      });
      if (n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2] < 0) {
        // wound inward: swap the last two corners (and the hidden corner with them)
        pts = [p0, p2, p1];
        n = [-n[0], -n[1], -n[2]];
        if (hide === 1) hide = 2;
        else if (hide === 2) hide = 1;
      }
      for (var v = 0; v < 3; v++) {
        positions.push(pts[v][0], pts[v][1], pts[v][2]);
        normals.push(n[0], n[1], n[2]);
        var e = [0, 0, 0];
        e[v] = 1;
        if (hide !== undefined) e[hide] = 1;
        edges.push(e[0], e[1], e[2]);
      }
    }
    for (var s = 0; s < 6; s++) {
      var t0 = top[s],
        t1 = top[(s + 1) % 6],
        b0 = bottom[s],
        b1 = bottom[(s + 1) % 6];
      triangle(t0, t1, b1, 1); // the diagonal t0–b1 is opposite t1
      triangle(t0, b1, b0, 2); // the diagonal t0–b1 is opposite b0
      triangle(tipTop, t1, t0);
      triangle(tipBottom, b0, b1);
    }
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      edges: new Float32Array(edges),
    };
  }

  function faceNormal(a, b, c) {
    var ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    var vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    var nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  /** How far the crystal has turned (y) and how it tilts (x), in radians. */
  function turnAngles(songTime, spinPct) {
    return {
      y: 12 * DEG * songTime * (spinPct / 100),
      x: 6 * DEG * Math.sin((2 * Math.PI * songTime) / 9),
    };
  }

  /** The crystal's scale on the beat: up to 5 % bigger at a full beat and intensity 1. */
  function crystalScale(env, intensity) {
    return 1 + 0.05 * env * intensity;
  }

  /** The facet edges' extra brightness: a hit's strength × 0.8, fading over 0.4 s. */
  function edgeFlash(audio, t) {
    var hits = audio.recentHits(t, 4);
    var flash = 0;
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0];
      if (age < FLASH_LIFE)
        flash = Math.max(flash, hits[i][1] * FLASH_GAIN * (1 - age / FLASH_LIFE));
    }
    return flash;
  }

  /** How far the rainbow sheen's hue moves with loudness, in turns. */
  function sheenShift(loud) {
    return loud / 3;
  }

  /** The glow behind the crystal: brighter when the music is loud. */
  function glowLevel(loud, intensity) {
    return Math.min(1, 0.5 + 0.5 * loud * intensity);
  }

  /** Ring bar lengths in px. Squared, so quiet bands drop back and peaks stand out. */
  function ringLengths(values, intensity) {
    var out = new Float32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      out[i] = Math.min(RING.max, values[i] * values[i] * RING.max * intensity);
    }
    return out;
  }

  /** The Bands setting as the number of points around the ring. */
  function ringCount(V, pct) {
    return V.bandsToRingCount(pct, 160);
  }

  /** The Band thickness setting (10..100 %) as a dot size in px (2..8). */
  function dotSize(thicknessPct) {
    return 2 + (6 * (thicknessPct - 10)) / 90;
  }

  /** 40 soft discs: [x, y, radius, colour mix, phase, speed] each, the same every time. */
  function buildBokeh(mulberry32) {
    var rand = mulberry32(3);
    var out = new Float32Array(40 * 6);
    for (var i = 0; i < 40; i++) {
      out[6 * i] = rand() * 1920;
      out[6 * i + 1] = rand() * 1080;
      out[6 * i + 2] = 30 + 130 * rand();
      out[6 * i + 3] = rand();
      out[6 * i + 4] = rand() * 2 * Math.PI;
      out[6 * i + 5] = 0.05 + 0.1 * rand();
    }
    return out;
  }

  /** Where a disc has drifted to at this song time. */
  function bokehAt(disc, songTime) {
    return [
      disc[0] + 24 * Math.sin(songTime * disc[5] + disc[4]),
      disc[1] + 16 * Math.cos(songTime * disc[5] * 0.8 + disc[4]),
    ];
  }

  /** The bokeh brightens a little with loudness. */
  function bokehLevel(loud) {
    return 1 + 0.1 * loud;
  }

  /** The grain pattern's number: changes 6 times a second (grain rule). */
  function grainSeed(songTime) {
    return Math.floor(songTime * 6 + 1e-6);
  }

  var api = {
    PULSE_RELEASE: PULSE_RELEASE,
    RING: RING,
    buildCrystal: buildCrystal,
    turnAngles: turnAngles,
    crystalScale: crystalScale,
    edgeFlash: edgeFlash,
    sheenShift: sheenShift,
    glowLevel: glowLevel,
    ringLengths: ringLengths,
    ringCount: ringCount,
    dotSize: dotSize,
    buildBokeh: buildBokeh,
    bokehAt: bokehAt,
    bokehLevel: bokehLevel,
    grainSeed: grainSeed,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.PrismMotion = api;
})();
