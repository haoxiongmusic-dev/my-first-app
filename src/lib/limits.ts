/**
 * Song limits (spec §4: album-length videos are a real use case). Kept free of file access so
 * the browser can check a file before uploading it.
 */
export const UNREADABLE_MESSAGE = "Couldn't read this audio file. Try WAV or MP3.";
export const TOO_LONG_MESSAGE = "Songs can be up to 60 minutes long.";
export const TOO_BIG_MESSAGE = "Songs can be up to 1 GB.";
export const MAX_SONG_SECONDS = 3600;
export const MAX_SONG_BYTES = 1024 ** 3;
