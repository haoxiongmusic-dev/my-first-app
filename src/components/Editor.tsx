"use client";

// The editor (spec §4): top bar, icon rail, a side panel, and the live preview.
import { useCallback, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/lib/app-info";
import { previewScale, previewSrc } from "@/lib/editor-state";
import { type FormTemplate, mergeValues } from "@/lib/form-model";
import type { TemplateValues } from "@/lib/template-values";
import { IconRail, type PanelId } from "./IconRail";
import { PreferencesPanel } from "./PreferencesPanel";
import { PreviewPlayer } from "./PreviewPlayer";
import { BackgroundCard, type ChosenBackground } from "./BackgroundCard";
import { ContentFields, CustomizePanel } from "./SettingsForm";
import { type ChosenSong, SongCard } from "./SongCard";
import { usePreferences } from "./usePreferences";

export type EditorTemplate = FormTemplate & { id: string };

type Status = { text: string; isError: boolean };

export function Editor({ template }: { template: EditorTemplate }) {
  const [values, setValues] = useState<TemplateValues>(() => mergeValues(template, {}));
  const setValue = useCallback(
    (id: string, value: string | number | boolean) =>
      setValues((current) => (current[id] === value ? current : { ...current, [id]: value })),
    [],
  );
  const [song, setSong] = useState<ChosenSong | null>(null);
  const [background, setBackground] = useState<ChosenBackground | null>(null);
  const hasBackground = template.variables.some((v) => v.id === "showBackground");
  const [panel, setPanel] = useState<PanelId>("content");
  const [projectName, setProjectName] = useState(`${template.manifest.name} project`);
  const [status, setStatusState] = useState<Status>({ text: "Ready", isError: false });
  const previewArea = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = usePreferences();

  const setStatus = useCallback(
    (text: string, isError = false) => setStatusState({ text, isError }),
    [],
  );
  const onPreviewError = useCallback((message: string) => setStatus(message, true), [setStatus]);
  const src = useMemo(
    () => previewSrc(template.id, song?.songId ?? null, background?.backgroundId ?? null),
    [template.id, song, background],
  );
  const chooseBackground = useCallback(
    (chosen: ChosenBackground | null) => {
      setBackground(chosen);
      setValue("showBackground", chosen !== null);
    },
    [setValue],
  );

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-800 bg-black px-4">
        <span className="font-semibold text-amber-400">{APP_NAME}</span>
        <input
          aria-label="Project name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="w-64 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-zinc-700 focus:border-zinc-500 focus:outline-none"
        />
        <p
          role="status"
          className={`flex-1 truncate text-center text-sm ${status.isError ? "text-red-400" : "text-zinc-400"}`}
        >
          {status.text}
        </p>
        <button
          type="button"
          disabled
          title="Export arrives in the next milestone"
          className="cursor-not-allowed rounded-md bg-zinc-800 px-4 py-1.5 text-sm text-zinc-500"
        >
          Export
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <IconRail
          active={panel}
          onSelect={setPanel}
          onFullscreen={() =>
            previewArea.current
              ?.requestFullscreen()
              .catch(() => setStatus("Fullscreen isn't available in this browser.", true))
          }
        />
        <aside
          className={`${preferences.expandedSidebar ? "w-[28rem]" : "w-80"} shrink-0 space-y-4 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-4`}
        >
          {panel === "content" && (
            <>
              <SongCard song={song} onSong={(chosen) => setSong(chosen)} onStatus={setStatus} />
              <ContentFields template={template} values={values} setValue={setValue} />
              {hasBackground && (
                <BackgroundCard
                  background={background}
                  thumbnailSrc={src.replace(/index\.html$/, "assets/background.jpg")}
                  onBackground={chooseBackground}
                  onStatus={setStatus}
                />
              )}
            </>
          )}
          {panel === "customize" && (
            <CustomizePanel template={template} values={values} setValue={setValue} />
          )}
          {panel === "preferences" && (
            <PreferencesPanel preferences={preferences} onChange={setPreferences} />
          )}
        </aside>
        <main className="flex min-w-0 flex-1 items-center justify-center p-6">
          <div ref={previewArea} className="preview-area w-full max-w-5xl">
            <PreviewPlayer
              src={src}
              values={values}
              scale={previewScale(preferences.previewResolution)}
              onError={onPreviewError}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
