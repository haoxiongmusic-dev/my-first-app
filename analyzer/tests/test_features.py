import numpy as np

from bands import log_band_edges
from features import apply_floor, band_levels_db, scale_to_unit, smooth
from sounds import tone


def test_frame_count_is_one_per_video_frame():
    db, rms = band_levels_db(tone(60, 2.0))
    assert db.shape == (60, 32) and rms.shape == (60,)


def test_60hz_tone_is_loudest_in_its_band():
    db, _ = band_levels_db(tone(60, 2.0))
    assert int(np.argmax(db.mean(axis=0))) == np.searchsorted(log_band_edges(), 60) - 1  # band 3


def test_5khz_tone_is_loudest_in_its_band():
    db, _ = band_levels_db(tone(5000, 2.0))
    assert int(np.argmax(db.mean(axis=0))) == np.searchsorted(log_band_edges(), 5000) - 1  # 26


def test_scale_maps_percentiles_to_0_and_1():
    x = np.arange(101, dtype=np.float32)[:, None]  # 0..100 in one column
    out = scale_to_unit(x, 20, 97)
    assert out[20, 0] == 0 and out[0, 0] == 0 and out[97, 0] == 1 and out[100, 0] == 1
    assert np.isclose(out[58, 0], (58 - 20) / 77, atol=1e-6)


def test_scale_constant_column_is_zero_not_nan():
    out = scale_to_unit(np.full((50, 2), -40.0, np.float32), 20, 97)
    assert np.all(out == 0)


def test_floor_lifts_values_far_below_the_peak():
    db = np.array([[0.0], [-10.0], [-120.0]] * 100, np.float32)
    assert apply_floor(db, 60.0).min() == -60.0


def test_smooth_attacks_fast_and_releases_slow():
    x = np.array([[0.0], [1.0], [1.0], [0.0]], np.float32)
    out = smooth(x, 0.55, 0.12)[:, 0]
    assert np.allclose(out[:2], [0.0, 0.55])
    assert np.isclose(out[3], out[2] * (1 - 0.12))
