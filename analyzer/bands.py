"""Frequency band layout for the audio analyzer.

Music energy is concentrated in the low frequencies, so bands are spaced evenly on a
logarithmic scale (each band is the same musical width) rather than in plain Hz.
"""

import numpy as np


def log_band_edges(n_bands: int = 32, fmin: float = 30.0, fmax: float = 16000.0) -> np.ndarray:
    """Return the n_bands + 1 edge frequencies (Hz) of log-spaced bands from fmin to fmax."""
    if n_bands < 1:
        raise ValueError("n_bands must be at least 1")
    if fmin <= 0 or fmax <= fmin:
        raise ValueError("need 0 < fmin < fmax")
    return np.geomspace(fmin, fmax, n_bands + 1)
