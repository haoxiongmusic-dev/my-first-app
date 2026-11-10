/*
 * Late Show's television, built from voxels (unit cubes on a whole-number grid), facing +z and
 * seen nearly head-on: a thick grey plastic bezel with rounded corners, a stepped bevel down to
 * the screen, and a sliver of the darker cabinet behind it at the frame's edges.
 * Pure and deterministic: no DOM, no three.js, so Vitest tests it directly.
 *
 * buildTV() returns { bezel, cabinet, led, screen }:
 *   - bezel, cabinet and led are lists of voxels [x, y, z, shade]; shade picks a brightness from
 *     SHADES (1 plastic face, 2 bevel, 3 tunnel, 4 outer lip, 6 cabinet, 7 cabinet seam, 8 power
 *     light)
 *   - screen: the opening { halfW, halfH, radius } (a rounded rectangle centred on 0, 0), the
 *     depth z the screen's glass sits at round its edge, and rim, the depth of the tunnel's lip
 * The model is a height field: every (x, y) column has a top depth, and each column is filled
 * down only as far as a neighbour is lower, so only voxels you can see are kept.
 */
(function () {
  "use strict";

  var SHADES = { 1: 0.6, 2: 0.68, 3: 0.3, 4: 0.56, 6: 0.17, 7: 0.155, 8: 1.0 };
  // the opening: 119 × 67 voxel columns (16:9), its edge half a voxel past the outer columns
  var OPEN = { hx: 59.5, hy: 33.5, r: 6.5 };
  // the bezel's outside edge
  var OUTER = { hx: 70.5, hy: 41.5, r: 11 };
  // the cabinet sliver round it (square: its corners are outside the frame)
  var CAB = { hx: 82, hy: 49 };
  var RIM = -4; // the tunnel's lip, just outside the opening
  var BEVEL = 4; // voxels of stepped bevel from the lip up to the face
  var ROLL = 4; // the outside edge rounds over across this many voxels …
  var ROLL_DEPTH = 3; // … dropping this many
  var WALL_FLOOR = -10; // the tunnel's walls reach down to here, behind the screen's edge
  var SCREEN_Z = -9; // the screen's glass at its edge (it bulges forward towards its centre)
  var CABINET_Z = -3;
  var NONE = -1000;

  /** Signed distance from (x, y) to a rounded rectangle centred on 0, 0 (negative inside). */
  function roundRect(x, y, hx, hy, r) {
    var qx = Math.abs(x) - hx + r;
    var qy = Math.abs(y) - hy + r;
    var ox = Math.max(qx, 0),
      oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
  }

  /** Is the column at (x, y) inside the screen's opening? */
  function insideOpening(x, y) {
    return roundRect(x, y, OPEN.hx, OPEN.hy, OPEN.r) < 0;
  }

  /** The power light: a small block standing out of the bezel's bottom-right corner. */
  function powerLight(x, y) {
    return (x === 63 || x === 64) && (y === -36 || y === -37);
  }

  /** The column at (x, y): [top depth, shade, floor depth], or null where there is nothing. */
  function column(x, y) {
    if (Math.abs(x) > CAB.hx || Math.abs(y) > CAB.hy) return null;
    var dIn = roundRect(x, y, OPEN.hx, OPEN.hy, OPEN.r); // > 0 outside the opening
    if (dIn < 0) return null;
    var dOut = -roundRect(x, y, OUTER.hx, OUTER.hy, OUTER.r); // > 0 inside the bezel
    if (dOut <= 0) {
      // the cabinet, set back; a seam every fourth row gives the plastic a moulded texture
      return [CABINET_Z, (y + 400) % 4 === 0 ? 7 : 6, CABINET_Z];
    }
    if (dIn <= 1) return [RIM, 3, WALL_FLOOR]; // the tunnel's lip and walls
    if (powerLight(x, y)) return [1, 8, NONE];
    // the stepped bevel down to the screen: one voxel lower for each voxel nearer the opening
    var inner = dIn <= 1 + BEVEL ? RIM + Math.ceil(dIn - 1) : 0;
    // the outside edge rolls over in a quarter circle, like moulded plastic
    var u = Math.max(0, 1 - dOut / ROLL);
    var outer = -Math.round(ROLL_DEPTH * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
    if (inner < 0 && inner <= outer) return [inner, 2, NONE];
    if (outer < 0) return [outer, 4, NONE];
    return [0, 1, NONE];
  }

  function buildTV() {
    var bezel = [],
      cabinet = [],
      led = [];
    var grid = {};
    var x, y;
    for (x = -CAB.hx - 1; x <= CAB.hx + 1; x++) {
      for (y = -CAB.hy - 1; y <= CAB.hy + 1; y++) grid[x + "," + y] = column(x, y);
    }
    function top(px, py) {
      var c = grid[px + "," + py];
      return c ? c[0] : NONE;
    }
    for (x = -CAB.hx; x <= CAB.hx; x++) {
      for (y = -CAB.hy; y <= CAB.hy; y++) {
        var c = grid[x + "," + y];
        if (!c) continue;
        var lowest = Math.min(top(x + 1, y), top(x - 1, y), top(x, y + 1), top(x, y - 1));
        // fill down only as far as a neighbour is lower (no hidden voxels), and never below
        // the column's own floor
        var bottom = Math.max(c[2], Math.min(c[0], lowest + 1));
        var part = c[1] === 8 ? led : c[1] === 6 || c[1] === 7 ? cabinet : bezel;
        for (var z = c[0]; z >= bottom; z--) part.push([x, y, z, c[1]]);
      }
    }
    return {
      bezel: bezel,
      cabinet: cabinet,
      led: led,
      screen: { halfW: OPEN.hx, halfH: OPEN.hy, radius: OPEN.r, z: SCREEN_Z, rim: RIM },
    };
  }

  var api = { buildTV: buildTV, SHADES: SHADES, insideOpening: insideOpening };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.LateShowTV = api;
})();
