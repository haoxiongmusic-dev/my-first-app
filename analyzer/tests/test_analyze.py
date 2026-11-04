"""The spec's analyzer tests (§11), run on sounds generated in code."""

import json
import re

import numpy as np
import pytest

from analyze import TooShortError, analyze_samples
from sounds import gated_tone, kick_bursts, silence, tone

FRAME = 1 / 30


def on_frames(result):
    """Frames well inside the "on" half of each gated second."""
    return [i for i in range(len(result["frames"])) if 0.1 < (i / 30) % 1.0 < 0.4]


def test_60hz_tone_lights_the_lowest_bands_only():
    r = analyze_samples(gated_tone(60, 4.0))
    assert np.mean([r["frames"][i]["b"][3] for i in on_frames(r)]) >= 0.9
    assert max(f["b"][b] for f in r["frames"] for b in range(8, 32)) <= 0.05


def test_5khz_tone_lights_its_matching_band():
    r = analyze_samples(gated_tone(5000, 4.0))
    assert np.mean([r["frames"][i]["b"][26] for i in on_frames(r)]) >= 0.9
    others = [b for b in range(32) if abs(b - 26) > 1]
    assert max(f["b"][b] for f in r["frames"] for b in others) <= 0.05


def test_faint_noise_stays_dark():
    rng = np.random.default_rng(1)
    y = gated_tone(60, 4.0) + (3e-5 * rng.standard_normal(4 * 44100)).astype(np.float32)
    r = analyze_samples(y)
    assert max(f["b"][b] for f in r["frames"] for b in range(12, 32)) <= 0.05


def test_kicks_every_half_second_become_hits():
    times = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
    r = analyze_samples(kick_bursts(times, 4.0))
    got = [t for t, _ in r["hits"]]
    assert len(got) == len(times)
    for want, t in zip(times, got):
        # ±1 frame: the window is centred on the frame time, so a hit can land 1 frame early
        assert abs(t - want) <= FRAME + 1e-3


def test_kick_envelope_jumps_then_decays():
    r = analyze_samples(kick_bursts([1.0], 2.0))
    i = round(r["hits"][0][0] * 30)
    assert r["frames"][i]["k"] >= 0.5
    # 0.4 s later: exp(-0.4 / 0.22) ≈ 0.16
    assert r["frames"][i + 12]["k"] < 0.2 * r["frames"][i]["k"]


def test_hits_are_at_least_0_15_s_apart():
    r = analyze_samples(kick_bursts([1.0, 1.06, 1.12], 2.0))
    assert len(r["hits"]) == 1


def test_silence_gives_all_zeros_and_no_hits():
    r = analyze_samples(silence(3.0))
    assert r["hits"] == []
    assert all(v == 0 for f in r["frames"] for v in [*f["b"], f["l"], f["k"], f["f"]])


def test_output_format_and_rounding():
    r = analyze_samples(gated_tone(60, 2.0))
    assert set(r) == {"version", "fps", "bands", "duration", "frames", "hits"}
    assert (r["version"], r["fps"], r["bands"], r["duration"]) == (1, 30, 32, 2.0)
    assert len(r["frames"]) == 60
    assert all(set(f) == {"b", "l", "k", "f"} and len(f["b"]) == 32 for f in r["frames"])
    assert all(0 <= v <= 1 for f in r["frames"] for v in [*f["b"], f["l"], f["k"], f["f"]])
    assert not re.search(r"\d\.\d{4,}", json.dumps(r))


def test_too_short_is_rejected():
    with pytest.raises(TooShortError, match="at least 1 second"):
        analyze_samples(tone(60, 0.5))
