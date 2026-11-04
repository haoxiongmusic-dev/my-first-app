"""Audio analyzer: a song in, `analysis.json` out (spec §7).

For each video frame (30 per second) it records:
  b  32 band levels, deep bass to treble, 0..1 (smoothed: fast rise, slow fall)
  l  overall loudness 0..1 (smoothed)
  k  kick: jumps on each bass hit, then fades
  f  flux: how much the sound just got louder, 0..1
plus `hits`: [time in seconds, strength] for each bass hit.

Levels are scaled against the whole song, so a quiet song still uses the full 0..1 range.
"""

import numpy as np

from features import (
    FPS,
    N_BANDS,
    SR,
    apply_floor,
    band_levels_db,
    onsets,
    scale_to_unit,
    smooth,
)

ANALYSIS_VERSION = 1  # change this whenever the output changes; it invalidates cached analyses
MIN_SECONDS = 1.0


class TooShortError(ValueError):
    pass


def _round(x: np.ndarray) -> list:
    # float64 first: float32 values would print as 0.12300000339...
    return np.round(np.asarray(x, np.float64), 3).tolist()


def analyze_samples(y: np.ndarray, sr: int = SR) -> dict:
    """Analyze mono samples and return the spec §7 analysis dictionary."""
    if len(y) / sr < MIN_SECONDS:
        raise TooShortError("Song is too short: it needs to be at least 1 second long.")

    db, rms_db = band_levels_db(y, sr, FPS)
    levels = scale_to_unit(apply_floor(db), 20, 97)
    loud = scale_to_unit(rms_db[:, None], 15, 98)[:, 0]
    flux, hits, kick = onsets(levels, FPS)

    bands = _round(smooth(levels, 0.55, 0.12))
    loud_s = _round(smooth(loud[:, None], 0.5, 0.1)[:, 0])
    kick_r, flux_r = _round(kick), _round(flux)

    return {
        "version": ANALYSIS_VERSION,
        "fps": FPS,
        "bands": N_BANDS,
        "duration": round(len(y) / sr, 3),
        "frames": [
            {"b": bands[i], "l": loud_s[i], "k": kick_r[i], "f": flux_r[i]}
            for i in range(len(bands))
        ],
        "hits": [[round(t, 3), round(s, 3)] for t, s in hits],
    }
