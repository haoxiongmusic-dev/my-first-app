/*
 * Night Flight's cockpit, built from voxels (unit cubes on a whole-number grid), seen from the
 * pilot's seat: x right, y up, z toward the pilot. At z = 0 the frame shows about 160 × 90 units.
 *   - two thick window struts rising from the dashboard near the centre out past the top-left
 *     and top-right corners (a V), coming toward the pilot as they rise (they arch overhead)
 *   - a dark dashboard across the bottom: a glare shield on top (highest in the middle, curving
 *     down to the sides) with a lip, a face with a centre cluster (the cover screen in a raised
 *     frame, two round gauges either side), and side panels with lit buttons, a level meter and
 *     a small panel for the timer
 * Pure and deterministic: no DOM, no three.js, so Vitest tests it directly.
 *
 * buildCockpit() returns:
 *   - struts, dash: voxels [x, y, z, shade]; shade picks a brightness from SHADES
 *   - ticks, buttons, meter: lit voxels [x, y, z, light]; light picks a colour from LIGHTS
 *     (the meter's LEDs run left to right, lit by the page as the music gets louder)
 *   - needles: one list per gauge, in needle units (NEEDLE_SCALE voxels each), pointing up from
 *     the pivot at 0, 0, 0; the page turns each about its gauge's centre
 *   - gauges: { x, y, z, radius } (z: the needle's pivot depth)
 *   - screen: { x, y, z, half } the cover's square opening (z: where the picture sits)
 *   - lcd: { x, y, z, halfW, halfH } the timer's panel
 * Only voxels that can be seen (from the front, the top or a side) are kept.
 */
