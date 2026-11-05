"use client";

// Content tab → Song: pick a song file, upload it with progress, then show its length and a
// waveform with the section to export. Analysis happens once per song on the server; the same
// file again is instant.
import { formatClock, songRequestGate } from "@/lib/editor-state";
import { MAX_SONG_BYTES, TOO_BIG_MESSAGE } from "@/lib/limits";
import type { Section } from "@/lib/section";
import { SectionStrip } from "./SectionStrip";

export type ChosenSong = { songId: string; duration: number; peaks: number[]; name: string };

type Props = {
  song: ChosenSong | null;
  section: Section | null;
  onSection: (section: Section) => void;
  onSong: (song: ChosenSong) => void;
  onStatus: (text: string, isError?: boolean) => void;
};

const gate = songRequestGate();
let uploading: XMLHttpRequest | null = null;

function upload(file: File, props: Props) {
  // Check the size here, so a file that is too big never starts uploading.
  if (file.size > MAX_SONG_BYTES) {
    props.onStatus(TOO_BIG_MESSAGE, true);
    return;
  }
  uploading?.abort(); // a newer choice replaces an upload still in progress
  const token = gate.begin();
  const request = new XMLHttpRequest();
  uploading = request;
  request.open("PUT", "/api/songs");
  request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
  request.upload.onprogress = (event) => {
    if (!gate.isCurrent(token) || !event.lengthComputable) return;
    props.onStatus(`Uploading song… ${Math.round((event.loaded / event.total) * 100)} %`);
  };
  request.upload.onload = () => {
    if (gate.isCurrent(token)) props.onStatus("Analyzing song…");
  };
  request.onload = () => {
    if (!gate.isCurrent(token)) return;
    let body: { songId?: string; duration?: number; peaks?: number[]; error?: string } = {};
    try {
      body = JSON.parse(request.responseText);
    } catch {
      // handled below
    }
    if (request.status === 200 && body.songId) {
      props.onSong({
        songId: body.songId,
        duration: body.duration ?? 0,
        peaks: body.peaks ?? [],
        name: file.name,
      });
      props.onStatus("Ready");
    } else {
      props.onStatus(body.error ?? "The upload failed. Please try again.", true);
    }
  };
  request.onerror = () => {
    if (gate.isCurrent(token)) props.onStatus("The upload failed. Is the app still running?", true);
  };
  props.onStatus("Uploading song… 0 %");
  request.send(file);
}

export function SongCard(props: Props) {
  const { song } = props;
  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">Song</h3>
      {song ? (
        <>
          <p className="truncate text-sm text-zinc-300" title={song.name}>
            {song.name} <span className="text-zinc-500">· {formatClock(song.duration)}</span>
          </p>
          {props.section && (
            <SectionStrip
              peaks={song.peaks}
              duration={song.duration}
              section={props.section}
              onChange={props.onSection}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-400">Using the sample song. Upload yours to hear it.</p>
      )}
      <label className="inline-block cursor-pointer rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-400">
        {song ? "Choose another song" : "Upload a song"}
        <input
          type="file"
          accept=".wav,.mp3,.flac,.m4a"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // so the same file can be chosen again
            if (file) upload(file, props);
          }}
        />
      </label>
      <p className="text-xs text-zinc-500">WAV, MP3, FLAC or M4A · up to 60 minutes and 1 GB</p>
    </section>
  );
}
