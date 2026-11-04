# my-first-app

A local web app for making **music visualizer videos**: pick a visual style, add a song,
customize the look with a live preview, and export an MP4 that reacts to the music.

Work in progress. See the [design spec](docs/superpowers/specs/2026-11-04-music-visualizer-app-design.md)
for where it's heading.

## Getting started

You need:

- [Node.js](https://nodejs.org) 22 or newer
- [Python](https://www.python.org) 3.10 or newer
- [FFmpeg](https://ffmpeg.org) (on Windows: `winget install Gyan.FFmpeg`)

Then, in the project folder:

```bash
npm install
npm run setup:py
npm run doctor
npm run dev
```

`npm run doctor` checks every tool is ready and tells you how to fix anything missing.
The app runs at http://localhost:3000.

To analyze a song (for template work): `npm run analyze -- "C:\Music\song.wav"`. Results are
cached in `storage/songs/` (never committed); add `--js out.js` to also write `window.AUDIO_DATA`.

To render a template with your own song (a test video, before the editor exists):

```bash
npm run render -- particle-horizon "C:\Music\song.wav" --set "title=My Song" --start 190 --end 220 --phone
```

The video lands in `test-renders/` (never committed); `--phone` also makes a copy under 30 MB.
Add `--preset Ice` to start from a preset, or `--preview` to open it in HyperFrames Studio.

Before committing a change, run `npm run check` (lint, formatting, type check and all tests).
