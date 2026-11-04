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

_CHUNK_FRAMES = 512  # frames per FFT batch, so long songs never hold every spectrum at once


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
    padded = np.concatenate([np.zeros(half, np.float32), y, np.zeros(half, np.float32)])
    windows = np.lib.stride_tricks.sliding_window_view(padded, FFT_SIZE)[::hop][:n]
    hann = np.hanning(FFT_SIZE).astype(np.float32)
    bands = _band_matrix(sr, log_band_edges(N_BANDS))

    db = np.empty((n, N_BANDS), np.float32)
    for start in range(0, n, _CHUNK_FRAMES):
        chunk = windows[start : start + _CHUNK_FRAMES]
        power = np.abs(np.fft.rfft(chunk * hann, axis=1)) ** 2
        db[start : start + len(chunk)] = 10 * np.log10(power @ bands + 1e-12)

    # Loudness: RMS of the hop-long stretch of samples centred on each frame.
    rms_windows = windows[:, half - hop // 2 : half - hop // 2 + hop]
    rms = np.sqrt(np.mean(rms_windows.astype(np.float64) ** 2, axis=1))
    rms_db = (20 * np.log10(rms + 1e-9)).astype(np.float32)
    return db, rms_db


def apply_floor(db: np.ndarray, range_db: float = 60.0) -> np.ndarray:
    """Treat anything more than range_db below the song's loud moments as silence.

    Without this, a band that only ever holds faint noise or leakage would be stretched to
    full brightness by percentile scaling.
    """
    return np.maximum(db, np.percentile(db, 99.5) - range_db)


def scale_to_unit(
    x: np.ndarray, lo_pct: float, hi_pct: float, min_range: float = 12.0
) -> np.ndarray:
    """Scale each column so its lo_pct percentile is 0 and its hi_pct percentile is 1.

    Each column's range is at least min_range, so a steady column stays 0 instead of
    dividing by zero.
    """
    lo = np.percentile(x, lo_pct, axis=0)
    hi = np.maximum(np.percentile(x, hi_pct, axis=0), lo + min_range)
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

    hits: list[tuple[float, float]] = []
    kick = np.zeros(n, np.float32)
    last_t, last_s = -1e9, 0.0
    w = int(fps * HIT_WINDOW)
    for i in range(n):
        t = i / fps
        threshold = np.mean(low[max(0, i - w) : min(n, i + w)]) * HIT_THRESH_MULT + HIT_THRESH_ADD
        is_peak = low[i] >= low[max(0, i - 2) : i + 3].max()
        if is_peak and low[i] > threshold and t - last_t > HIT_MIN_GAP:
            last_t, last_s = t, float(min(1.0, low[i]))
            hits.append((last_t, last_s))
        kick[i] = last_s * np.exp(-(t - last_t) / KICK_DECAY)
    return flux, hits, kick


def smooth(x: np.ndarray, attack: float, release: float) -> np.ndarray:
    """Follow rises quickly (attack) and falls slowly (release), frame by frame."""
    out = np.empty_like(x)
    prev = np.zeros(x.shape[1:], x.dtype)
    for i in range(len(x)):
        rate = np.where(x[i] > prev, attack, release)
        prev = prev + (x[i] - prev) * rate
        out[i] = prev
    return out
