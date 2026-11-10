/*
 * Moon Jelly's jellyfish, built from voxels (unit cubes on a whole-number grid), y up, the bell's
 * rim at y = 0 round the y axis. Pure and deterministic: no DOM, no three.js, so Vitest tests it
 * directly. Built the way Iron Wraith builds its skull: shapes as functions over the grid.
 *
 * buildJelly(tier, seed) returns { radius, height, bell, rim, gonads, tentacles, arms }:
 *   - bell: a hollow, wide dome one voxel thick, open underneath, with a short skirt at its edge
 *     (drawn additively, its front and back shells overlap, so it reads as translucent and its
 *     edges, seen edge-on, glow brightest, as a real jellyfish's do)
 *   - rim: a frilled ring of scallops hanging just under the bell's edge
 *   - gonads: four horseshoe rings inside the top of the dome (the moon jelly's inner glow)
 *   - each of these is a list of voxels [x, y, z, shade]; the page scales them together with the
 *     bell's contraction
 *   - tentacles and arms are chains, re-posed by the page every frame:
 *     { anchor: [x, y, z], length: links, voxels: [[x, y, z, shade, k], …] } in their rest pose
 *     (hanging straight down from the anchor); k is the link a voxel belongs to, so the page moves
 *     each voxel by its link's offset. Tentacles: long, thin (one voxel a link), from the rim.
 *     Oral arms: four frilly ribbons from the middle of the underside.
 *   - shade picks the voxel's colour (SHADES): 1 body, 2 body (dim), 3 edge, 4 gonad,
 *     5 rim frill, 6 tentacle, 7 tentacle tip, 8 oral arm, 9 oral arm frill
 *
 * The tier sets the size of the grid: the big front jellyfish get the finest model, the far ones a
 * coarse one (they are small on screen anyway), so every jellyfish on screen together stays under
 * MAX_VOXELS. The seed only varies the details (tentacle lengths, frills, dim body voxels); the
 * bell's shape is shared by every jellyfish of a tier.
 */
