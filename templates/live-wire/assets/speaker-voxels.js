/*
 * Live Wire's loudspeaker, built from voxels (unit cubes on a whole-number grid), facing +z and
 * seen straight on: a glowing edge ring, a thick dark chrome rim with eight screws and four cable
 * plugs, a rubber surround, a bright brushed cone of concentric rings stepping down into a bowl,
 * and a glossy black dust cap domed up out of its floor.
 * Pure and deterministic: no DOM, no three.js, so Vitest tests it directly.
 *
 * buildSpeaker() returns { rim, edge, screws, plugs, surround, cone, cap }: lists of voxels
 * [x, y, z, shade] (y up), shade the voxel's brightness 0..1, worked out here as a chrome or
 * rubber surface would catch a light from the upper left (the page only adds the lighting's
 * faint side shading). The edge is coloured by the page (the main colour); surround, cone and cap
 * are drawn as one moving group that pumps with the bass.
 * The model is a height field: every (x, y) column has a top depth, and each column is filled
 * down only as far as a neighbour is lower, so only voxels you can see are kept.
 */
(function () {
  "use strict";

  var R_OUT = 20.5; // the speaker's outside edge (column centres within it)
  var EDGE_IN = 19.5; // the glowing edge ring: EDGE_IN < r <= R_OUT
  var RIM_IN = 15.5; // the rim: RIM_IN < r <= EDGE_IN
  var CONE_OUT = 12.5; // the surround: CONE_OUT < r <= RIM_IN; the cone inside it
  var CAP_R = 4.5; // the dust cap: r <= CAP_R
  var SCREW_R = 17.5;
  var PLUG_ANGLES = [25, 155, 205, 335]; // degrees, anticlockwise from the right (y up)
  var PLUG_IN = 17.5; // the plugs run from here …
  var PLUG_REACH = 23.5; // … out to here
  var PLUG_HALF = 2.5; // and are this wide each side of their line

  // the light the shades are worked out for: up and to the left, in front
  var L = norm([-0.5, 0.62, 0.6]);
  var H = norm([L[0], L[1], L[2] + 1]); // halfway between the light and the eye

  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  /** A whole-number hash to 0..1 (the same every time). */
  function hash(n) {
    var h = (n | 0) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  /** Normal of a ring surface tilted by `tilt` radians outward (negative: toward the middle). */
  function ringNormal(x, y, r, tilt) {
    var ux = r > 0 ? x / r : 0,
      uy = r > 0 ? y / r : 0;
    return [ux * Math.sin(tilt), uy * Math.sin(tilt), Math.cos(tilt)];
  }
  /** Chrome: the room reflected in it (bright above, dark below) and a sharp highlight. */
  function chrome(n, dark) {
    var ry = 2 * n[2] * n[1]; // the reflected view ray's height
    var sky = smoothstep(-0.12, 0.3, ry + 0.04);
    var spec = Math.pow(Math.max(0, dot(n, H)), 36);
    return clamp((0.1 + 0.58 * sky) * dark + 0.75 * spec, 0.03, 1);
  }

  /** The plug under column (x, y), or -1. */
  function plugAt(x, y) {
    for (var i = 0; i < PLUG_ANGLES.length; i++) {
      var a = (PLUG_ANGLES[i] * Math.PI) / 180;
      var along = x * Math.cos(a) + y * Math.sin(a);
      var across = -x * Math.sin(a) + y * Math.cos(a);
      if (along > PLUG_IN && along <= PLUG_REACH && Math.abs(across) <= PLUG_HALF) return i;
    }
    return -1;
  }
  /** The screw under column (x, y): a 2 × 2 head at every 45°. */
  function screwAt(x, y) {
    for (var k = 0; k < 8; k++) {
      var a = (k * Math.PI) / 4;
      // (rounded, so the screws are exact mirror images)
      var cx = Math.round(SCREW_R * Math.cos(a) * 1000) / 1000,
        cy = Math.round(SCREW_R * Math.sin(a) * 1000) / 1000;
      // the head's four columns straddle its centre
      if (Math.hypot(x - cx, y - cy) <= 1.15) return { dx: x - cx, dy: y - cy };
    }
    return null;
  }

  /** The column at (x, y): { part, top, shade } or null outside the speaker. */
  function column(x, y) {
    var r = Math.sqrt(x * x + y * y);
    var p = plugAt(x, y);
    if (p >= 0) {
      // a chunky chrome block: lit on its upper-left edges, darker on the far ones
      var a = (PLUG_ANGLES[p] * Math.PI) / 180;
      var along = x * Math.cos(a) + y * Math.sin(a);
      var across = -x * Math.sin(a) + y * Math.cos(a);
      var edgeA = Math.abs(across) > PLUG_HALF - 1;
      var tip = along > PLUG_REACH - 1;
      var tilt = edgeA ? 0.7 : 0;
      var n = edgeA
        ? norm([-Math.sin(a) * Math.sign(across), Math.cos(a) * Math.sign(across), 1.2])
        : tip
          ? norm([Math.cos(a), Math.sin(a), 1.2])
          : [0, 0, 1];
      return {
        part: "plugs",
        top: edgeA || tip ? 3 : 4,
        shade: clamp(0.2 + 0.55 * chrome(n, 1) + 0.04 * hash(x * 73 + y * 151) + tilt * 0, 0.05, 1),
      };
    }
    if (r > R_OUT) return null;
    var theta = Math.atan2(y, x);
    if (r > EDGE_IN) return { part: "edge", top: 1, shade: 1 };
    if (r > RIM_IN) {
      var sc = screwAt(x, y);
      if (sc) {
        // a domed head: brightest at its upper left
        var lit = 0.5 + 0.5 * clamp(-sc.dx * 0.7 + sc.dy * 0.7, -1, 1);
        return { part: "screws", top: 7, shade: clamp(0.35 + 0.55 * lit, 0, 1) };
      }
      // the rim's cross-section: rounded over, tilted inward on its inner half
      var u = (r - RIM_IN) / (EDGE_IN - RIM_IN); // 0 inside .. 1 outside
      var tiltR = (u - 0.5) * 1.7;
      var rimTop = u < 0.22 ? 3 : u < 0.45 ? 5 : u < 0.78 ? 6 : 4;
      var base = chrome(ringNormal(x, y, r, tiltR), 0.62);
      return {
        part: "rim",
        top: rimTop,
        shade: clamp(base * (0.93 + 0.07 * hash(x * 31 + y * 977)), 0.03, 1),
      };
    }
    if (r > CONE_OUT) {
      // the rubber surround: a half roll, matt
      var v = (r - CONE_OUT) / (RIM_IN - CONE_OUT);
      var nS = ringNormal(x, y, r, (v - 0.5) * 2.2);
      var top = v > 0.3 && v < 0.75 ? 1 : 0;
      return {
        part: "surround",
        top: top,
        shade: clamp(0.07 + 0.3 * Math.max(0, dot(nS, L)) + 0.02 * hash(x * 13 + y * 7), 0.04, 1),
      };
    }
    if (r > CAP_R) {
      // the cone: a bowl of rings stepping down toward the middle, brushed along its radius
      var ring = Math.round(r);
      var depth = Math.round(-1 - ((CONE_OUT - r) * 8) / (CONE_OUT - CAP_R));
      var nC = ringNormal(x, y, r, -0.55);
      var diffuse = dot(nC, L);
      var sector = Math.floor(((theta + Math.PI) / (2 * Math.PI)) * 96);
      var brushed = (hash(sector * 17 + 3) - 0.5) * 0.16 + (hash(x * 397 + y * 89) - 0.5) * 0.025;
      var lightAz = Math.atan2(L[1], L[0]);
      var dA = Math.abs(Math.atan2(Math.sin(theta - lightAz), Math.cos(theta - lightAz)));
      var streak =
        0.16 * Math.exp((-dA * dA) / 0.05) +
        0.1 * Math.exp((-(Math.PI - dA) * (Math.PI - dA)) / 0.05);
      return {
        part: "cone",
        top: depth,
        shade: clamp(
          0.55 + 0.32 * diffuse + brushed + (ring % 2 ? 0.035 : -0.035) + streak,
          0.3,
          1,
        ),
      };
    }
    // the dust cap: a glossy black dome rising out of the bowl's floor
    var rc = CAP_R + 0.6;
    var q = Math.min(1, r / rc);
    var nz = Math.sqrt(1 - q * q);
    var nD = norm([x / rc, y / rc, nz + 0.05]);
    var ry = 2 * nD[2] * nD[1];
    var glint = Math.pow(Math.max(0, dot(nD, H)), 28);
    return {
      part: "cap",
      top: -10 + Math.round(4.4 * nz),
      shade: clamp(0.05 + 0.13 * smoothstep(-0.2, 0.5, ry) + 0.9 * glint, 0.03, 1),
    };
  }

  function buildSpeaker() {
    var parts = { rim: [], edge: [], screws: [], plugs: [], surround: [], cone: [], cap: [] };
    var span = Math.ceil(PLUG_REACH) + 1;
    var cols = {};
    var x, y;
    for (x = -span; x <= span; x++) {
      for (y = -span; y <= span; y++) {
        var c = column(x, y);
        if (c) cols[x + "," + y] = c;
      }
    }
    for (x = -span; x <= span; x++) {
      for (y = -span; y <= span; y++) {
        var col = cols[x + "," + y];
        if (!col) continue;
        // fill down only as far as a neighbour is lower (outside the speaker: nothing to show)
        var floor = col.top;
        var nb = [
          cols[x + 1 + "," + y],
          cols[x - 1 + "," + y],
          cols[x + "," + (y + 1)],
          cols[x + "," + (y - 1)],
        ];
        for (var i = 0; i < 4; i++) if (nb[i]) floor = Math.min(floor, nb[i].top + 1);
        var shade = Math.round(col.shade * 1000) / 1000;
        for (var z = col.top; z >= floor; z--) parts[col.part].push([x, y, z, shade]);
      }
    }
    return parts;
  }

  var api = {
    buildSpeaker: buildSpeaker,
    R_OUT: R_OUT,
    EDGE_IN: EDGE_IN,
    RIM_IN: RIM_IN,
    CONE_OUT: CONE_OUT,
    CAP_R: CAP_R,
    PLUG_ANGLES: PLUG_ANGLES,
    PLUG_REACH: PLUG_REACH,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.LiveWireSpeaker = api;
})();
