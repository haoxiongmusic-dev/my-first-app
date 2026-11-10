/*
 * Hyper Tunnel's chrome robot, built from voxels (unit cubes on a whole-number grid), waist up,
 * facing +z (toward the camera), y up. Pure and deterministic: no DOM, no three.js, so Vitest
 * tests it directly. Built the way Iron Wraith builds its skull: shapes as functions, then only
 * the voxels you can see are kept (solid, with an empty neighbour that is not straight behind:
 * the robot is only ever seen from the front).
 *
 * buildRobot() returns { head, visor, cable, torso, armL, armR, headPivot, shoulderL, shoulderR }:
 *   - each part is a list of voxels [x, y, z, shade], all in the robot's own coordinates; the page
 *     turns the head (with its visor and cable) about headPivot and each arm about its shoulder
 *   - head: the head with its chunky VR headset, strap and ear pods; visor: the headset's front
 *     panel (it glows; its rows are scan lines); cable: from the headset's side down behind the
 *     shoulder; torso: neck, collar, the segmented chest plate, abdomen and waist; armL / armR:
 *     shoulder guard, upper arm, elbow, forearm and an open hand (mirror images)
 *   - shade picks a brightness from SHADES: 1 chrome, 2 seam, 3 shadow, 4 bright edge,
 *     5 gunmetal, 6 rubber, 7 glossy black (the headset); the visor uses 1 (lit row) and 3 (dim
 *     row)
 * Voxel counts stay under MAX_VOXELS for the whole robot (a render-speed budget).
 */
