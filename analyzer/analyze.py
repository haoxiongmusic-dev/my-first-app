"""Audio analyzer: a song in, `analysis.json` out (spec §7).

For each video frame (30 per second) it records:
  b  32 band levels, deep bass to treble, 0..1 (smoothed: fast rise, slow fall)
  l  overall loudness 0..1 (smoothed)
  k  kick: jumps on each bass hit, then fades
  f  flux: how much the sound just got louder, 0..1
plus `hits`: [time in seconds, strength] for each bass hit.

Levels are scaled against the whole song, so a quiet song still uses the full 0..1 range.

Usage: python analyzer/analyze.py <song> --out <analysis.json>
Exit codes: 0 done, 1 unexpected problem (e.g. FFmpeg missing), 2 unreadable audio,
3 song too short. On any failure no output file is written.
"""

import argparse
import json
import subprocess
import sys
import time

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


UNREADABLE_MESSAGE = "Couldn't read this audio file. Try WAV or MP3."


class TooShortError(ValueError):
    pass


class DecodeError(Exception):
    pass


def decode(path: str) -> np.ndarray:
    """Decode any audio file FFmpeg understands to mono float32 samples at 44.1 kHz."""
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR)]
    cmd += ["-f", "f32le", "pipe:1"]
    result = subprocess.run(cmd, capture_output=True)
    samples = np.frombuffer(result.stdout, dtype="<f4")
    if result.returncode != 0 or len(samples) == 0:
        lines = result.stderr.decode("utf-8", errors="replace").strip().splitlines()
        raise DecodeError(lines[-1] if lines else "no audio found")
    return samples


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


def main(argv: list[str] | None = None) -> int:
    # Windows consoles default to a legacy encoding; song names can contain any character.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Analyze a song for the music visualizer.")
    parser.add_argument("audio", help="song file (any format FFmpeg can read)")
    parser.add_argument("--out", required=True, help="where to write analysis.json")
    args = parser.parse_args(argv)

    started = time.perf_counter()
    try:
        result = analyze_samples(decode(args.audio))
    except FileNotFoundError:
        print("FFmpeg not found. Run: npm run doctor", file=sys.stderr)
        return 1
    except DecodeError as error:
        print(f"{UNREADABLE_MESSAGE}\n{error}", file=sys.stderr)
        return 2
    except TooShortError as error:
        print(error, file=sys.stderr)
        return 3

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, separators=(",", ":"))
    seconds = time.perf_counter() - started
    print(f"{len(result['frames'])} frames, {len(result['hits'])} hits, {seconds:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
