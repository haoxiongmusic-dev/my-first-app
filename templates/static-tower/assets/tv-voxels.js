/*
 * Static Tower's stack of old television sets, built from voxels (unit cubes on a whole-number
 * grid): fifteen sets in a narrow stepped tower, rows of 1, 1, 3, 3, 4 and 3 from the top, each
 * row resting on the one below. Every set has its own seeded size, depth, cabinet shade (woods,
 * plastics, metal) and style ("plain": a screen in a thick bezel; "side": a knob panel at the
 * right; "below": a knob strip under the screen), and sits a little forward or back, so the stack
 * is slightly uneven. Each screen is a hole in the front: the page puts a screen quad there. The
 * top set, the bright main one, wears a rabbit-ear antenna (the lightning's target), and one set
 * lower down wears a smaller one.
 * Pure and deterministic: no DOM, no three.js, so Vitest tests it directly.
 *
 * buildTower(seed) returns { tvs, cabinet, trim, chrome, width, height, top }:
 *   - tvs: one per set, top row first, left to right (index 0 is the main set on top):
 *     { index, row, x0, y0, z0, w, h, d, style, palette, screen, antenna }, the set's box being
 *     x0..x0+w-1, y0..y0+h-1, z0-d+1..z0 (z0 its front face); screen { x, y, w, h, z }: the hole's
 *     centre, size (voxels) and the depth its quad sits at; antenna null or { tip: [x, y, z] }
 *   - cabinet, trim (the dark bezel lip and grilles) and chrome (knobs, antennas): voxels
 *     [x, y, z, shade, tv], shade the voxel's brightness 0..1, tv the set it belongs to (the page
 *     colours cabinet voxels with PALETTES[tvs[tv].palette])
 *   - width, height: the stack's size in voxels (height up to the antenna's tip); top: that tip
 * x is centred on 0, y = 0 is the floor, and the sets face +z. Only voxels that can be seen from
 * the front, the sides or above are kept (the page views the stack from a little above and aside).
 */
