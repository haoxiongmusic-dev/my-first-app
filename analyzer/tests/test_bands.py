import numpy as np
import pytest

from bands import log_band_edges


def test_default_has_33_edges_from_30_to_16000():
    edges = log_band_edges()
    assert len(edges) == 33
    assert edges[0] == 30.0
    assert np.isclose(edges[-1], 16000.0)


def test_edges_are_evenly_spaced_in_log_space():
    edges = log_band_edges(8, 100.0, 25600.0)
    ratios = edges[1:] / edges[:-1]
    assert np.allclose(ratios, 2.0)


def test_rejects_invalid_ranges():
    with pytest.raises(ValueError):
        log_band_edges(0)
    with pytest.raises(ValueError):
        log_band_edges(32, 500.0, 100.0)
