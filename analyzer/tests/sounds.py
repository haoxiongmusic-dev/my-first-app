"""Test sounds generated in code, so no real music ever goes into the (public) repo.

Every function returns mono float32 samples at 44.1 kHz.
"""

import wave
from pathlib import Path

import numpy as np

SR = 44100


def _time(seconds: float) -> np.ndarray:
    return np.arange(int(round(seconds * SR))) / SR


def tone(freq: float, seconds: float, amp: float = 0.5) -> np.ndarray:
    """A steady sine wave."""
    return (amp * np.sin(2 * np.pi * freq * _time(seconds))).astype(np.float32)


def gated_tone(freq: float, seconds: float, amp: float = 0.5) -> np.ndarray:
    """A sine that is on for the first half of every second.

    The on/off edges fade over 50 ms (raised cosine): a hard switch is a click, and a click
    has energy in every band, which would light up bands the tone itself never touches.
    """
    t = _time(seconds)
    phase = t % 1.0
    ramp = 0.05
    gate = np.clip(np.minimum(phase / ramp, (0.5 - phase) / ramp), 0, 1)
    gate = 0.5 - 0.5 * np.cos(np.pi * gate)
    return (amp * np.sin(2 * np.pi * freq * t) * gate).astype(np.float32)


def kick_bursts(times: list[float], seconds: float) -> np.ndarray:
    """A simple kick drum (a fast-fading 60 Hz thump, 0.15 s long) at each time."""
    y = np.zeros(int(round(seconds * SR)), np.float32)
    t = _time(0.15)
    kick = (0.9 * np.sin(2 * np.pi * 60 * t) * np.exp(-t / 0.05)).astype(np.float32)
    for start in times:
        i = int(round(start * SR))
        end = min(len(y), i + len(kick))
        y[i:end] += kick[: end - i]
    return y


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(round(seconds * SR)), np.float32)


def write_wav(path: Path | str, samples: np.ndarray, sr: int = SR, channels: int = 1) -> None:
    """Write 16-bit PCM. With channels=2 the mono signal is copied to both channels."""
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    if channels == 2:
        pcm = np.repeat(pcm, 2)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