(function () {
  "use strict";

  var SEED = 2611;
  var MAX_VOXELS = 15000;
  var ROWS = [1, 1, 3, 3, 4, 3]; // sets per row, from the top
  // each row's set size (voxels): width and height, varied a little per set
  var SIZES = [
    [24, 18],
    [20, 15],
    [17, 13],
    [17, 13],
    [14, 11],
    [18, 14],
  ];
  // cabinet colours: walnut, teak, cream plastic, grey plastic, black, silver, olive, oxblood
  var PALETTES = [
    [0.34, 0.21, 0.12],
    [0.47, 0.3, 0.16],
    [0.76, 0.72, 0.62],
    [0.44, 0.46, 0.48],
    [0.14, 0.14, 0.15],
    [0.64, 0.66, 0.69],
    [0.38, 0.37, 0.26],
    [0.4, 0.17, 0.13],
  ];
  var WOODS = { 0: true, 1: true, 7: true };

  /** The seeded generator the toolkit uses (copied: this module stands alone). */
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
  /** A whole-number hash to 0..1 (the same every time). */
  function hash(n) {
    var h = (n | 0) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  /** 0..n-1 in a seeded order. */
  function shuffled(n, rnd) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var t = a[j];
      a[j] = a[k];
      a[k] = t;
    }
    return a;
  }
  function round3(x) {
    return Math.round(x * 1000) / 1000;
  }

  /**
   * Lay the sets out: sizes, places, styles and colours (no voxels yet). Rows are built from the
   * bottom up, each resting on the tallest set of the row below.
   */
  function layout(rnd) {
    var tvs = [];
    var base = 0;
    var palettes = [];
    var bag = [];
    for (var r = ROWS.length - 1; r >= 0; r--) {
      var n = ROWS[r];
      var h = SIZES[r][1] + (r === 0 ? 0 : Math.floor(rnd() * 3) - 1);
      var row = [];
      var widthSum = 0;
      for (var i = 0; i < n; i++) {
        var w = SIZES[r][0] + (r === 0 ? 0 : Math.floor(rnd() * 3) - 1);
        var gap = i < n - 1 ? (rnd() < 0.5 ? 1 : 0) : 0;
        row.push({ w: w, gap: gap });
        widthSum += w + gap;
      }
      // the row centred, nudged a voxel or so to one side
      var x = -Math.floor(widthSum / 2) + (r === 0 ? 0 : Math.floor(rnd() * 3) - 1);
      for (var j = 0; j < n; j++) {
        var cell = row[j];
        // cabinet colours dealt from a shuffled bag (each about twice), never twice in a row
        if (!bag.length) bag = shuffled(PALETTES.length, rnd);
        var palette = bag.pop();
        if (palette === palettes[palettes.length - 1] && bag.length) {
          var swap = bag.pop();
          bag.unshift(palette);
          palette = swap;
        }
        palettes.push(palette);
        var styleRoll = rnd();
        var style =
          r === 0 ? "plain" : styleRoll < 0.45 ? "side" : styleRoll < 0.75 ? "below" : "plain";
        tvs.push({
          row: r,
          x0: x,
          y0: base,
          z0: r === 0 ? 0 : -Math.floor(rnd() * 3) | 0,
          w: cell.w,
          h: h,
          d: Math.round(cell.w * 0.55) + Math.floor(rnd() * 3) - 1,
          style: style,
          palette: palette,
        });
        x += cell.w + cell.gap;
      }
      base += h;
    }
    // top row first, left to right
    tvs.sort(function (a, b) {
      return a.row - b.row || a.x0 - b.x0;
    });
    for (var k = 0; k < tvs.length; k++) tvs[k].index = k;
    return tvs;
  }

  /**
   * The screen hole and the knob panel of a set, by its style: { sx0, sy0, sw, sh } (the hole's
   * cells) and the panel { px0, py0, pw, ph } (or null) the knobs and grille go on. A style whose
   * screen would come out too wide or too tall falls back to a plainer one.
   */
  function face(tv) {
    var x0 = tv.x0,
      y0 = tv.y0,
      w = tv.w,
      h = tv.h;
    var styles = [tv.style, "side", "plain"];
    for (var i = 0; i < styles.length; i++) {
      var s = styles[i];
      var f;
      if (s === "side") {
        var pw = Math.max(4, Math.round(w * 0.25));
        f = {
          style: s,
          sx0: x0 + 2,
          sy0: y0 + 2,
          sw: w - pw - 3,
          sh: h - 4,
          panel: { px0: x0 + w - pw - 1, py0: y0 + 2, pw: pw - 1, ph: h - 4 },
        };
      } else if (s === "below") {
        f = {
          style: s,
          sx0: x0 + 2,
          sy0: y0 + 5,
          sw: w - 4,
          sh: h - 7,
          panel: { px0: x0 + 2, py0: y0 + 2, pw: w - 4, ph: 2 },
        };
      } else {
        f = { style: "plain", sx0: x0 + 2, sy0: y0 + 3, sw: w - 4, sh: h - 5, panel: null };
      }
      var aspect = f.sw / f.sh;
      if (f.sw >= 6 && f.sh >= 5 && aspect >= 0.9 && aspect <= 1.7) return f;
    }
    return f;
  }

  function buildTower(seed) {
    var rnd = mulberry32(seed === undefined ? SEED : seed | 0);
    var tvs = layout(rnd);
    var cells = {}; // "x,y,z" → { list, shade, tv } or { blocked: true }
    function put(x, y, z, list, shade, tv) {
      cells[x + "," + y + "," + z] = { list: list, shade: shade, tv: tv };
    }

    // which lower set gets the second, smaller antenna: an outer set of the first wide row
    var wide = tvs.filter(function (t) {
      return t.row === 2;
    });
    var second = rnd() < 0.5 ? wide[0] : wide[wide.length - 1];

    for (var i = 0; i < tvs.length; i++) {
      var tv = tvs[i];
      var f = face(tv);
      tv.style = f.style;
      var zBack = tv.z0 - tv.d + 1;
      var wood = WOODS[tv.palette] === true;
      var grainSeed = (seed === undefined ? SEED : seed | 0) * 131 + i * 977;
      for (var x = tv.x0; x < tv.x0 + tv.w; x++) {
        for (var y = tv.y0; y < tv.y0 + tv.h; y++) {
          var ex = x === tv.x0 || x === tv.x0 + tv.w - 1;
          var ey = y === tv.y0 || y === tv.y0 + tv.h - 1;
          var inScreen = x >= f.sx0 && x < f.sx0 + f.sw && y >= f.sy0 && y < f.sy0 + f.sh;
          var lip =
            !inScreen && x >= f.sx0 - 1 && x <= f.sx0 + f.sw && y >= f.sy0 - 1 && y <= f.sy0 + f.sh;
          for (var z = zBack; z <= tv.z0; z++) {
            // rounded cabinet corners: the box's four long edges are left out
            if (ex && ey) continue;
            if (inScreen && z === tv.z0) continue; // the hole
            if (inScreen && z === tv.z0 - 1) {
              cells[x + "," + y + "," + z] = { blocked: true }; // the screen itself
              continue;
            }
            var front = z === tv.z0;
            // wood grain runs along the sets' width; plastics are nearly flat
            var grain = wood
              ? 0.86 + 0.14 * hash(grainSeed + y * 7 + Math.floor((x - tv.x0) / 6) * 3)
              : 0.95 + 0.05 * hash(grainSeed + x * 31 + y * 17 + z * 7);
            var shade = grain;
            if (front && (ex || ey)) shade *= 0.86; // the front's outer edge, rounded over
            if (front && lip) {
              put(x, y, z, "trim", round3(0.55 + 0.1 * hash(x * 13 + y * 29)), i);
              continue;
            }
            put(x, y, z, "cabinet", round3(shade), i);
          }
        }
      }
      // the knobs and the grille on the panel
      var p = f.panel;
      if (p) {
        if (f.style === "side") {
          var kx = p.px0 + Math.floor((p.pw - 2) / 2);
          var ky = p.py0 + p.ph - 3;
          for (var k = 0; k < 2; k++) {
            var top = ky - k * 4;
            if (top - 1 < p.py0) break;
            for (var dx = 0; dx < 2; dx++)
              for (var dy = 0; dy < 2; dy++) {
                var lit = dx === 0 && dy === 1 ? 1 : dx === 1 && dy === 0 ? 0.55 : 0.78;
                put(kx + dx, top - dy, tv.z0 + 1, "chrome", lit, i);
              }
          }
          // the grille: dark slots below the knobs
          for (var gy = p.py0; gy < ky - 8; gy++) {
            if ((gy - p.py0) % 2 === 1) continue;
            for (var gx = p.px0; gx < p.px0 + p.pw; gx++)
              put(gx, gy, tv.z0, "trim", round3(0.42 + 0.06 * hash(gx * 7 + gy)), i);
          }
        } else {
          // "below": two knobs at the right of the strip, a grille at its left
          for (var b = 0; b < 2; b++) {
            var bx = p.px0 + p.pw - 2 - b * 3;
            put(bx, p.py0, tv.z0 + 1, "chrome", 0.65, i);
            put(bx + 1, p.py0, tv.z0 + 1, "chrome", 0.5, i);
            put(bx, p.py0 + 1, tv.z0 + 1, "chrome", 1, i);
            put(bx + 1, p.py0 + 1, tv.z0 + 1, "chrome", 0.8, i);
          }
          for (var sx = p.px0; sx < p.px0 + Math.floor(p.pw / 2); sx++) {
            if ((sx - p.px0) % 2 === 1) continue;
            for (var sy = p.py0; sy < p.py0 + p.ph; sy++)
              put(sx, sy, tv.z0, "trim", round3(0.42 + 0.06 * hash(sx * 5 + sy)), i);
          }
        }
      } else if (tv.row !== 0) {
        // a plain set: a small power knob in its bottom bezel
        put(tv.x0 + tv.w - 4, tv.y0 + 1, tv.z0 + 1, "chrome", 0.85, i);
      } else {
        // the main set: two small knobs under its screen
        put(tv.x0 + tv.w - 5, tv.y0 + 1, tv.z0 + 1, "chrome", 0.9, i);
        put(tv.x0 + tv.w - 8, tv.y0 + 1, tv.z0 + 1, "chrome", 0.75, i);
      }

      tv.screen = {
        x: f.sx0 + (f.sw - 1) / 2,
        y: f.sy0 + (f.sh - 1) / 2,
        w: f.sw,
        h: f.sh,
        z: tv.z0 - 0.5,
      };
      tv.antenna = null;
      if (i === 0 || tv === second) {
        // rabbit ears: a small base on the top, two rods leaning out
        var big = i === 0;
        var cx = tv.x0 + Math.floor(tv.w / 2);
        var cz = tv.z0 - Math.floor(tv.d / 2);
        var y1 = tv.y0 + tv.h;
        for (var bx2 = cx - 1; bx2 <= cx + 1; bx2++) put(bx2, y1, cz, "trim", 0.5, i);
        var len = big ? 11 : 7;
        var spread = big ? 6 : 4;
        var tips = [];
        for (var side = -1; side <= 1; side += 2) {
          // the left rod a little taller: the bolt's target
          var l = side < 0 ? len : len - 2;
          for (var j = 1; j <= l; j++) {
            var rx = cx + side * Math.round((j * spread) / len);
            put(rx, y1 + j, cz, "chrome", round3(0.7 + 0.3 * (j / l)), i);
          }
          tips.push([cx + side * Math.round((l * spread) / len), y1 + l, cz]);
        }
        tv.antenna = { tip: tips[0] };
      }
    }

    // keep only the voxels you can see: an empty cell in front, above, or to either side
    var out = { cabinet: [], trim: [], chrome: [] };
    var minX = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    var keys = Object.keys(cells);
    keys.sort(function (a, b) {
      var pa = a.split(",").map(Number),
        pb = b.split(",").map(Number);
      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
    });
    for (var c = 0; c < keys.length; c++) {
      var cell = cells[keys[c]];
      if (cell.blocked) continue;
      var pos = keys[c].split(",").map(Number);
      var px = pos[0],
        py = pos[1],
        pz = pos[2];
      var seen =
        !cells[px + "," + py + "," + (pz + 1)] ||
        !cells[px + "," + (py + 1) + "," + pz] ||
        !cells[px + 1 + "," + py + "," + pz] ||
        !cells[px - 1 + "," + py + "," + pz];
      if (!seen) continue;
      out[cell.list].push([px, py, pz, cell.shade, cell.tv]);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    return {
      tvs: tvs,
      cabinet: out.cabinet,
      trim: out.trim,
      chrome: out.chrome,
      width: maxX - minX + 1,
      height: maxY + 1,
      top: tvs[0].antenna.tip,
    };
  }

  var api = {
    SEED: SEED,
    MAX_VOXELS: MAX_VOXELS,
    ROWS: ROWS,
    SIZES: SIZES,
    PALETTES: PALETTES,
    buildTower: buildTower,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.StaticTowerTVs = api;
})();
