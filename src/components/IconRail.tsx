"use client";

// The icon rail on the left of the editor (like the Videobolt editor): each icon opens a
// panel; Fullscreen is an action. Labels appear on hover.
export type PanelId = "content" | "customize" | "preferences";

const PANELS: { id: PanelId; icon: string; label: string }[] = [
  { id: "content", icon: "▤", label: "Content" },
  { id: "customize", icon: "☰", label: "Customize" },
  { id: "preferences", icon: "⚙", label: "Preferences" },
];

type Props = {
  active: PanelId;
  onSelect: (panel: PanelId) => void;
  onFullscreen: () => void;
};

function RailButton(props: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`group relative flex h-12 w-12 items-center justify-center rounded-lg text-xl ${
        props.active
          ? "bg-zinc-800 text-amber-400"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
      }`}
    >
      {props.icon}
      <span className="pointer-events-none absolute left-14 z-10 hidden whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 group-hover:block">
        {props.label}
      </span>
    </button>
  );
}

export function IconRail({ active, onSelect, onFullscreen }: Props) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-zinc-800 bg-black py-3">
      {PANELS.map((p) => (
        <RailButton
          key={p.id}
          icon={p.icon}
          label={p.label}
          active={active === p.id}
          onClick={() => onSelect(p.id)}
        />
      ))}
      <RailButton icon="⛶" label="Fullscreen" onClick={onFullscreen} />
    </nav>
  );
}
