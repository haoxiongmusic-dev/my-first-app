/*
 * Cube Core's motion: which of the three nested cubes moves on a beat, the rotation each one
 * holds (snapped, glided to, or slowly drifting), raver's size jumps, the edge flashes, and the
 * numbers on the readout. Everything is worked out from the song time and the audio alone, so any
 * frame can be drawn on its own, a section matches the full render and every render is identical.
 * Pure: no DOM, so Vitest tests it directly.
 *
 * A beat is known by its song frame, round(song time × fps), never by a running count: a section
 * keeps only a few seconds of the song before its start, so how many beats came before is not
 * known there. Every seeded choice (which cube moves, its new rotation) comes from
 * mulberry32(SEED + song frame). A cube holds the rotation of its own most recent beat, found by
 * looking back LOOKBACK seconds (which fit in a section's pre-roll). With no beat in that window
 * (silence) a cube turns very slowly from a seeded starting rotation, also from the song time.
 *
 * Rotations are unit quaternions [x, y, z, w].
 */
(function () {
  "use strict";

  var SEED = 7310;
  var CUBES = 3;
  var LOOKBACK = 5; // seconds of past beats looked at (a section keeps 6 s before its start)
  var HIT_EPS = 1e-4; // a beat this close after "now" counts already (rounding never hides it)
  var MAX_HITS = 64; // recent beats read (beats are at least 0.15 s apart)
  var GLIDE_TIME = 0.6; // seconds a glide takes
  var RAVER_JUMP = 0.1; // raver: the cubes are this much bigger on the beat
  var JUMP_RELEASE = 0.2; // seconds: how fast the jump falls back
  var FLASH_RELEASE = 0.2; // seconds: how fast a beat's edge flash fades
  var EDGE_RELEASE = 0.25; // the beat envelope's release for the edge brightness
  // radians per second: drift turns each cube at its own steady rate, about its own axis
  var DRIFT_RATES = [0.23, -0.31, 0.42];
  var IDLE_SHARE = 0.3; // in silence the cubes turn this much slower than drift
  var IDLE_RATES = DRIFT_RATES.map(function (r) {
    return r * IDLE_SHARE;
  });
  var AXES = [
    [0.35, 1, 0.15],
    [1, 0.45, -0.3],
    [-0.25, 0.6, 1],
  ].map(function (a) {
    var l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  });
  var BEHAVIOURS = ["snap", "glide", "raver", "drift"];
  var ROOM_BASE = 0.2; // the room's glow in silence, as a share of its full brightness
  var ROOM_FLASH = 0.45; // raver's floor flash on top

  function clamp01(x) {
    return x > 0 ? (x < 1 ? x : 1) : 0; // NaN gives 0
  }
  function finite(x) {
    return typeof x === "number" && isFinite(x) ? x : 0;
  }

  // ---------- quaternions ----------

  function normalize(q) {
    var l = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!(l > 1e-12) || !isFinite(l)) return [0, 0, 0, 1];
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }
  /** a then b: the rotation b applied in a's own frame (a × b). */
  function multiply(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  }
  function axisAngle(axis, angle) {
    var s = Math.sin(angle / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
  }
  /** The angle (radians, 0..π) of the turn from rotation a to rotation b. */
  function quatAngle(a, b) {
    var d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, d));
  }
  /** From a towards b (the short way round) by the share f. */
  function slerp(a, b, f) {
    f = clamp01(f);
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    var s = 1;
    if (d < 0) {
      d = -d;
      s = -1;
    }
    var ka, kb;
    if (d > 0.9995) {
      ka = 1 - f;
      kb = f;
    } else {
      var th = Math.acos(Math.min(1, d));
      var sin = Math.sin(th);
      ka = Math.sin((1 - f) * th) / sin;
      kb = Math.sin(f * th) / sin;
    }
    return normalize([
      ka * a[0] + s * kb * b[0],
      ka * a[1] + s * kb * b[1],
      ka * a[2] + s * kb * b[2],
      ka * a[3] + s * kb * b[3],
    ]);
  }
  /** A uniformly random rotation from three random numbers in 0..1 (Shoemake's method). */
  function randomRotation(u1, u2, u3) {
    var a = Math.sqrt(1 - u1),
      b = Math.sqrt(u1);
    return normalize([
      a * Math.sin(2 * Math.PI * u2),
      a * Math.cos(2 * Math.PI * u2),
      b * Math.sin(2 * Math.PI * u3),
      b * Math.cos(2 * Math.PI * u3),
    ]);
  }

  // ---------- beats ----------

  /**
   * The beats of the last LOOKBACK seconds, newest first: { frame, age, strength }. frame is the
   * beat's song frame (the same in a section as in the full song), age its seconds before t.
   */
  function beatsAt(audio, t) {
    var out = [];
    if (!(typeof t === "number" && isFinite(t))) return out;
    var songNow = (audio.songStart || 0) + t;
    var hits = audio.recentHits(t + HIT_EPS, MAX_HITS);
    for (var i = 0; i < hits.length; i++) {
      var age = hits[i][0] - HIT_EPS;
      if (age > LOOKBACK) break;
      out.push({
        frame: Math.round((songNow - age) * audio.fps),
        age: age > 0 ? age : 0,
        strength: clamp01(hits[i][1]),
      });
    }
    return out;
  }

  /** The seeded numbers of the beat at this song frame. */
  function beatRandom(frame, mulberry32) {
    return mulberry32((SEED + Math.round(finite(frame))) | 0);
  }
  /** Which cube (0 outer, 1 middle, 2 inner) a snap beat moves. */
  function pickCube(frame, mulberry32) {
    return Math.min(CUBES - 1, Math.floor(beatRandom(frame, mulberry32)() * CUBES));
  }
  /** The rotation a beat gives a cube. */
  function beatRotation(cube, frame, mulberry32) {
    var r = beatRandom(frame, mulberry32);
    r(); // the first number picks the cube
    var q = [0, 0, 0, 1];
    for (var c = 0; c <= cube; c++) q = randomRotation(r(), r(), r());
    return q;
  }
  /** Where a cube starts turning from (seeded once, not by a beat). */
  function baseRotation(cube, mulberry32) {
    var r = mulberry32((SEED - 101 - cube * 17) | 0);
    return randomRotation(r(), r(), r());
  }
  function turning(cube, songTime, rate, mulberry32) {
    return normalize(
      multiply(baseRotation(cube, mulberry32), axisAngle(AXES[cube], rate * finite(songTime))),
    );
  }
  /** Drift: a steady slow turn about the cube's own axis. */
  function driftRotation(cube, songTime, mulberry32) {
    return turning(cube, songTime, DRIFT_RATES[cube], mulberry32);
  }
  /** Silence (no beat in the lookback): the same turn, much slower. */
  function idleRotation(cube, songTime, mulberry32) {
    return turning(cube, songTime, IDLE_RATES[cube], mulberry32);
  }

  /** The glide's ease over its time: quick off the beat, settling softly (cubic ease-out). */
  function glideEase(x) {
    if (x !== x) return 1;
    x = clamp01(x);
    var u = 1 - x;
    return 1 - u * u * u;
  }

  function beatFlash(beat) {
    return beat ? beat.strength * Math.exp(-beat.age / FLASH_RELEASE) : 0;
  }

  /**
   * The three cubes at song time songTime, given the recent beats (beatsAt):
   * { rot: [q, q, q], scale: [s, s, s], flash: [f, f, f] (0..1 edge flash), active: [bool ×3]
   * (moved on the latest beat), floorFlash (0..1, raver) }.
   */
  function cubesAt(behaviour, beats, songTime, mulberry32) {
    var mode = BEHAVIOURS.indexOf(behaviour) >= 0 ? behaviour : "snap";
    var now = finite(songTime);
    var list = [];
    for (var i = 0; i < beats.length; i++) {
      var b = beats[i];
      if (isFinite(b.frame) && isFinite(b.age) && isFinite(b.strength)) list.push(b);
    }
    var latest = list[0];
    var rot = [],
      scale = [],
      flash = [],
      active = [];
    var floorFlash = 0;
    for (var c = 0; c < CUBES; c++) {
      var q, f, on;
      if (mode === "drift") {
        q = driftRotation(c, now, mulberry32);
        f = beatFlash(latest);
        on = true;
      } else if (!latest) {
        q = idleRotation(c, now, mulberry32);
        f = 0;
        on = false;
      } else if (mode === "snap") {
        var own = null;
        for (var k = 0; k < list.length && !own; k++) {
          if (pickCube(list[k].frame, mulberry32) === c) own = list[k];
        }
        q = own ? beatRotation(c, own.frame, mulberry32) : idleRotation(c, now, mulberry32);
        f = beatFlash(own);
        on = pickCube(latest.frame, mulberry32) === c;
      } else if (mode === "raver") {
        q = beatRotation(c, latest.frame, mulberry32);
        f = beatFlash(latest);
        on = true;
      } else {
        q = glideAt(c, list, now, mulberry32);
        f = beatFlash(latest);
        on = true;
      }
      rot.push(q);
      flash.push(f);
      active.push(on);
      scale.push(
        mode === "raver" && latest ? 1 + RAVER_JUMP * Math.exp(-latest.age / JUMP_RELEASE) : 1,
      );
    }
    if (mode === "raver") floorFlash = beatFlash(latest);
    return { rot: rot, scale: scale, flash: flash, active: active, floorFlash: floorFlash };
  }

  /**
   * Glide: each beat gives the cube a new target and it eases there over GLIDE_TIME, starting
   * from wherever the previous glide had got to when the beat came. Worked out from the oldest
   * beat in the lookback (which starts from the slow silent turn), so it needs nothing older.
   */
  function glideAt(cube, list, now, mulberry32) {
    var n = list.length;
    var oldest = list[n - 1];
    var from = idleRotation(cube, now - oldest.age, mulberry32);
    for (var k = n - 1; k >= 0; k--) {
      var target = beatRotation(cube, list[k].frame, mulberry32);
      // how far this glide got: until the next beat, or until now for the latest
      var spent = k > 0 ? list[k].age - list[k - 1].age : list[k].age;
      var at = slerp(from, target, glideEase(spent / GLIDE_TIME));
      from = at;
    }
    return from;
  }

  /** Edge brightness: 0.6 at rest, up to 1 on the beat. */
  function edgeLevel(env) {
    return 0.6 + 0.4 * clamp01(env);
  }

  /** The power bar: the loudness, boosted like the spectrum (1 - (1 - loud)^boost). */
  function power(loud, boost) {
    var b = Number(boost);
    if (!(b >= 1)) b = 1;
    return clamp01(1 - Math.pow(1 - clamp01(loud), b));
  }

  /** The room's glow round the cubes and on the floor (0..1.45): the power, plus raver's flash. */
  function roomGlow(p, floorFlash) {
    return ROOM_BASE + (1 - ROOM_BASE) * clamp01(p) + ROOM_FLASH * clamp01(floorFlash);
  }

  function wrapDegrees(d) {
    var w = ((d % 360) + 360) % 360;
    return w >= 360 ? 0 : w;
  }
  /** A cube's rotation as X, Y, Z angles (degrees, 0..360), for the readout. */
  function cubeAngles(q) {
    var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
    var m11 = 1 - 2 * (y * y + z * z),
      m12 = 2 * (x * y - z * w),
      m13 = 2 * (x * z + y * w),
      m23 = 2 * (y * z - x * w),
      m33 = 1 - 2 * (x * x + y * y),
      m22 = 1 - 2 * (x * x + z * z),
      m32 = 2 * (y * z + x * w);
    var deg = 180 / Math.PI;
    var s = Math.max(-1, Math.min(1, m13));
    var ay = Math.asin(s) * deg,
      ax,
      az;
    if (Math.abs(s) < 0.9999999) {
      ax = Math.atan2(-m23, m33) * deg;
      az = Math.atan2(-m12, m11) * deg;
    } else {
      ax = Math.atan2(m32, m22) * deg;
      az = 0;
    }
    return [wrapDegrees(ax), wrapDegrees(ay), wrapDegrees(az)];
  }
  function pad3(n) {
    var s = String(n);
    while (s.length < 3) s = "0" + s;
    return s;
  }
  /** "004.4": an angle to a tenth of a degree, always five characters. */
  function formatAngle(deg) {
    var tenths = Math.round(wrapDegrees(finite(deg)) * 10) % 3600;
    return pad3(Math.floor(tenths / 10)) + "." + (tenths % 10);
  }
  /** "087%": the power as a whole percentage. */
  function formatPower(p) {
    return pad3(Math.round(clamp01(p) * 100)) + "%";
  }
  function behaviourLabel(b) {
    return (BEHAVIOURS.indexOf(b) >= 0 ? b : "snap").toUpperCase();
  }

  var api = {
    SEED: SEED,
    CUBES: CUBES,
    LOOKBACK: LOOKBACK,
    MAX_HITS: MAX_HITS,
    GLIDE_TIME: GLIDE_TIME,
    RAVER_JUMP: RAVER_JUMP,
    EDGE_RELEASE: EDGE_RELEASE,
    DRIFT_RATES: DRIFT_RATES,
    IDLE_RATES: IDLE_RATES,
    BEHAVIOURS: BEHAVIOURS,
    behaviourLabel: behaviourLabel,
    beatsAt: beatsAt,
    pickCube: pickCube,
    beatRotation: beatRotation,
    idleRotation: idleRotation,
    driftRotation: driftRotation,
    glideEase: glideEase,
    slerp: slerp,
    quatAngle: quatAngle,
    cubesAt: cubesAt,
    edgeLevel: edgeLevel,
    power: power,
    roomGlow: roomGlow,
    cubeAngles: cubeAngles,
    formatAngle: formatAngle,
    formatPower: formatPower,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.CubeMotion = api;
})();
