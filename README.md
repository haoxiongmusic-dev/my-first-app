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

Before committing a change, run `npm run check` (lint, formatting, type check and all tests).
