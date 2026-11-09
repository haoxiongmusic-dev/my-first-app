/*
 * Shared visualizer toolkit for every template (spec §6.7).
 *
 * Edit this file here, in templates/shared/, then run `npm run sync:toolkit` to copy it into
 * each template's assets/ folder. It is plain browser JavaScript with no imports: in a
 * template it becomes the global `VizToolkit`; under Node (the tests) it is a CommonJS module.
 *
 * Everything is a pure function of the song analysis and the time, never of earlier frames,
 * because HyperFrames can seek to any frame in any order.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VizToolkit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- random numbers and colours ----------

  /** A seeded random generator: the same seed always gives the same sequence in [0, 1). */
  function mulberry32(seed) {
    var a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** "#ff6a12" or "#f61" → [r, g, b] in 0..1. */
  function hexToRGB(hex) {
    var h = typeof hex === "string" ? hex.trim() : "";
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
    if (!m) throw new Error("Not a colour: " + hex);
    var s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [
      parseInt(s.slice(0, 2), 16) / 255,
      parseInt(s.slice(2, 4), 16) / 255,
      parseInt(s.slice(4, 6), 16) / 255,
    ];
  }

  // ---------- frequency bands (must match analyzer/bands.py) ----------

  var N_BANDS = 32;
  var F_MIN = 30;
  var F_MAX = 16000;
  var LOG_SPAN = Math.log(F_MAX / F_MIN);
  var BAND_RATIO = Math.pow(F_MAX / F_MIN, 1 / N_BANDS); // each band's width, as a ratio

  /** The 33 edge frequencies (Hz) of the 32 log-spaced bands, 30 Hz to 16 kHz. */
  function bandEdges() {
    var edges = [];
    for (var i = 0; i <= N_BANDS; i++) edges.push(F_MIN * Math.pow(F_MAX / F_MIN, i / N_BANDS));
    return edges;
  }

  /** Fractional band position of a frequency: band k's centre is k. Clamped to [0, 31]. */
  function bandIndexForHz(hz) {
    var x = (Math.log(Math.max(hz, 1e-6) / F_MIN) / LOG_SPAN) * N_BANDS - 0.5;
    return Math.min(N_BANDS - 1, Math.max(0, x));
  }

  /** Choices for which frequencies drive the beat pulse (the template's beatRange setting). */
  var BEAT_RANGES = [
    { value: "kick", label: "Kick (auto)" },
    { value: "20-90", label: "20–90 Hz", low: 20, high: 90 },
    { value: "90-200", label: "90–200 Hz", low: 90, high: 200 },
    { value: "20-200", label: "20–200 Hz", low: 20, high: 200 },
    { value: "200-600", label: "200–600 Hz", low: 200, high: 600 },
    { value: "600-3000", label: "600–3000 Hz", low: 600, high: 3000 },
    { value: "3000-8000", label: "3000–8000 Hz", low: 3000, high: 8000 },
    { value: "8000-20000", label: "8000–20000 Hz", low: 8000, high: 20000 },
    { value: "20-20000", label: "20–20000 Hz", low: 20, high: 20000 },
  ];

  // ---------- beat detection on a group of bands (same rule as analyzer/features.py) ----------

  var HIT_MIN_GAP = 0.15;
  var HIT_WINDOW = 0.5;
  var HIT_THRESH_MULT = 1.4;
  var HIT_THRESH_ADD = 0.12;
  var KICK_DECAY = 0.22;

  /** Linear-interpolated percentile, like NumPy's default. */
  function percentile(values, pct) {
    var sorted = Array.prototype.slice.call(values).sort(function (a, b) {
      return a - b;
    });
    if (sorted.length === 0) return 0;
    var pos = (pct / 100) * (sorted.length - 1);
    var lo = Math.floor(pos);
    var hi = Math.min(sorted.length - 1, lo + 1);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /**
   * Hits and a decaying pulse from how much bands firstBand..lastBand rise each frame.
   * Returns {hits: [[time, strength], ...], pulse: Float32Array (one value per frame)}.
   */
  /** How much bands firstBand..lastBand rose since the previous frame, for every frame. */
  function bandRises(frames, firstBand, lastBand) {
    var rise = new Float64Array(frames.length);
    for (var i = 1; i < frames.length; i++) {
      var sum = 0;
      for (var k = firstBand; k <= lastBand; k++) {
        var d = frames[i].b[k] - frames[i - 1].b[k];
        if (d > 0) sum += d;
      }
      rise[i] = sum;
    }
    return rise;
  }

  /** The bands a beat range covers, as [first, last]. */
  function rangeBands(range) {
    var first = Math.round(bandIndexForHz(range.low));
    return [first, Math.max(first, Math.round(bandIndexForHz(range.high)))];
  }

  /**
   * Each Hz beat range's loudness scale over a whole song. A section of a song carries these
   * (analysis.beatScales), so its beats are judged against the whole song, as in a full render.
   */
  function beatScales(frames) {
    var scales = {};
    for (var r = 0; r < BEAT_RANGES.length; r++) {
      var range = BEAT_RANGES[r];
      if (range.value === "kick") continue;
      var bands = rangeBands(range);
      scales[range.value] = Math.max(percentile(bandRises(frames, bands[0], bands[1]), 99), 1e-6);
    }
    return scales;
  }

  function beatTrack(frames, fps, firstBand, lastBand, scale) {
    var n = frames.length;
    var rise = bandRises(frames, firstBand, lastBand);
    // The bands' smoothed levels are used (the analyzer uses unsmoothed ones); the rule is the same.
    scale = scale || Math.max(percentile(rise, 99), 1e-6);
    for (var i = 0; i < n; i++) rise[i] /= scale;

    var total = new Float64Array(n + 1);
    for (i = 0; i < n; i++) total[i + 1] = total[i] + rise[i];
    var w = Math.floor(fps * HIT_WINDOW);
    var hitFrames = [];
    for (i = 0; i < n; i++) {
      var lo = Math.max(0, i - w);
      var hi = Math.min(n, i + w);
      var threshold = ((total[hi] - total[lo]) / (hi - lo)) * HIT_THRESH_MULT + HIT_THRESH_ADD;
      if (!(rise[i] > threshold)) continue;
      var peak = true;
      for (var j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
        if (rise[j] > rise[i]) peak = false;
      }
      if (!peak) continue;
      var last = hitFrames[hitFrames.length - 1];
      if (last === undefined || i / fps - last / fps > HIT_MIN_GAP) hitFrames.push(i);
    }

    var hits = [];
    var pulse = new Float32Array(n);
    var h = -1;
    for (i = 0; i < n; i++) {
      while (h + 1 < hitFrames.length && hitFrames[h + 1] <= i) h++;
      if (h < 0) continue;
      var strength = Math.min(1, rise[hitFrames[h]]);
      pulse[i] = strength * Math.exp(-(i - hitFrames[h]) / fps / KICK_DECAY);
    }
    for (i = 0; i < hitFrames.length; i++) {
      hits.push([hitFrames[i] / fps, Math.min(1, rise[hitFrames[i]])]);
    }
    return { hits: hits, pulse: pulse };
  }

  // ---------- reading the song analysis ----------

  /**
   * Wrap a song analysis (window.AUDIO_DATA) for drawing.
   * opts: beatRange ("kick" or a BEAT_RANGES value), spectrumLow / spectrumHigh (Hz),
   * spectrumBoost (1, 2, 4 or 8), spectrumCount (values returned by spectrum()).
   */
  function createAudio(data, opts) {
    opts = opts || {};
    var frames = data.frames;
    var fps = data.fps;
    var n = frames.length;
    var bandCount = data.bands || N_BANDS;
    // A section of a song keeps a few seconds of analysis before its start; offset says how
    // many, so time 0 here is the section's first frame while the past is still known.
    var offset = data.offset || 0;

    var range = null;
    for (var r = 0; r < BEAT_RANGES.length; r++) {
      if (BEAT_RANGES[r].value === (opts.beatRange || "kick")) range = BEAT_RANGES[r];
    }
    if (!range) throw new Error("Unknown beat range: " + opts.beatRange);
    var track = null;
    if (range.value !== "kick") {
      var bands = rangeBands(range);
      var scale = data.beatScales ? data.beatScales[range.value] : undefined;
      track = beatTrack(frames, fps, bands[0], bands[1], scale);
    }
    var hitList = track ? track.hits : data.hits;

    // Spectrum range: low/high in either order, at least one band wide.
    var lowHz = Math.min(opts.spectrumLow || F_MIN, opts.spectrumHigh || F_MAX);
    var highHz = Math.max(opts.spectrumLow || F_MIN, opts.spectrumHigh || F_MAX);
    if (highHz / lowHz < BAND_RATIO) {
      var centre = Math.sqrt(lowHz * highHz);
      lowHz = centre / Math.sqrt(BAND_RATIO);
      highHz = centre * Math.sqrt(BAND_RATIO);
    }
    var boost = opts.spectrumBoost || 1;
    var count = opts.spectrumCount || bandCount;
    var columnPos = new Float64Array(count); // fractional band position of each column
    for (var c = 0; c < count; c++) {
      columnPos[c] = bandIndexForHz(lowHz * Math.pow(highHz / lowHz, (c + 0.5) / count));
    }

    function position(t) {
      var x = Math.max(0, Math.min(n - 1, (t + offset) * fps));
      var i0 = Math.floor(x);
      return { i0: i0, i1: Math.min(n - 1, i0 + 1), f: x - i0 };
    }

    function lerp(a, b, f) {
      return a + (b - a) * f;
    }

    function sample(t) {
      var p = position(t);
      var a = frames[p.i0];
      var b = frames[p.i1];
      var bands = new Float32Array(bandCount);
      for (var k = 0; k < bandCount; k++) bands[k] = lerp(a.b[k], b.b[k], p.f);
      var beat = track ? lerp(track.pulse[p.i0], track.pulse[p.i1], p.f) : lerp(a.k, b.k, p.f);
      return {
        bands: bands,
        loud: lerp(a.l, b.l, p.f),
        kick: lerp(a.k, b.k, p.f),
        flux: lerp(a.f, b.f, p.f),
        beat: beat,
      };
    }

    function spectrum(t, out) {
      out = out || new Float32Array(count);
      if (t + offset < 0) {
        out.fill(0); // before the song begins: silence
        return out;
      }
      var p = position(t);
      var a = frames[p.i0].b;
      var b = frames[p.i1].b;
      for (var j = 0; j < count; j++) {
        var x = columnPos[j];
        var k0 = Math.floor(x);
        var k1 = Math.min(bandCount - 1, k0 + 1);
        var g = x - k0;
        var v = lerp(lerp(a[k0], b[k0], p.f), lerp(a[k1], b[k1], p.f), g);
        out[j] = boost === 1 ? v : 1 - Math.pow(1 - v, boost);
      }
      return out;
    }

    function recentHits(t, count) {
      var result = [];
      var now = t + offset;
      for (var i = hitList.length - 1; i >= 0 && result.length < count; i--) {
        if (hitList[i][0] <= now) result.push([now - hitList[i][0], hitList[i][1]]);
      }
      return result;
    }

    return {
      fps: fps,
      duration: data.duration,
      offset: offset,
      // A section's time 0 is this far into the whole song, so effects seeded by song time
      // (a beat's exact moment) look the same in a section as in the full render.
      songStart: data.sectionStart || 0,
      // The whole song's length, also in a section (whose duration is just the section's).
      songDuration: data.songDuration || data.duration,
      sample: sample,
      spectrum: spectrum,
      recentHits: recentHits,
    };
  }

  // ---------- the ring kit: spectrum bars around a centre ----------

  /**
   * `count` angles (radians, clockwise from the top) spread evenly over an arc of `arcDeg`
   * degrees centred on the top. Each sits in the middle of its slot, so a full ring never
   * doubles up its top point.
   */
  function ringAngles(count, arcDeg) {
    var arc = (arcDeg * Math.PI) / 180;
    var out = new Float32Array(count);
    for (var k = 0; k < count; k++) out[k] = -arc / 2 + (arc * (k + 0.5)) / count;
    return out;
  }

  /**
   * A point on a ring of radius 1 and its outward direction: [x, y, nx, ny], y down.
   * shape "circle", or "rounded": the superellipse x⁴ + y⁴ = 1, a square with soft corners.
   */
  function ringPoint(angle, shape) {
    var dx = Math.sin(angle),
      dy = -Math.cos(angle);
    if (shape !== "rounded") return [dx, dy, dx, dy];
    var r = Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25);
    var x = dx / r,
      y = dy / r;
    var nx = x * x * x,
      ny = y * y * y;
    var len = Math.sqrt(nx * nx + ny * ny);
    return [x, y, nx / len, ny / len];
  }

  /**
   * One value per angle, read from the spectrum: the bass at the top, the last band at both
   * ends of the arc, so the ring is mirrored left and right.
   */
  function ringValues(spectrum, angles, arcDeg) {
    var half = (arcDeg * Math.PI) / 360;
    var n = spectrum.length;
    var out = new Float32Array(angles.length);
    for (var k = 0; k < angles.length; k++) {
      var x = Math.min(1, Math.abs(angles[k]) / half) * (n - 1);
      var i0 = Math.floor(x),
        i1 = Math.min(n - 1, i0 + 1);
      out[k] = spectrum[i0] + (spectrum[i1] - spectrum[i0]) * (x - i0);
    }
    return out;
  }

  /**
   * 0..1: the strongest recent beat, fading with time constant `release` (seconds). Looks back
   * 0.2 s in 1/60 s steps and never reads before the analysis starts.
   */
  function beatEnvelope(audio, t, release) {
    var first = -(audio.offset || 0);
    var env = 0;
    for (var k = 0; k < 12; k++) {
      var age = k / 60;
      var at = t - age;
      if (at < first) break;
      env = Math.max(env, audio.sample(at).beat * Math.exp(-age / release));
    }
    return Math.max(0, Math.min(1, env));
  }

  /** The Bands setting (10..100 %) as a point count: a fifth of `full` up to all of it. */
  function bandsToRingCount(pct, full) {
    return Math.round(full * (0.2 + (0.8 * (pct - 10)) / 90));
  }

  // ---------- the song clock: timers and progress bars ----------

  /** Song time for a timer: { elapsed, total, fraction } in seconds of the whole song. */
  function songClock(audio, t) {
    var total = Math.max(0, audio.songDuration || 0);
    var elapsed = Math.max(0, Math.min(total, (audio.songStart || 0) + t));
    return { elapsed: elapsed, total: total, fraction: total > 0 ? elapsed / total : 0 };
  }

  /** m:ss, or h:mm:ss from one hour (the same text as the editor's clock). */
  function formatClock(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = String(total % 60).padStart(2, "0");
    return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + s : m + ":" + s;
  }

  // ---------- the line kit: spectra along a line ----------

  /** Reads the spectrum at fractional band position x (0 = bass, 1 = last band). */
  function spectrumAt(spectrum, x) {
    var n = spectrum.length;
    var p = Math.max(0, Math.min(1, x)) * (n - 1);
    var i0 = Math.floor(p),
      i1 = Math.min(n - 1, i0 + 1);
    return spectrum[i0] + (spectrum[i1] - spectrum[i0]) * (p - i0);
  }

  /**
   * `count` values for bars along a line. fromCentre: the bass in the middle, mirrored out to
   * both ends; otherwise the bass at the left end.
   */
  function mirrorBars(spectrum, count, fromCentre) {
    var out = new Float32Array(count);
    for (var k = 0; k < count; k++) {
      var u = count > 1 ? k / (count - 1) : 0;
      out[k] = spectrumAt(spectrum, fromCentre ? Math.abs(u * 2 - 1) : u);
    }
    return out;
  }

  /** A box-blurred copy of a spectrum (radius in bands), the same length. */
  function smoothSpectrum(spectrum, radius) {
    var n = spectrum.length;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var sum = 0,
        cnt = 0;
      for (var k = i - radius; k <= i + radius; k++) {
        if (k >= 0 && k < n) {
          sum += spectrum[k];
          cnt++;
        }
      }
      out[i] = sum / cnt;
    }
    return out;
  }

  /**
   * `count` values in -1..1 for an oscilloscope-style line: spikes whose height follows the
   * spectrum (bass at index 0), with signs and jitter seeded by the song frame (30 per second),
   * so a section matches the full render. Silence gives all zeros.
   */
  function scopeLine(audio, t, count, seed) {
    var heights = mirrorBars(audio.spectrum(t), count, false);
    var rnd = mulberry32(seed + Math.floor((audio.songStart + t) * 30));
    var out = new Float32Array(count);
    for (var k = 0; k < count; k++) {
      var jitter = 0.35 + 0.65 * rnd();
      var sign = rnd() < 0.5 ? -1 : 1;
      out[k] = Math.max(-1, Math.min(1, sign * heights[k] * jitter));
    }
    return out;
  }

  // ---------- WebGL helpers ----------

  /** Browser shader logs can end in invisible null characters; drop them. */
  function cleanLog(log) {
    return String(log || "")
      .replace(/\u0000/g, "")
      .trim();
  }

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
      throw new Error(
        "Shader didn't compile (" + kind + "): " + cleanLog(gl.getShaderInfoLog(shader)),
      );
    }
    return shader;
  }

  /**
   * Compile and link a shader program. Throws a readable error if either step fails (a
   * shader that fails silently renders a black video). Uniform locations go in program.u.
   */
  function createProgram(gl, vertexSrc, fragmentSrc) {
    var program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Shaders didn't link: " + cleanLog(gl.getProgramInfoLog(program)));
    }
    program.u = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) || 0;
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(program, i);
      if (!info) continue;
      program.u[info.name.replace("[0]", "")] = gl.getUniformLocation(program, info.name);
    }
    return program;
  }

  /**
   * An offscreen render target. Always 8-bit (UNSIGNED_BYTE): half-float targets draw
   * nothing on this PC's Intel UHD 620 even though they report complete.
   */
  function createTarget(gl, w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) throw new Error("Render target incomplete");
    return { tex: tex, fb: fb, w: w, h: h };
  }

  var quadBuffers = typeof WeakMap === "function" ? new WeakMap() : null;

  /** Draw a full-screen quad with a program whose vertex attribute is named "p". */
  function drawQuad(gl, program) {
    var buffer = quadBuffers && quadBuffers.get(gl);
    if (!buffer) {
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      if (quadBuffers) quadBuffers.set(gl, buffer);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    var loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
  }

  function blurStep(gl, program, src, dst, dirX, dirY) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(program.u.src, 0);
    gl.uniform2f(program.u.dir, dirX, dirY);
    drawQuad(gl, program);
  }

  /**
   * Two-pass blur of target a (result ends up back in a; b is scratch of the same size).
   * The program needs uniforms `src` (sampler) and `dir` (step in texture units).
   */
  function blur(gl, program, a, b, scale) {
    blurStep(gl, program, a, b, scale / a.w, 0);
    blurStep(gl, program, b, a, 0, scale / a.h);
  }

  /** Show an error on the frame itself, so a broken template never renders silent black. */
  function showError(message) {
    if (typeof document === "undefined") return;
    var el = document.getElementById("viz-error");
    if (!el) {
      el = document.createElement("div");
      el.id = "viz-error";
      el.style.cssText =
        "position:absolute;inset:0;z-index:999;padding:60px;background:#000;color:#ff4d4d;" +
        "font:28px/1.4 monospace;white-space:pre-wrap;";
      document.body.appendChild(el);
    }
    el.textContent = "Template error:\n" + message;
  }

  // ---------- live preview helpers ----------

  /** Each variable's default from a data-composition-variables value (JSON, maybe escaped). */
  function declaredDefaults(json) {
    var text = String(json || "[]")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    var defaults = {};
    var list = JSON.parse(text);
    for (var i = 0; i < list.length; i++) defaults[list[i].id] = list[i]["default"];
    return defaults;
  }

  var DELETERS = {
    createBuffer: "deleteBuffer",
    createTexture: "deleteTexture",
    createFramebuffer: "deleteFramebuffer",
    createProgram: "deleteProgram",
    createShader: "deleteShader",
  };

  /**
   * A stand-in for a WebGL context that remembers every buffer, texture, framebuffer, program
   * and shader made through it, so a template can rebuild (after a settings change in the
   * preview) without leaking GPU memory: dispose() deletes them all.
   */
  function trackGl(gl) {
    var created = [];
    var bound = {};
    var proxy = new Proxy(gl, {
      get: function (target, name) {
        var value = target[name];
        if (typeof value !== "function") return value;
        if (bound[name]) return bound[name];
        var deleter = DELETERS[name];
        bound[name] = deleter
          ? function () {
              var made = value.apply(target, arguments);
              if (made) created.push([deleter, made]);
              return made;
            }
          : value.bind(target);
        return bound[name];
      },
    });
    return {
      gl: proxy,
      dispose: function () {
        for (var i = created.length - 1; i >= 0; i--) gl[created[i][0]](created[i][1]);
        created = [];
      },
    };
  }

  return {
    createProgram: createProgram,
    declaredDefaults: declaredDefaults,
    trackGl: trackGl,
    createTarget: createTarget,
    drawQuad: drawQuad,
    blur: blur,
    showError: showError,
    mulberry32: mulberry32,
    hexToRGB: hexToRGB,
    bandEdges: bandEdges,
    bandIndexForHz: bandIndexForHz,
    BEAT_RANGES: BEAT_RANGES,
    beatTrack: beatTrack,
    beatScales: beatScales,
    createAudio: createAudio,
    ringAngles: ringAngles,
    ringPoint: ringPoint,
    ringValues: ringValues,
    beatEnvelope: beatEnvelope,
    bandsToRingCount: bandsToRingCount,
    songClock: songClock,
    formatClock: formatClock,
    mirrorBars: mirrorBars,
    smoothSpectrum: smoothSpectrum,
    scopeLine: scopeLine,
  };
});
