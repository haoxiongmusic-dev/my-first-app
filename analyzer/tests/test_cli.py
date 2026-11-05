"""The analyzer's command line, run as a separate program the way the app runs it."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from sounds import gated_tone, tone, write_wav

ANALYZE_PY = Path(__file__).resolve().parent.parent / "analyze.py"


def run_cli(*args) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(ANALYZE_PY), *map(str, args)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def test_cli_resamples_48k_stereo_with_spaced_unicode_path(tmp_path):
    src = tmp_path / "My Sóng 01.wav"
    samples = gated_tone(60, 2.0)
    write_wav(src, samples, sr=48000, channels=2)  # 88200 samples labelled 48 kHz → 1.8375 s
    out = tmp_path / "analysis.json"
    p = run_cli(src, "--out", out)
    assert p.returncode == 0, p.stderr
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["duration"] == pytest.approx(len(samples) / 48000, abs=0.002)
    assert len(data["frames"]) == int(data["duration"] * 30)


def test_cli_garbage_file_exits_2(tmp_path):
    src = tmp_path / "not really.mp3"
    src.write_bytes(b"this is not audio" * 100)
    out = tmp_path / "analysis.json"
    p = run_cli(src, "--out", out)
    assert p.returncode == 2
    assert "Couldn't read this audio file. Try WAV or MP3." in p.stderr
    assert not out.exists()


def test_cli_too_short_exits_3(tmp_path):
    src = tmp_path / "blip.wav"
    write_wav(src, tone(60, 0.5))
    p = run_cli(src, "--out", tmp_path / "a.json")
    assert p.returncode == 3 and "at least 1 second" in p.stderr
