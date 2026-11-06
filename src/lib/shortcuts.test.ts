// Keyboard shortcuts for undo/redo, and where they must leave the browser's own undo alone.
import { describe, expect, it } from "vitest";
import { historyShortcut, isEditableTarget } from "@/lib/shortcuts";

const key = (
  k: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {},
) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("historyShortcut", () => {
  it("Ctrl/Cmd+Z undoes", () => {
    expect(historyShortcut(key("z", { ctrl: true }))).toBe("undo");
    expect(historyShortcut(key("z", { meta: true }))).toBe("undo");
  });

  it("Ctrl/Cmd+Shift+Z and Ctrl+Y redo", () => {
    expect(historyShortcut(key("Z", { ctrl: true, shift: true }))).toBe("redo");
    expect(historyShortcut(key("Z", { meta: true, shift: true }))).toBe("redo");
    expect(historyShortcut(key("y", { ctrl: true }))).toBe("redo");
  });

  it("anything else is not a history shortcut", () => {
    expect(historyShortcut(key("z"))).toBeNull();
    expect(historyShortcut(key("z", { ctrl: true, alt: true }))).toBeNull();
    expect(historyShortcut(key("x", { ctrl: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("text boxes and editable areas keep their own undo", () => {
    for (const type of ["text", "number", "search"]) {
      expect(isEditableTarget({ tagName: "INPUT", type })).toBe(true);
    }
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("sliders, pickers, switches and the page use the editor's undo", () => {
    for (const type of ["range", "color", "checkbox"]) {
      expect(isEditableTarget({ tagName: "INPUT", type })).toBe(false);
    }
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
