/*
 * Iron Wraith's skull, built from voxels (unit cubes on a whole-number grid), facing +z.
 * Pure and deterministic: no DOM, no three.js, so Vitest tests it directly.
 *
 * buildSkull() returns { head, jaw, cables, eyes, jawPivot }:
 *   - each part is a list of voxels [x, y, z, shade]; only voxels you can see are kept
 *     (solid with at least one empty neighbour), so the skull stays fast to draw
 *   - jaw voxels are in head coordinates; the template hinges them at jawPivot
 *   - shade picks a brightness from SHADES: 1 chrome, 2 seam, 3 shadow, 4 bright, 5 gunmetal
 * Shapes are ported from the approved 2026-11-05 sketch.
 */
(function () {
  "use strict";

  var SHADES = { 1: 0.92, 2: 0.28, 3: 0.1, 4: 1.0, 5: 0.42 };
  var JAW_PIVOT = [0, -10, -3];

  /** Inside the ellipsoid centred (cx, cy, cz) with radii (rx, ry, rz)? */
  function E(x, y, z, cx, cy, cz, rx, ry, rz) {
    var a = (x - cx) / rx,
      b = (y - cy) / ry,
      c = (z - cz) / rz;
    return a * a + b * b + c * c <= 1;
  }

  /** How far forward the teeth sit at column x (the dental arch). */
  function toothFront(x) {
    return Math.round(13 - (x * x) / 14);
  }
  /** Teeth are two columns wide with a one-column gap, centred on a gap at x = 0. */
  function isTooth(x) {
    return (x + 30) % 3 !== 0;
  }

  /** Cranium, face, brows, sockets, nose, vents, temple bolts and upper teeth. */
  function upper(x, y, z) {
    var ax = Math.abs(x);
    if (ax >= 18 && ax <= 19 && y >= 0 && y <= 3 && z >= -1 && z <= 2) return 4; // temple bolts
    if (y >= -15 && y <= -13 && ax <= 8) {
      var f = toothFront(x);
      if (z <= f && z >= f - 2) return isTooth(x) ? 4 : 0;
      if (z === f - 3) return 3; // dark plate behind the teeth
      return 0;
    }
    var browTop = 2.5 + 0.45 * (ax - 3); // angry brows: lower towards the middle
    var solid =
      E(x, y, z, 0, 9, -2, 19, 19, 18) || // cranium
      E(x, y, z, 0, -3, 1, 16.5, 11, 15) || // face and cheekbones
      E(x, y, z, 0, -10, 4, 11, 6, 10.5) || // upper jaw
      (E(ax, y, z, 8, browTop + 1, 11, 7.5, 2.4, 6) && ax >= 2); // brow ledge
    if (!solid || y < -12.5) return 0;
    if (E(ax, y, z, 7.5, -0.5, 14, 6, 5, 10) && y < browTop) return 0; // eye sockets
    if (y >= -9 && y <= -3 && z > 6 && ax <= 0.6 + (y + 9) * 0.28) return 0; // nose
    if (y > 20 && z > -2 && z < 8 && (ax === 2 || ax === 4)) return 0; // vents
    if (E(ax, y, z, 7.5, -0.5, 14, 7.6, 6.6, 11.6) && y < browTop + 1) return 3; // socket walls
    if (y >= -9 && y <= -2 && z > 4 && ax <= 1.8 + (y + 9) * 0.28) return 3; // nose walls
    if ((x === 0 && y > 8) || (y === 13 && ax > 6) || (ax === 12 && y < -4 && y > -12)) return 2;
    return 1;
  }

  /** Lower jaw: chin, the hinge arms up to the ears, and the lower teeth. */
  function jawRaw(x, y, z) {
    var ax = Math.abs(x);
    if (y >= -18 && y <= -16 && ax <= 8) {
      var f = toothFront(x) - 1;
      if (z <= f && z >= f - 2) return isTooth(x) ? 4 : 0;
      if (z === f - 3) return 3;
      return 0;
    }
    var solid =
      (E(x, y, z, 0, -22, 1, 12, 5, 11) && y <= -19) ||
      (ax >= 11 && ax <= 13 && y >= -21 && y <= -9 && z >= -5 && z <= 1);
    if (!solid) return 0;
    if ((y === -22 && z > 2) || (ax === 11 && y > -19)) return 2;
    return 1;
  }

  /** Ribbed neck, behind the jaw. */
  function neck(x, y, z) {
    var ax = Math.abs(x);
    if (!(ax <= 5 && y >= -40 && y <= -22 && z >= -8 && z <= 1)) return 0;
    return (y + 60) % 3 === 0 ? 2 : 5;
  }

  // Parts never share space: the head wins over the jaw, the jaw over the neck.
  function head(x, y, z) {
    return upper(x, y, z) || (jawRaw(x, y, z) ? 0 : neck(x, y, z));
  }
  function jaw(x, y, z) {
    return upper(x, y, z) ? 0 : jawRaw(x, y, z);
  }

  /** The voxels of shape fn inside the box that touch empty space. */
  function surface(fn, box) {
    var out = [];
    for (var x = box[0]; x <= box[1]; x++) {
      for (var y = box[2]; y <= box[3]; y++) {
        for (var z = box[4]; z <= box[5]; z++) {
          var shade = fn(x, y, z);
          if (!shade) continue;
          if (
            fn(x + 1, y, z) &&
            fn(x - 1, y, z) &&
            fn(x, y + 1, z) &&
            fn(x, y - 1, z) &&
            fn(x, y, z + 1) &&
            fn(x, y, z - 1)
          ) {
            continue;
          }
          out.push([x, y, z, shade]);
        }
      }
    }
    return out;
  }

  /** A point on the Catmull-Rom curve through pts (end points repeated), u in [0, 1]. */
  function catmullRom(pts, u) {
    var n = pts.length - 1;
    var s = Math.min(n - 1e-9, u * n);
    var i = Math.floor(s),
      f = s - i;
    var p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(n, i + 2)];
    var out = [];
    for (var k = 0; k < 3; k++) {
      out.push(
        0.5 *
          (2 * p1[k] +
            (-p0[k] + p2[k]) * f +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f),
      );
    }
    return out;
  }

  // Cables hanging from under the skull into the dark (right side; mirrored for the left).
  var CABLE_PATHS = [
    [
      [9, -14, -4],
      [13, -26, -2],
      [15, -38, 2],
      [14, -52, 4],
    ],
    [
      [6, -20, -6],
      [8, -30, -4],
      [7, -42, -2],
      [9, -56, 0],
    ],
    [
      [12, -10, -8],
      [18, -22, -8],
      [21, -36, -6],
      [20, -54, -4],
    ],
    [
      [3, -24, -9],
      [3, -34, -10],
      [4, -46, -9],
      [3, -58, -9],
    ],
  ];

  function cables() {
    var seen = {};
    var out = [];
    function add(x, y, z) {
      var k = x + "," + y + "," + z;
      if (seen[k] || head(x, y, z) || jaw(x, y, z)) return;
      seen[k] = true;
      out.push([x, y, z, 1]);
    }
    for (var c = 0; c < CABLE_PATHS.length; c++) {
      for (var step = 0; step <= 250; step++) {
        var p = catmullRom(CABLE_PATHS[c], step / 250);
        // Round the right side, then mirror exactly, so both sides match voxel for voxel.
        var x = Math.round(p[0]),
          y = Math.round(p[1]),
          z = Math.round(p[2]);
        var cross = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ];
        for (var q = 0; q < cross.length; q++) {
          var cx = x + cross[q][0];
          if (cx <= 0) continue; // the right side only; x = 0 would duplicate on mirroring
          add(cx, y, z + cross[q][1]);
          add(-cx, y, z + cross[q][1]);
        }
      }
    }
    return out;
  }

  /** Two plus-shaped glowing eyes deep in the sockets, centred at x = ±7.5, y = -0.5. */
  function eyes() {
    var out = [];
    var plus = [
      [7, -1],
      [8, -1],
      [7, 0],
      [8, 0], // centre
      [6, -1],
      [6, 0],
      [9, -1],
      [9, 0], // arms left and right
      [7, -2],
      [8, -2],
      [7, 1],
      [8, 1], // arms below and above
    ];
    for (var i = 0; i < plus.length; i++) {
      for (var z = 7; z <= 8; z++) {
        out.push([plus[i][0], plus[i][1], z, 4]);
        out.push([-plus[i][0], plus[i][1], z, 4]);
      }
    }
    return out;
  }

  function buildSkull() {
    return {
      head: surface(head, [-21, 21, -41, 30, -22, 20]),
      jaw: surface(jaw, [-14, 14, -28, -8, -11, 14]),
      cables: cables(),
      eyes: eyes(),
      jawPivot: JAW_PIVOT.slice(),
    };
  }

  var api = { buildSkull: buildSkull, SHADES: SHADES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.IronWraithSkull = api;
})();