(function () {
  "use strict";

  // 1 strut face, 2 strut bevel (outer edge), 8 strut chamfer (inner edge, catching the sky's
  // light), 3 glare shield, 4 dashboard face, 5 instrument panel, 6 metal trim (frames,
  // housings, hubs), 7 dial and panel glass (nearly black)
  var SHADES = { 1: 0.3, 2: 0.45, 3: 0.3, 4: 0.17, 5: 0.13, 6: 0.42, 7: 0.06, 8: 0.85 };
  var LIGHTS = { 1: "main", 2: "amber", 3: "green", 4: "red", 5: "white" };
  var NEEDLE_SCALE = 0.5;

  var HALF_X = 80; // the dashboard's columns: the frame's edge at its face, plus the shake
  var BOTTOM = -45; // the frame's bottom at the dashboard's face (it is nearer than z = 0)
  var FACE_Z = 8; // the dashboard's face
  var SHIELD_BACK = -2; // the glare shield runs back to here
  var STRUT = { foot: [14, -20], top: [104, 64], halfWidth: 4.5, z0: 0, z1: 21, depth: 2 };
  var STRUT_LIMIT = { x: 84, y: 46 }; // past the frame's corner: nothing more would show
  var SCREEN = { x: 0, y: -32, half: 6.5 }; // a 13 × 13 opening (columns |x| <= 6)
  var GAUGE = { x: 19, y: -32, dial: 5.5, rim: 7 };
  var PANEL = { x: 30, top: -24, bottom: -44 }; // the centre cluster's raised border
  var SIDE = { x0: 34, x1: 74, top: -28, bottom: -44 }; // each side panel's raised border
  var LCD = { x: 50, y: -32, halfW: 11.5, halfH: 2.5 };
  var METER_Y = -38;

  /** The dashboard's top row at column x: highest in the middle, curving down to the sides. */
  function dashTop(x) {
    var u = x / HALF_X;
    return Math.round(-21 - 6 * u * u);
  }

  /** Is the column inside the cover screen's opening? */
  function inScreen(x, y) {
    return Math.abs(x - SCREEN.x) < SCREEN.half && Math.abs(y - SCREEN.y) < SCREEN.half;
  }

  /** Lit buttons: [x0, y, light] per button (each two voxels wide), the same every time. */
  function buttonLayout() {
    var out = [];
    var pattern = [1, 2, 1, 3, 5, 1, 4, 2, 3, 1, 1, 5, 2, 1, 3, 4, 1, 2, 5, 1, 3, 1, 2, 1];
    var n = 0;
    var x, r;
    // left side panel: a grid of 3 rows × 6 (a few buttons are dark)
    var rows = [-31, -35, -39];
    for (r = 0; r < rows.length; r++) {
      for (x = -70; x <= -45; x += 5) {
        out.push([x, rows[r], (n * 7 + r) % 9 === 4 ? 0 : pattern[n % pattern.length]]);
        n++;
      }
    }
    // right side panel, under the timer and the meter: one row of 6
    for (x = 39; x <= 64; x += 5) {
      out.push([x, -41, n % 7 === 3 ? 0 : pattern[(n * 3) % pattern.length]]);
      n++;
    }
    return out;
  }

  function buildCockpit() {
    var solid = {}; // "x,y,z" -> [x, y, z, kind, value]
    function put(x, y, z, kind, value) {
      solid[x + "," + y + "," + z] = [x, y, z, kind, value];
    }
    function clear(x, y, z) {
      delete solid[x + "," + y + "," + z];
    }
    var x, y, z;

    // ----- the dashboard -----
    for (x = -HALF_X; x <= HALF_X; x++) {
      var top = dashTop(x);
      // the glare shield: the top row, from its back edge to a lip overhanging the face
      for (z = SHIELD_BACK; z <= FACE_Z + 1; z++) put(x, top, z, "dash", 3);
      put(x, top - 1, FACE_Z + 1, "dash", 3); // the lip is two rows deep
      for (y = top - 1; y >= BOTTOM; y--) put(x, y, FACE_Z, "dash", 4);
    }
    // the centre cluster: a darker instrument panel inside a raised border
    for (x = -PANEL.x; x <= PANEL.x; x++) {
      for (y = PANEL.bottom; y <= PANEL.top; y++) {
        var border = Math.abs(x) === PANEL.x || y === PANEL.top || y === PANEL.bottom;
        put(x, y, FACE_Z, "dash", border ? 6 : 5);
        if (border) put(x, y, FACE_Z + 1, "dash", 6);
      }
    }
    // the side panels: a raised border round each
    [-1, 1].forEach(function (s) {
      for (var ax = SIDE.x0; ax <= SIDE.x1; ax++) {
        for (var ay = SIDE.bottom; ay <= SIDE.top; ay++) {
          var edge = ax === SIDE.x0 || ax === SIDE.x1 || ay === SIDE.top || ay === SIDE.bottom;
          if (edge && ay < dashTop(s * ax) - 1) {
            put(s * ax, ay, FACE_Z, "dash", 6);
            put(s * ax, ay, FACE_Z + 1, "dash", 6);
          }
        }
      }
    });
    // the cover screen: an opening in a raised frame two voxels wide
    for (x = -9; x <= 9; x++) {
      for (y = SCREEN.y - 9; y <= SCREEN.y + 9; y++) {
        var d = Math.max(Math.abs(x - SCREEN.x), Math.abs(y - SCREEN.y));
        if (inScreen(x, y)) {
          clear(x, y, FACE_Z);
          clear(x, y, FACE_Z + 1);
        } else if (d <= SCREEN.half + 2) {
          put(x, y, FACE_Z, "dash", 6);
          put(x, y, FACE_Z + 1, "dash", 6);
        }
      }
    }
    // the gauges: a recessed dark dial in a raised housing ring, lit ticks and a hub
    var ticks = [];
    var gauges = [];
    [-1, 1].forEach(function (s) {
      var gx = s * GAUGE.x;
      var gy = GAUGE.y;
      for (var ax = gx - 8; ax <= gx + 8; ax++) {
        for (var ay = gy - 8; ay <= gy + 8; ay++) {
          var r = Math.sqrt((ax - gx) * (ax - gx) + (ay - gy) * (ay - gy));
          if (r < GAUGE.dial) {
            clear(ax, ay, FACE_Z);
            clear(ax, ay, FACE_Z + 1);
            put(ax, ay, FACE_Z - 1, "dash", 7);
          } else if (r < GAUGE.rim + 0.5) {
            put(ax, ay, FACE_Z, "dash", 6);
            put(ax, ay, FACE_Z + 1, "dash", 6);
          }
        }
      }
      // ticks from -135° to +135° (0° up, clockwise), the last two red
      for (var k = 0; k <= 8; k++) {
        var a = ((-135 + (270 * k) / 8) * Math.PI) / 180;
        var tx = gx + Math.round(4.4 * Math.sin(a));
        var ty = gy + Math.round(4.4 * Math.cos(a));
        clear(tx, ty, FACE_Z - 1);
        ticks.push([tx, ty, FACE_Z - 1, k >= 7 ? 4 : 1]);
      }
      put(gx, gy, FACE_Z, "dash", 6); // the hub, over the needle's root
      gauges.push({ x: gx, y: gy, z: FACE_Z - 0.35, radius: GAUGE.dial });
    });
    // the timer's panel: dark glass in a raised frame
    for (x = LCD.x - LCD.halfW - 1.5; x <= LCD.x + LCD.halfW + 1.5; x++) {
      for (y = LCD.y - LCD.halfH - 1.5; y <= LCD.y + LCD.halfH + 1.5; y++) {
        var inside = Math.abs(x - LCD.x) < LCD.halfW && Math.abs(y - LCD.y) < LCD.halfH;
        put(x, y, FACE_Z, "dash", inside ? 7 : 6);
        if (!inside) put(x, y, FACE_Z + 1, "dash", 6);
      }
    }
    // the lit buttons and the level meter stand out of the face
    var buttons = [];
    buttonLayout().forEach(function (b) {
      for (var i = 0; i < 2; i++) {
        if (b[2] === 0) put(b[0] + i, b[1], FACE_Z + 1, "dash", 6);
        else buttons.push([b[0] + i, b[1], FACE_Z + 1, b[2]]);
      }
    });
    var meter = [];
    for (x = 40; x <= 60; x += 2) meter.push([x, METER_Y, FACE_Z + 1, 3]);

    // ----- the struts -----
    var fx = STRUT.foot[0],
      fy = STRUT.foot[1];
    var dx = STRUT.top[0] - fx,
      dy = STRUT.top[1] - fy;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len,
      uy = dy / len;
    var strutCells = [];
    for (x = 0; x <= STRUT_LIMIT.x; x++) {
      for (y = fy - 6; y <= STRUT_LIMIT.y; y++) {
        if (y <= dashTop(x)) continue; // standing on the glare shield
        var px = x - fx,
          py = y - fy;
        var u = px * ux + py * uy;
        var v = -px * uy + py * ux;
        if (u < -3 || u > len || Math.abs(v) > STRUT.halfWidth) continue;
        var zc = Math.round(STRUT.z0 + ((STRUT.z1 - STRUT.z0) * Math.max(0, u)) / len);
        // the outer voxel each side is a bevel, one step back; the inner one (v > 0, facing
        // the windscreen's middle) is a chamfer that catches the light
        var bevel = Math.abs(v) > STRUT.halfWidth - 1.2;
        strutCells.push([x, y, bevel ? zc - 1 : zc, bevel ? (v > 0 ? 8 : 2) : 1]);
      }
    }
    strutCells.forEach(function (cell) {
      for (var s = -1; s <= 1; s += 2) {
        for (var k = 0; k < STRUT.depth; k++) {
          put(s * cell[0], cell[1], cell[2] - k, "strut", cell[3]);
        }
      }
    });

    // ----- keep only what can be seen -----
    var lit = {};
    ticks.concat(buttons, meter).forEach(function (v) {
      lit[v[0] + "," + v[1] + "," + v[2]] = true;
    });
    function filled(px, py, pz) {
      var k = px + "," + py + "," + pz;
      return k in solid || k in lit;
    }
    var struts = [],
      dash = [];
    var keys = Object.keys(solid).sort(function (a, b) {
      var A = solid[a],
        B = solid[b];
      return A[0] - B[0] || A[1] - B[1] || A[2] - B[2];
    });
    keys.forEach(function (k) {
      var c = solid[k];
      var cx = c[0],
        cy = c[1],
        cz = c[2];
      if (
        filled(cx, cy, cz + 1) &&
        filled(cx + 1, cy, cz) &&
        filled(cx - 1, cy, cz) &&
        filled(cx, cy + 1, cz) &&
        filled(cx, cy - 1, cz)
      ) {
        return;
      }
      (c[3] === "strut" ? struts : dash).push([cx, cy, cz, c[4]]);
    });

    // the needles: a thin line of half-size voxels from the pivot, pointing up
    var needle = [];
    for (var n = 0; n <= 9; n++) needle.push([0, n, 0, 5]);

    return {
      struts: struts,
      dash: dash,
      ticks: ticks,
      buttons: buttons,
      meter: meter,
      needles: [
        needle,
        needle.map(function (v) {
          return v.slice();
        }),
      ],
      gauges: gauges,
      screen: { x: SCREEN.x, y: SCREEN.y, z: FACE_Z - 0.3, half: SCREEN.half },
      lcd: { x: LCD.x, y: LCD.y, z: FACE_Z + 0.5, halfW: LCD.halfW, halfH: LCD.halfH },
    };
  }

  var api = {
    buildCockpit: buildCockpit,
    dashTop: dashTop,
    SHADES: SHADES,
    LIGHTS: LIGHTS,
    NEEDLE_SCALE: NEEDLE_SCALE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.NightFlightCockpit = api;
})();
