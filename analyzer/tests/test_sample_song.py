"""The generated sample song that templates are developed and checked with."""

import numpy as np

from analyze import analyze_samples
from sample_song import SR, make_sample_song


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.asarray(x, np.float64) ** 2)))


def test_sample_song_is_20_seconds_and_repeatable():
    a, b = make_sample_song(), make_sample_song()
    assert a.dtype == np.float32
    assert len(a) == 20 * SR
    assert np.array_equal(a, b)
    assert np.abs(a).max() <= 1.0


def test_loud_section_is_much_louder():
    y = make_sample_song()
    assert rms(y[10 * SR : 20 * SR]) >= 6 * rms(y[0 : 8 * SR])


def test_sample_song_analysis_has_a_quiet_and_a_loud_part():
    r = analyze_samples(make_sample_song())
    loud = [f["l"] for f in r["frames"]]
    assert np.mean(loud[2 * 30 : 7 * 30]) <= 0.3
    assert np.mean(loud[10 * 30 : 19 * 30]) >= 0.6
    assert sum(1 for t, _ in r["hits"] if t > 8.0) >= 15