(function () {
  "use strict";

  var MAX_VOXELS = 15000;
  var RADIUS = { front: 14, mid: 10, far: 6 }; // the bell's radius in voxels
  var DOME = 0.68; // the dome's height, as a share of its radius: wide, not tall
  var SHADES = {
    1: "body",
    2: "body-dim",
    3: "edge",
    4: "gonad",
    5: "frill",
    6: "tentacle",
    7: "tentacle-tip",
    8: "arm",
    9: "arm-frill",
  };
  var TENTACLES = { front: 16, mid: 12, far: 8 };

  /** The toolkit's seeded generator (copied: this module stands alone). */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sq(x) {
    return x * x;
  }

  /** The hollow dome, its skirt and the shade of each voxel. */
  function buildBell(R, H, r) {
    var out = [];
    function inside(x, y, z) {
      return y >= 0 && sq(Math.sqrt(x * x + z * z) / (R + 0.5)) + sq(y / (H + 0.5)) <= 1;
    }
    for (var y = -1; y <= H; y++) {
      for (var x = -R - 1; x <= R + 1; x++) {
        for (var z = -R - 1; z <= R + 1; z++) {
          var rad = Math.sqrt(x * x + z * z);
          var keep = false;
          if (y >= 0) {
            // the dome's outer surface only (a neighbour outside it, the open underside aside)
            keep =
              inside(x, y, z) &&
              !(
                inside(x + 1, y, z) &&
                inside(x - 1, y, z) &&
                inside(x, y, z + 1) &&
                inside(x, y, z - 1) &&
                inside(x, y + 1, z)
              );
          } else {
            // the skirt: the bell's edge curls down a voxel
            keep = rad <= R + 0.5 && rad >= R - 1.5;
          }
          if (!keep) continue;
          var shade = 1;
          if (rad > R * 0.74 || y <= 0) shade = 3;
          else if (r() < 0.22) shade = 2;
          out.push([x, y, z, shade]);
        }
      }
    }
    return out;
  }

  /** A ring of scallops just under the bell's edge (y -2 .. -3). */
  function buildRim(R) {
    var out = [];
    var seen = {};
    var lobes = R >= 12 ? 16 : R >= 9 ? 12 : 8;
    var steps = Math.ceil(2 * Math.PI * (R + 1) * 2);
    for (var i = 0; i < steps; i++) {
      var a = (i / steps) * 2 * Math.PI;
      // each scallop hangs lowest in its middle
      var lobe = Math.abs(Math.sin((a * lobes) / 2));
      var x = Math.round(Math.cos(a) * (R - 0.3));
      var z = Math.round(Math.sin(a) * (R - 0.3));
      var depth = lobe > 0.45 ? 2 : 1;
      for (var d = 1; d <= depth; d++) {
        var y = -1 - d;
        var k = x + "," + y + "," + z;
        if (seen[k]) continue;
        seen[k] = true;
        out.push([x, y, z, 5]);
      }
    }
    return out;
  }

  /** Four horseshoe rings inside the top of the dome, opening toward its middle. */
  function buildGonads(R, H) {
    var out = [];
    var seen = {};
    var centre = R * 0.38;
    var ring = Math.max(1.2, R * 0.2);
    for (var q = 0; q < 4; q++) {
      var a = Math.PI / 4 + (q * Math.PI) / 2;
      var cx = Math.cos(a) * centre,
        cz = Math.sin(a) * centre;
      var steps = Math.ceil(2 * Math.PI * ring * 3);
      for (var i = 0; i < steps; i++) {
        var b = (i / steps) * 2 * Math.PI;
        // the gap faces the bell's middle
        var toward = Math.cos(b - (a + Math.PI));
        if (toward > 0.82) continue;
        var x = Math.round(cx + Math.cos(b) * ring);
        var z = Math.round(cz + Math.sin(b) * ring);
        var rad = Math.sqrt(x * x + z * z);
        // just inside the dome's inner surface
        var y = Math.floor((H - 1.25) * Math.sqrt(Math.max(0, 1 - sq(rad / (R - 1.25))))) - 1;
        if (y < 1) y = 1;
        var k = x + "," + y + "," + z;
        if (seen[k]) continue;
        seen[k] = true;
        out.push([x, y, z, 4]);
      }
    }
    return out;
  }

  /** Long thin tentacles round the rim: one voxel a link, the last third dimmer. */
  function buildTentacles(R, count, r) {
    var out = [];
    var spin = r() * 0.4;
    for (var i = 0; i < count; i++) {
      var a = ((i + spin) / count) * 2 * Math.PI;
      var ax = Math.round(Math.cos(a) * (R - 0.6));
      var az = Math.round(Math.sin(a) * (R - 0.6));
      var ay = -2;
      var n = Math.round(R * (1.4 + 0.8 * r()));
      var voxels = [];
      for (var k = 0; k < n; k++) voxels.push([ax, ay - k, az, k > n * 0.66 ? 7 : 6, k]);
      out.push({ anchor: [ax, ay, az], length: n, voxels: voxels });
    }
    return out;
  }

  /**
   * Four frilly oral arms from the middle of the underside: each link a short ribbon across
   * (wider in the arm's middle), its edges frilled in and out from link to link.
   */
  function buildArms(R, r) {
    var out = [];
    for (var q = 0; q < 4; q++) {
      var a = (q * Math.PI) / 2 + 0.3;
      var ca = Math.cos(a),
        sa = Math.sin(a);
      var ax = Math.round(ca * R * 0.2);
      var az = Math.round(sa * R * 0.2);
      var ay = -1;
      var n = Math.round(R * (0.95 + 0.25 * r()));
      var voxels = [];
      for (var k = 0; k < n; k++) {
        var u = k / Math.max(1, n - 1);
        var half = Math.max(0, Math.round((R / 7) * Math.pow(Math.sin(Math.PI * u), 0.7)));
        var seen = {};
        for (var s = -half - 1; s <= half + 1; s++) {
          var edge = Math.abs(s) > half;
          // frills: the ribbon's edges stick out on some links and not others
          if (edge && r() < 0.5) continue;
          var x = Math.round(ax + ca * s);
          var z = Math.round(az + sa * s);
          var key = x + "," + z;
          if (seen[key]) continue;
          seen[key] = true;
          voxels.push([x, ay - k, z, edge || (half > 0 && Math.abs(s) === half) ? 9 : 8, k]);
        }
      }
      out.push({ anchor: [ax, ay, az], length: n, voxels: voxels });
    }
    return out;
  }

  /** A jellyfish of this tier ("front", "mid" or "far"); the seed varies its details. */
  function buildJelly(tier, seed) {
    var R = RADIUS[tier] || RADIUS.far;
    var H = Math.round(R * DOME);
    // the bell's dim voxels come from the tier alone, so every bell of a tier is the same
    var bell = buildBell(R, H, mulberry32(R * 7919 + 13));
    var r = mulberry32((seed | 0) * 2654435761 + R);
    return {
      radius: R,
      height: H,
      bell: bell,
      rim: buildRim(R),
      gonads: buildGonads(R, H),
      tentacles: buildTentacles(R, TENTACLES[tier] || TENTACLES.far, r),
      arms: buildArms(R, r),
    };
  }

  /** Every voxel of a jellyfish, chains included. */
  function countVoxels(j) {
    var n = j.bell.length + j.rim.length + j.gonads.length;
    for (var i = 0; i < j.tentacles.length; i++) n += j.tentacles[i].voxels.length;
    for (var k = 0; k < j.arms.length; k++) n += j.arms[k].voxels.length;
    return n;
  }

  var api = {
    MAX_VOXELS: MAX_VOXELS,
    RADIUS: RADIUS,
    SHADES: SHADES,
    buildJelly: buildJelly,
    countVoxels: countVoxels,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.JellyVoxels = api;
})();
