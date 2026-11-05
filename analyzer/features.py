"""Pure number-crunching for the analyzer: NumPy arrays in, NumPy arrays out.

Nothing here reads files or runs programs, so every function can be tested with sounds
generated in code (see tests/sounds.py).
"""

import numpy as np

from bands import log_band_edges

SR = 44100  # samples per second the song is decoded at
FPS = 30  # one analysis frame per video frame
HOP = SR // FPS  # 1470 samples between frames
FFT_SIZE = 4096  # analysis window length (about 93 ms)
N_BANDS = 32

_CHUNK_FRAMES = 256  # frames per FFT batch, so long songs never hold every spectrum at once


def _band_matrix(sr: int, edges: np.ndarray) -> np.ndarray:
    """(n_fft_bins, n_bands) matrix that averages the FFT bins belonging to each band."""
    freqs = np.fft.rfftfreq(FFT_SIZE, 1 / sr)
    n_bands = len(edges) - 1
    m = np.zeros((len(freqs), n_bands), np.float32)
    for b in range(n_bands):
        ix = np.where((freqs >= edges[b]) & (freqs < edges[b + 1]))[0]
        if len(ix) == 0:  # the narrowest low bands can fall between two bins
            ix = np.array([np.argmin(np.abs(freqs - (edges[b] + edges[b + 1]) / 2))])
        m[ix, b] = 1.0 / len(ix)
    return m


