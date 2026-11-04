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
  function beatTrack(frames, fps, firstBand, lastBand) {
    var n = frames.length;
    var rise = new Float64Array(n);
    for (var i = 1; i < n; i++) {
      var sum = 0;
      for (var k = firstBand; k <= lastBand; k++) {
        var d = frames[i].b[k] - frames[i - 1].b[k];
        if (d > 0) sum += d;
      }
      rise[i] = sum;
    }
    var scale = Math.max(percentile(rise, 99), 1e-6);
    for (i = 0; i < n; i++) rise[i] /= scale;

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

    var range = null;
    for (var r = 0; r < BEAT_RANGES.length; r++) {
      if (BEAT_RANGES[r].value === (opts.beatRange || "kick")) range = BEAT_RANGES[r];
    }
    if (!range) throw new Error("Unknown beat range: " + opts.beatRange);
    var track = null;
    if (range.value !== "kick") {
      var first = Math.round(bandIndexForHz(range.low));
      var lastBand = Math.max(first, Math.round(bandIndexForHz(range.high)));
      track = beatTrack(frames, fps, first, lastBand);
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
      var x = Math.max(0, Math.min(n - 1, t * fps));
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
      for (var i = hitList.length - 1; i >= 0 && result.length < count; i--) {
        if (hitList[i][0] <= t) result.push([t - hitList[i][0], hitList[i][1]]);
      }
      return result;
    }

    return {
      fps: fps,
      duration: data.duration,
      sample: sample,
      spectrum: spectrum,
      recentHits: recentHits,
    };
  }

  // ---------- WebGL helpers ----------

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
      throw new Error("Shader didn't compile (" + kind + "): " + gl.getShaderInfoLog(shader));
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
      throw new Error("Shaders didn't link: " + gl.getProgramInfoLog(program));
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

  return {
    createProgram: createProgram,
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
    createAudio: createAudio,
  };
});
