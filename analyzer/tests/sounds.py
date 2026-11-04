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


def gated_tone(freq: float, seconds: float, amp: float = 0.5, low: float = 0.0) -> np.ndarray:
    """A sine that is loud for the first half of every second and at `low` (0 = silent,
    0.1 = 20 dB quieter) for the second half.

    Every level change fades over 50 ms (raised cosine), including the very start and end:
    a hard switch is a click, and a click has energy in every band, which would light up
    bands the tone itself never touches.
    """
    t = _time(seconds)
    phase = t % 1.0
    ramp = 0.05
    gate = np.clip(np.minimum(phase / ramp, (0.5 - phase) / ramp), 0, 1)
    gate = 0.5 - 0.5 * np.cos(np.pi * gate)
    gate = low + (1 - low) * gate
    ends = np.clip(np.minimum(t / ramp, (seconds - t) / ramp), 0, 1)
    gate *= 0.5 - 0.5 * np.cos(np.pi * ends)
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


def music_like(seconds: float) -> np.ndarray:
    """A stand-in for music: bass, mid and treble tones whose loudness swings by about 8 dB
    at different slow rates, plus a kick every half second."""
    t = _time(seconds)
    y = np.zeros(len(t))
    for freq, rate in ((80, 0.31), (700, 0.53), (4000, 0.79)):
        envelope = 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t))
        y += 0.15 * envelope * np.sin(2 * np.pi * freq * t)
    kicks = kick_bursts(list(np.arange(0.25, seconds - 0.2, 0.5)), seconds)
    return (y + 0.5 * kicks).astype(np.float32)
