"use client";

// The editor (spec §4): top bar, icon rail, a side panel, and the live preview.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { APP_NAME } from "@/lib/app-info";
import { canRedo, canUndo, type History, historyReducer, startHistory } from "@/lib/edit-history";
import { previewScale, previewSrc, previewValues } from "@/lib/editor-state";
import { type FormTemplate, imageFields, mergeValues } from "@/lib/form-model";
import { editorShortcut } from "@/lib/shortcuts";
import type { TemplatePreset, TemplateValues } from "@/lib/template-values";
import { IconRail, type PanelId } from "./IconRail";
import { applyPreset, presetMatches } from "@/lib/presets";
import { PreferencesPanel } from "./PreferencesPanel";
import { PresetsPanel } from "./PresetsPanel";
import { PreviewPlayer } from "./PreviewPlayer";
import type { Section } from "@/lib/section";
import { BackgroundCard, type ChosenBackground } from "./BackgroundCard";
import { ExportPanel } from "./ExportPanel";
import { RenderStatus } from "./RenderStatus";
import { ImageCard } from "./ImageCard";
import { ContentFields, CustomizePanel } from "./SettingsForm";
import { type ChosenSong, SongCard } from "./SongCard";
import { usePreferences } from "./usePreferences";

export type EditorTemplate = FormTemplate & { id: string };

type Status = { text: string; isError: boolean };

/** What undo/redo steps through: the settings and the chosen background picture. */
type Snapshot = { values: TemplateValues; background: ChosenBackground | null };

export function Editor({ template }: { template: EditorTemplate }) {
  const [history, dispatch] = useReducer(historyReducer<Snapshot>, null, (): History<Snapshot> =>
    startHistory({ values: mergeValues(template, {}), background: null }),
  );
  const { values, background } = history.present;
  const setValue = useCallback(
    (id: string, value: string | number | boolean) =>
      dispatch({
        type: "change",
        field: id,
        now: Date.now(),
        update: (s) =>
          s.values[id] === value ? s : { ...s, values: { ...s.values, [id]: value } },
      }),
    [],
  );
  const pickPreset = useCallback(
    (preset: TemplatePreset) =>
      dispatch({
        type: "change",
        field: null,
        now: Date.now(),
        update: (s) => ({ ...s, values: applyPreset(template, s.values, preset) }),
      }),
    [template],
  );
  // The preview gets picture addresses instead of image ids (exports still send the ids).
  const sentToPreview = useMemo(
    () => previewValues(template.variables, values),
    [template.variables, values],
  );
  const [song, setSong] = useState<ChosenSong | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (Cmd on a Mac), except while typing in a box or while the
  // Export panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = editorShortcut(
        e as KeyboardEvent & { target: HTMLElement | null },
        exportOpen,
      );
      if (!action) return;
      e.preventDefault();
      dispatch({ type: action });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen]);
  const [exportProgress, setExportProgress] = useState("");
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
    // One step: the picture and Show background change together.
    (chosen: ChosenBackground | null) =>
      dispatch({
        type: "change",
        field: null,
        now: Date.now(),
        update: (s) => ({
          background: chosen,
          values: { ...s.values, showBackground: chosen !== null },
        }),
      }),
    [],
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
          {exportProgress || status.text}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo(history)}
            onClick={() => dispatch({ type: "undo" })}
            className="rounded px-2 py-1 text-lg text-zinc-300 hover:bg-zinc-800 disabled:text-zinc-700 disabled:hover:bg-transparent"
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo(history)}
            onClick={() => dispatch({ type: "redo" })}
            className="rounded px-2 py-1 text-lg text-zinc-300 hover:bg-zinc-800 disabled:text-zinc-700 disabled:hover:bg-transparent"
          >
            ↷
          </button>
        </div>
        <RenderStatus />
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-400"
        >
          Export
        </button>
      </header>
      <ExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        templateId={template.id}
        song={song}
        section={section}
        values={values}
        backgroundId={background?.backgroundId ?? null}
        onProgress={setExportProgress}
      />

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
              <SongCard
                song={song}
                section={section}
                onSection={setSection}
                onSong={(chosen) => {
                  setSong(chosen);
                  setSection({ start: 0, end: chosen.duration }); // a new song exports whole
                }}
                onStatus={setStatus}
              />
              <ContentFields template={template} values={values} setValue={setValue} />
              {imageFields(template).map((variable) => (
                <ImageCard
                  key={variable.id}
                  variable={variable}
                  value={String(values[variable.id] ?? "")}
                  onChange={(id) => setValue(variable.id, id)}
                  onStatus={setStatus}
                />
              ))}
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
          {panel === "presets" && (
            <PresetsPanel
              templateId={template.id}
              presets={template.manifest.presets}
              isActive={(preset) => presetMatches(template, values, preset)}
              onApply={pickPreset}
            />
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
              values={sentToPreview}
              scale={previewScale(preferences.previewResolution)}
              onError={onPreviewError}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