(function () {
  "use strict";

  var MAX_VOXELS = 15000;
  var SHADES = { 1: 0.92, 2: 0.3, 3: 0.14, 4: 1.0, 5: 0.46, 6: 0.22, 7: 0.3 };
  var HEAD_PIVOT = [0, 27, -1];
  var SHOULDER = [24, 14, 0]; // the right shoulder; the left mirrors it

  // ---------- shape helpers ----------

  function sq(x) {
    return x * x;
  }
  /** Inside the ellipsoid centred (cx, cy, cz) with radii (rx, ry, rz)? */
  function E(x, y, z, cx, cy, cz, rx, ry, rz) {
    return sq((x - cx) / rx) + sq((y - cy) / ry) + sq((z - cz) / rz) <= 1;
  }
  /** A rounded box (a superellipsoid, power 4): its value is at most 1 inside. */
  function SE(x, y, z, cx, cy, cz, rx, ry, rz) {
    return sq(sq((x - cx) / rx)) + sq(sq((y - cy) / ry)) + sq(sq((z - cz) / rz));
  }
  /** Distance from p to the segment a-b, and how far along it (0..1) the nearest point is. */
  function seg(px, py, pz, a, b) {
    var dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    var len2 = dx * dx + dy * dy + dz * dz;
    var u = ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / len2;
    u = Math.max(0, Math.min(1, u));
    var qx = a[0] + dx * u - px,
      qy = a[1] + dy * u - py,
      qz = a[2] + dz * u - pz;
    return [Math.sqrt(qx * qx + qy * qy + qz * qz), u];
  }

  // ---------- the head ----------

  var SHELL = [0, 38, 0, 11, 12.5, 11]; // centre and radii of the rounded head
  var SET = { y: 41.5, rx: 14.6, ry: 7.2, back: 4, front: 17 }; // the headset box
  var VISOR = { rx: 11.6, ry: 4.4 }; // the visor panel inside the headset's front

  function shell(x, y, z) {
    return SE(x, y, z, SHELL[0], SHELL[1], SHELL[2], SHELL[3], SHELL[4], SHELL[5]);
  }
  /** The headset's outline across the face (power-4 rounded rectangle), at most 1 inside. */
  function setOutline(x, y) {
    return sq(sq(x / SET.rx)) + sq(sq((y - SET.y) / SET.ry));
  }
  function visorOutline(x, y) {
    return sq(sq(x / VISOR.rx)) + sq(sq((y - SET.y) / VISOR.ry));
  }
  /** The face's front (largest z inside the shell) at column (x, y), or -99 outside. */
  function faceFront(x, y) {
    var rest = 1 - sq(sq(x / SHELL[3])) - sq(sq((y - SHELL[1]) / SHELL[4]));
    if (rest <= 0) return -99;
    return Math.floor(SHELL[5] * Math.sqrt(Math.sqrt(rest)));
  }

  /** The headset: a chunky box over the eyes with a chrome rim round the visor, side pods. */
  function headset(x, y, z) {
    var ax = Math.abs(x);
    // side pods (the cable leaves the left one)
    if (ax >= 14 && ax <= 16 && y >= 38 && y <= 45 && z >= 6 && z <= 13) {
      return y === 41 || y === 42 ? 2 : ax === 16 ? 4 : 7;
    }
    var o = setOutline(x, y);
    if (o > 1 || z < SET.back || z > SET.front) return 0;
    // the front edge is bevelled: the outermost ring stops a voxel short
    if (z === SET.front && o > 0.72) return 0;
    if (z === SET.front) {
      if (visorOutline(x, y) <= 1) return 0; // the visor's place (its own part)
      return visorOutline(x, y) <= 1.5 ? 4 : 7; // a thin chrome rim round the visor
    }
    if (z === SET.front - 1 && o > 0.72) return 4; // the bevel catches the light
    if (z <= 6 && o > 0.55) return 2; // the seam where it meets the strap
    if (z === 11 && o > 0.6) return 2; // a seam round its middle
    return 7; // glossy black shell
  }

  /** The strap round the back of the head and over the top, just outside the shell. */
  function strap(x, y, z) {
    var s = shell(x, y, z);
    if (s <= 1 || s > 1.55) return 0;
    if (y >= 40 && y <= 43 && z <= 5) return 6;
    if (Math.abs(x) <= 2 && y > 43 && z <= 5 && z >= -9) return 6;
    return 0;
  }

  /** Round ear pods on the sides of the head, under the strap. */
  function ear(x, y, z) {
    var ax = Math.abs(x);
    if (ax < 10 || ax > 12) return 0;
    var r2 = sq(y - 33.5) + sq(z + 1);
    if (r2 > 12.5) return 0;
    if (ax === 12) return r2 <= 2.5 ? 4 : r2 > 8 ? 2 : 5;
    return 5;
  }

  /** The head shell itself: chrome, with a mouth grille and panel seams. */
  function face(x, y, z) {
    if (shell(x, y, z) > 1) return 0;
    var ax = Math.abs(x);
    // the mouth grille: three recessed slots
    if (ax <= 5 && (y === 28 || y === 30 || y === 32)) {
      var front = faceFront(x, y);
      if (z >= front) return 0;
      if (z === front - 1) return 3;
    }
    if (y === 34 && z > -6) return 2; // a seam round the face under the headset
    if (y >= 48 && z > 4) return 4; // the brow catches the light
    return 1;
  }

  function headRaw(x, y, z) {
    return headset(x, y, z) || ear(x, y, z) || face(x, y, z) || strap(x, y, z);
  }

  /** The visor panel: one layer in the headset's front opening, its rows the scan lines. */
  function visorRaw(x, y, z) {
    if (z !== SET.front || visorOutline(x, y) > 1) return 0;
    return y % 2 === 0 ? 1 : 3;
  }

  // ---------- the torso ----------

  /** The torso's half-width at height y: broad shoulders, a narrower abdomen, the waist. */
  function halfWidth(y) {
    if (y >= 12) return 21;
    if (y >= -2) return 14 + (7 * (y + 2)) / 14;
    if (y >= -22) return 13;
    return 15;
  }
  function halfDepth(y) {
    if (y >= -2) return 8.5;
    if (y >= -22) return 7.5;
    return 8;
  }
  var TORSO_BOTTOM = -34;
  var TORSO_TOP = 19;

  function neck(x, y, z) {
    if (y < 17 || y > 28) return 0;
    if (sq(x) + sq(z + 1) > 21) return 0;
    return y % 2 === 0 ? 5 : 2; // ribbed
  }
  /** The collar round the neck's foot. */
  function collar(x, y, z) {
    if (y < 18 || y > 20) return 0;
    var r2 = sq(x) + sq(z + 1);
    if (r2 > 90 || r2 < 30) return 0;
    return y === 20 ? 4 : 5;
  }

  /** The torso's solid body, before its grooves: true or false. */
  function torsoSolid(x, y, z) {
    if (y < TORSO_BOTTOM || y > TORSO_TOP) return false;
    var hw = halfWidth(y);
    var ax = Math.abs(x);
    // sloping shoulders: the top edge drops toward the arms
    if (y > TORSO_TOP - 5 * Math.pow(ax / 21, 4)) return false;
    var body = sq(sq(ax / hw)) + sq(sq((z + 0.5) / halfDepth(y))) <= 1;
    // the chest plate: flat armour standing a voxel proud, its top corners cut off
    var plate = y >= -1 && y <= 15 && ax <= 14 && y <= 15 - Math.max(0, ax - 9) && z >= 0 && z <= 9;
    return body || plate;
  }

  /** Grooves cut into the front: the chest plate's segments. */
  function isGroove(x, y) {
    var ax = Math.abs(x);
    if (y < -24 || y > 17) return false;
    if (x === 0) return true; // the centre line
    if (y === -2 && ax <= 15) return true; // under the chest plates
    if (y >= -22 && y < -2) {
      if (y === -8 || y === -14 || y === -20) return ax <= 11; // the abdomen's plates
    }
    if (y === -23 && ax <= 13) return true; // the belt line
    if (y === 6 && ax <= 13) return true; // across the chest plate
    return false;
  }

  var torsoFrontCache = null;
  /** The torso's front (largest solid z) per column, cached once. */
  function torsoFront(x, y) {
    if (!torsoFrontCache) {
      torsoFrontCache = {};
      for (var cx = -22; cx <= 22; cx++) {
        for (var cy = TORSO_BOTTOM; cy <= TORSO_TOP; cy++) {
          for (var cz = 12; cz >= -10; cz--) {
            if (torsoSolid(cx, cy, cz)) {
              torsoFrontCache[cx + "," + cy] = cz;
              break;
            }
          }
        }
      }
    }
    var f = torsoFrontCache[x + "," + y];
    return f === undefined ? -99 : f;
  }

  function torsoRaw(x, y, z) {
    var n = neck(x, y, z) || collar(x, y, z);
    if (n) return n;
    if (!torsoSolid(x, y, z)) return 0;
    var ax = Math.abs(x);
    var front = torsoFront(x, y);
    if (front > 3 && isGroove(x, y)) {
      if (z === front) return 0; // the groove is cut in
      if (z === front - 1) return 2;
    }
    // a bright bevel along the top of each plate (the row under a groove catches the light)
    if (z >= front - 1 && front > 3 && isGroove(x, y + 1) && !isGroove(x, y)) return 4;
    if (y < -23) return z > 3 ? 5 : 6; // the waist: gunmetal
    if (ax >= halfWidth(y) - 2 && y < -2) return 5; // the abdomen's sides
    return 1;
  }

  // ---------- the arms (the right one; the left mirrors it) ----------

  var UPPER = [
    [27, 11, 0],
    [39, -5, 3],
  ];
  var ELBOW = [40, -6, 3];
  var FORE = [
    [41, -4, 3.5],
    [52, 6, 7.5],
  ];
  var WRIST = [53, 7, 8];
  var PALM = { x0: 50, x1: 60, y0: 8, y1: 15, z0: 7, z1: 10 };
  var FINGERS = [
    { x: 50, len: 5 },
    { x: 53, len: 7 },
    { x: 56, len: 7 },
    { x: 59, len: 6 },
  ];

  function hand(x, y, z) {
    var P = PALM;
    if (x >= P.x0 && x <= P.x1 && y >= P.y0 && y <= P.y1 && z >= P.z0 && z <= P.z1) {
      if (y === P.y1 && z === P.z1) return 4; // the knuckle edge
      return x === P.x0 || x === P.x1 ? 5 : 1;
    }
    // fingers: two voxels wide, straight up from the palm, a joint a third of the way up
    if (z >= 8 && z <= 9 && y > P.y1) {
      for (var f = 0; f < FINGERS.length; f++) {
        var F = FINGERS[f];
        var up = y - P.y1;
        if (up > F.len) continue;
        if (x === F.x || x === F.x + 1) return up === 3 ? 2 : up === F.len ? 4 : 1;
      }
    }
    // the thumb: out from the palm's inner edge, then up
    if (z >= 8 && z <= 9) {
      if (x >= 47 && x <= 49 && y >= 9 && y <= 11) return 1;
      if (x >= 46 && x <= 47 && y >= 12 && y <= 15) return y === 15 ? 4 : y === 13 ? 2 : 1;
    }
    return 0;
  }

  function armRaw(x, y, z) {
    if (x < 14) return 0;
    // the shoulder guard: a rounded pauldron with a bright rim
    if (E(x, y, z, 25, 15.5, 0, 8.5, 6.8, 9)) {
      if (y <= 10) return 4; // its bright lower rim
      if (y === 13 || y === 17) return 2; // layered plates
      return 1;
    }
    var u = seg(x, y, z, UPPER[0], UPPER[1]);
    if (u[0] <= 4.6) return u[1] > 0.48 && u[1] < 0.56 ? 2 : 1;
    if (E(x, y, z, ELBOW[0], ELBOW[1], ELBOW[2], 4.8, 4.8, 4.8)) return 5;
    var f = seg(x, y, z, FORE[0], FORE[1]);
    if (f[0] <= 4.3) {
      if (f[1] > 0.7 && f[1] < 0.76) return 2;
      return y > -4 + (f[1] * 10 + 3.2) ? 4 : 1; // the forearm's top edge shines
    }
    if (E(x, y, z, WRIST[0], WRIST[1], WRIST[2], 2.8, 2.8, 2.8)) return 5;
    return hand(x, y, z);
  }

  // ---------- the cable ----------

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
  // from the left pod of the headset, down past the shoulder, into the dark behind the torso
  var CABLE_PATH = [
    [-17, 42, 9],
    [-20, 36, 6],
    [-21, 28, 0],
    [-19, 19, -10],
    [-15, 6, -13],
    [-13, -12, -12],
  ];

  // ---------- putting it together ----------

  function headFn(x, y, z) {
    return visorRaw(x, y, z) ? 0 : headRaw(x, y, z);
  }
  function torsoFn(x, y, z) {
    if (headRaw(x, y, z) || armRaw(Math.abs(x), y, z)) return 0;
    return torsoRaw(x, y, z);
  }
  function armRFn(x, y, z) {
    return armRaw(x, y, z);
  }
  function armLFn(x, y, z) {
    return armRaw(-x, y, z);
  }

  /** Everything solid (for deciding which voxels can be seen). */
  function anything(x, y, z) {
    return (
      visorRaw(x, y, z) ||
      headRaw(x, y, z) ||
      torsoRaw(x, y, z) ||
      armRaw(Math.abs(x), y, z) ||
      (cableSet && cableSet[x + "," + y + "," + z])
    );
  }

  /** The voxels of shape fn inside the box that touch empty space other than straight behind. */
  function visible(fn, box) {
    var out = [];
    for (var x = box[0]; x <= box[1]; x++) {
      for (var y = box[2]; y <= box[3]; y++) {
        for (var z = box[4]; z <= box[5]; z++) {
          var shade = fn(x, y, z);
          if (!shade) continue;
          if (
            anything(x + 1, y, z) &&
            anything(x - 1, y, z) &&
            anything(x, y + 1, z) &&
            anything(x, y - 1, z) &&
            anything(x, y, z + 1)
          ) {
            continue;
          }
          out.push([x, y, z, shade]);
        }
      }
    }
    return out;
  }

  var cableSet = null;
  function cableVoxels() {
    var out = [];
    var seen = {};
    for (var step = 0; step <= 300; step++) {
      var p = catmullRom(CABLE_PATH, step / 300);
      var x = Math.round(p[0]),
        y = Math.round(p[1]),
        z = Math.round(p[2]);
      var cross = [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ];
      for (var q = 0; q < cross.length; q++) {
        var cx = x + cross[q][0],
          cz = z + cross[q][1];
        var k = cx + "," + y + "," + cz;
        if (seen[k]) continue;
        if (visorRaw(cx, y, cz) || headRaw(cx, y, cz) || torsoRaw(cx, y, cz)) continue;
        if (armRaw(Math.abs(cx), y, cz)) continue;
        seen[k] = true;
        out.push([cx, y, cz, step % 9 === 0 ? 5 : 6]);
      }
    }
    return { list: out, set: seen };
  }

  function buildRobot() {
    var cable = cableVoxels();
    cableSet = cable.set;
    var shown = cable.list.filter(function (v) {
      var x = v[0],
        y = v[1],
        z = v[2];
      return !(
        anything(x + 1, y, z) &&
        anything(x - 1, y, z) &&
        anything(x, y + 1, z) &&
        anything(x, y - 1, z) &&
        anything(x, y, z + 1)
      );
    });
    var robot = {
      head: visible(headFn, [-17, 17, 24, 54, -14, 18]),
      visor: visible(visorRaw, [-13, 13, 35, 48, 15, 18]),
      cable: shown,
      torso: visible(torsoFn, [-23, 23, TORSO_BOTTOM, 29, -11, 13]),
      armR: visible(armRFn, [14, 62, -13, 25, -10, 12]),
      armL: visible(armLFn, [-62, -14, -13, 25, -10, 12]),
      headPivot: HEAD_PIVOT.slice(),
      shoulderL: [-SHOULDER[0], SHOULDER[1], SHOULDER[2]],
      shoulderR: SHOULDER.slice(),
    };
    cableSet = null;
    return robot;
  }

  var api = { MAX_VOXELS: MAX_VOXELS, SHADES: SHADES, buildRobot: buildRobot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.HyperTunnelRobot = api;
})();
