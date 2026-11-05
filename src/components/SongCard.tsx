"use client";

// Content tab → Song: pick a song file, upload it with progress, then show its length and a
// waveform. Analysis happens once per song on the server; the same file again is instant.
import { useEffect, useRef } from "react";
import { formatClock, songRequestGate } from "@/lib/editor-state";

export type ChosenSong = { songId: string; duration: number; peaks: number[]; name: string };

type Props = {
  song: ChosenSong | null;
  onSong: (song: ChosenSong) => void;
  onStatus: (text: string, isError?: boolean) => void;
};

const gate = songRequestGate();

function upload(file: File, props: Props) {
  const token = gate.begin();
  const request = new XMLHttpRequest();
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

function Waveform({ peaks }: { peaks: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { width, height } = c;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f59e0b";
    const bar = width / Math.max(1, peaks.length);
    peaks.forEach((peak, i) => {
      const h = Math.max(1, peak * height * 0.9);
      ctx.fillRect(i * bar, (height - h) / 2, Math.max(1, bar - 0.5), h);
    });
  }, [peaks]);
  return (
    <canvas ref={canvas} width={800} height={80} className="h-14 w-full rounded bg-zinc-950" />
  );
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
          <Waveform peaks={song.peaks} />
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
