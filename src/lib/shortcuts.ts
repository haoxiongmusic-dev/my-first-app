/**
 * Keyboard shortcuts for the editor's undo/redo (M7 spec §4): Ctrl+Z (Cmd+Z on a Mac) undoes,
 * Ctrl+Shift+Z and Ctrl+Y redo. While the focus is in a text box, the browser's own undo of
 * the typing runs instead. Safe to use in the browser.
 */
type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};
type TargetLike = { tagName?: string; type?: string; isContentEditable?: boolean } | null;

export function historyShortcut(e: KeyLike): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.shiftKey) return "redo";
  return null;
}

/** Inputs where typing happens (anything else, like a slider or colour picker, is not). */
const TYPING_INPUTS = new Set(["", "text", "number", "search", "email", "url", "password", "tel"]);

export function isEditableTarget(t: TargetLike): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = (t.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TYPING_INPUTS.has((t.type ?? "").toLowerCase());
  return false;
}

/**
 * The editor's undo/redo for this key press, or null: not while typing in a box, and not while
 * a dialog such as the Export panel is open (its export uses the settings on screen).
 */
export function editorShortcut(
  e: KeyLike & { target: TargetLike },
  dialogOpen: boolean,
): "undo" | "redo" | null {
  if (dialogOpen || isEditableTarget(e.target)) return null;
  return historyShortcut(e);
}
