"""A generated 20-second "song" for developing and checking templates.

It is made in code, so no real music ever goes into the (public) repo:
  0–8 s   quiet: soft bass, mid and treble tones slowly swelling, no drums
  8–20 s  loud: the same tones much louder, plus a kick drum every half second
Templates must look clearly different in the two parts (spec §11).

Usage: python analyzer/sample_song.py --out <file.wav>
"""

import argparse
import wave

import numpy as np

SR = 44100
DURATION = 20.0
LOUD_FROM = 8.0
RAMP = 0.05  # seconds for every level change, so nothing clicks


def _ramp(t: np.ndarray, start: float, end: float) -> np.ndarray:
    """0 before `start`, 1 after `end`, a raised-cosine curve in between."""
    x = np.clip((t - start) / (end - start), 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def make_sample_song() -> np.ndarray:
    """The sample song as mono float32 samples at 44.1 kHz (always identical)."""
    t = np.arange(int(DURATION * SR)) / SR
    loud = _ramp(t, LOUD_FROM, LOUD_FROM + RAMP)  # 0 in the quiet part, 1 in the loud part

    y = np.zeros(len(t))
    for freq, rate in ((80, 0.31), (700, 0.53), (4000, 0.79)):
        swell = 0.6 + 0.4 * np.sin(2 * np.pi * rate * t)
        amp = 0.025 + (0.2 - 0.025) * loud
        y += amp * swell * np.sin(2 * np.pi * freq * t)

    kick_t = np.arange(int(0.15 * SR)) / SR
    kick = 0.35 * np.sin(2 * np.pi * 60 * kick_t) * np.exp(-kick_t / 0.05)
    for start in np.arange(LOUD_FROM + 0.25, DURATION - 0.2, 0.5):
        i = int(round(start * SR))
        y[i : i + len(kick)] += kick[: len(y) - i]

    edges = _ramp(t, 0.0, RAMP) * _ramp(-t, -DURATION, -DURATION + RAMP)
    y *= edges
    peak = np.abs(y).max()
    if peak > 0.9:
        y *= 0.9 / peak
    return y.astype(np.float32)


def write_wav(path: str, samples: np.ndarray) -> None:
    """Write 16-bit mono PCM."""
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser(description="Write the generated sample song.")
    parser.add_argument("--out", required=True, help="where to write the WAV file")
    write_wav(parser.parse_args().out, make_sample_song())


if __name__ == "__main__":
    main()