def band_levels_db(y: np.ndarray, sr: int = SR, fps: int = FPS) -> tuple[np.ndarray, np.ndarray]:
    """Per-frame band levels and loudness, both in dB.

    Frame i looks at a window centred on time i / fps. Returns (db, rms_db) with shapes
    (n, N_BANDS) and (n,), where n = len(y) // (sr // fps).
    """
    hop = sr // fps
    n = len(y) // hop
    y = np.asarray(y, np.float32)
    half = FFT_SIZE // 2
    hann = np.hanning(FFT_SIZE).astype(np.float32)
    bands = _band_matrix(sr, log_band_edges(N_BANDS))

    db = np.empty((n, N_BANDS), np.float32)
    rms_db = np.empty(n, np.float32)
    # Work through the song a batch of frames at a time; nothing here is the size of the
    # whole song, so an hour-long album needs no more memory than a short track.
    for start in range(0, n, _CHUNK_FRAMES):
        end = min(n, start + _CHUNK_FRAMES)
        # Samples covering every window in this batch, zero-padded past either end of the song.
        lo, hi = start * hop - half, (end - 1) * hop + half
        segment = np.zeros(hi - lo, np.float32)
        segment[max(0, -lo) : min(hi, len(y)) - lo] = y[max(0, lo) : min(hi, len(y))]
        windows = np.lib.stride_tricks.sliding_window_view(segment, FFT_SIZE)[::hop]

        power = np.abs(np.fft.rfft(windows * hann, axis=1)) ** 2
        db[start:end] = 10 * np.log10(power @ bands + 1e-12)

        # Loudness: RMS of the hop-long stretch of samples centred on each frame.
        middle = windows[:, half - hop // 2 : half - hop // 2 + hop].astype(np.float64)
        rms_db[start:end] = 20 * np.log10(np.sqrt(np.mean(middle**2, axis=1)) + 1e-9)
    return db, rms_db


def apply_floor(db: np.ndarray, range_db: float = 60.0) -> np.ndarray:
    """Treat anything more than range_db below the song's loud moments as silence.

    Without this, a band that only ever holds faint noise or leakage would be stretched to
    full brightness by percentile scaling.
    """
    return np.maximum(db, np.percentile(db, 99.5) - range_db)


def scale_to_unit(
    x: np.ndarray,
    lo_pct: float,
    hi_pct: float,
    min_range: float = 12.0,
    rows: np.ndarray | None = None,
) -> np.ndarray:
    """Scale each column so its lo_pct percentile is 0 and its hi_pct percentile is 1.

    Each column's range is at least min_range, so a steady column stays 0 instead of
    dividing by zero. `rows` (a True/False per row) picks which rows the percentiles are
    measured on; every row is scaled.
    """
    ref = x if rows is None else x[rows]
    lo = np.percentile(ref, lo_pct, axis=0)
    hi = np.maximum(np.percentile(ref, hi_pct, axis=0), lo + min_range)
    return np.clip((x - lo) / (hi - lo), 0, 1).astype(np.float32)


KICK_BANDS = 8  # the lowest 8 bands (30–144 Hz) drive hits and the kick
HIT_MIN_GAP = 0.15  # seconds between hits, at least
HIT_WINDOW = 0.5  # seconds either side used for the adaptive threshold
HIT_THRESH_MULT = 1.4
HIT_THRESH_ADD = 0.12
KICK_DECAY = 0.22  # seconds for the kick envelope to fall to about a third


def _normalize(x: np.ndarray, pct: float = 99) -> np.ndarray:
    return x / max(float(np.percentile(x, pct)), 1e-6)


def onsets(
    levels: np.ndarray, fps: int = FPS
) -> tuple[np.ndarray, list[tuple[float, float]], np.ndarray]:
    """Find where the sound suddenly gets louder.

    `levels` are the scaled (0..1), unsmoothed bands. Returns (flux, hits, kick):
    - flux: how much all bands rose since the last frame, 0..1
    - hits: (time_s, strength) for each bass hit, peak-picked from the low-band rise
    - kick: an envelope that jumps to a hit's strength and then fades
    """
    n = len(levels)
    rise = np.clip(np.diff(levels, axis=0, prepend=levels[:1]), 0, None)
    flux = np.clip(_normalize(rise.sum(axis=1)), 0, 1).astype(np.float32)
    low = _normalize(rise[:, :KICK_BANDS].sum(axis=1))

    # Whole-array versions of three per-frame checks (fast even for an hour of frames):
    # 1. adaptive threshold: mean rise over about ±0.5 s, from a running total
    idx = np.arange(n)
    w = int(fps * HIT_WINDOW)
    lo, hi = np.maximum(0, idx - w), np.minimum(n, idx + w)
    total = np.concatenate([[0.0], np.cumsum(low)])
    threshold = (total[hi] - total[lo]) / (hi - lo) * HIT_THRESH_MULT + HIT_THRESH_ADD
    # 2. local peak: at least as big as the 2 frames either side
    padded = np.concatenate([np.full(2, -np.inf), low, np.full(2, -np.inf)])
    is_peak = low >= np.lib.stride_tricks.sliding_window_view(padded, 5).max(axis=1)
    # 3. keep candidates at least HIT_MIN_GAP apart (only candidates are looped over)
    hit_frames: list[int] = []
    for i in np.flatnonzero(is_peak & (low > threshold)):
        if not hit_frames or i / fps - hit_frames[-1] / fps > HIT_MIN_GAP:
            hit_frames.append(int(i))
    strengths = np.minimum(1.0, low[hit_frames])
    hits = [(i / fps, float(s)) for i, s in zip(hit_frames, strengths)]

    # Kick: each frame decays from the most recent hit at or before it.
    is_hit = np.full(n, -1)
    is_hit[hit_frames] = np.arange(len(hit_frames))
    last = np.maximum.accumulate(is_hit)  # index into hit_frames, -1 before the first hit
    # A trailing 0 entry makes index -1 (no hit yet) read as strength 0.
    since = (idx - np.append(hit_frames, 0)[last]) / fps
    kick = np.append(strengths, 0.0)[last] * np.exp(-since / KICK_DECAY)
    return flux, hits, kick.astype(np.float32)


def smooth(x: np.ndarray, attack: float, release: float) -> np.ndarray:
    """Follow rises quickly (attack) and falls slowly (release), frame by frame."""
    out = np.empty_like(x)
    prev = np.zeros(x.shape[1:], x.dtype)
    for i in range(len(x)):
        rate = np.where(x[i] > prev, attack, release)
        prev = prev + (x[i] - prev) * rate
        out[i] = prev
    return out
