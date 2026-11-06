// Undo/redo for the editor's settings: each change is a step, except quick repeated changes to
// one field (a slider drag, typing), which join into one.
import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  HISTORY_LIMIT,
  type History,
  type HistoryAction,
  historyReducer,
  startHistory,
} from "@/lib/edit-history";

type S = { a: number; b: number };

function set(field: "a" | "b", value: number, now: number): HistoryAction<S> {
  return {
    type: "change",
    field,
    now,
    update: (s) => (s[field] === value ? s : { ...s, [field]: value }),
  };
}

function run(h: History<S>, ...actions: HistoryAction<S>[]): History<S> {
  return actions.reduce(historyReducer, h);
}

const start = () => startHistory<S>({ a: 0, b: 0 });

describe("edit history", () => {
  it("undo and redo walk back and forth through changes", () => {
    let h = run(start(), set("a", 1, 0), set("b", 2, 5000));
    expect(h.present).toEqual({ a: 1, b: 2 });
    h = run(h, { type: "undo" });
    expect(h.present).toEqual({ a: 1, b: 0 });
    h = run(h, { type: "undo" });
    expect(h.present).toEqual({ a: 0, b: 0 });
    expect(canUndo(h)).toBe(false);
    h = run(h, { type: "redo" }, { type: "redo" });
    expect(h.present).toEqual({ a: 1, b: 2 });
    expect(canRedo(h)).toBe(false);
  });

  it("a change that changes nothing is not a step", () => {
    const h0 = start();
    expect(run(h0, set("a", 0, 0))).toBe(h0);
  });

  it("quick changes to one field join into one step", () => {
    const h = run(start(), set("a", 1, 0), set("a", 2, 500), set("a", 3, 1400));
    expect(h.past).toHaveLength(1);
    expect(run(h, { type: "undo" }).present).toEqual({ a: 0, b: 0 });
  });

  it("changes 1 second apart are separate steps", () => {
    const h = run(start(), set("a", 1, 0), set("a", 2, 1000));
    expect(h.past).toHaveLength(2);
  });

  it("changes to different fields are separate steps, however quick", () => {
    const h = run(start(), set("a", 1, 0), set("b", 1, 100));
    expect(h.past).toHaveLength(2);
  });

  it("a change with no field never joins", () => {
    const h = run(
      start(),
      { type: "change", field: null, now: 0, update: (s) => ({ ...s, a: 1 }) },
      { type: "change", field: null, now: 10, update: (s) => ({ ...s, a: 2 }) },
    );
    expect(h.past).toHaveLength(2);
  });

  it("a new change after an undo drops the redo steps", () => {
    const h = run(start(), set("a", 1, 0), { type: "undo" }, set("b", 5, 3000));
    expect(h.future).toEqual([]);
    expect(canRedo(h)).toBe(false);
  });

  it("undo ends the join: the next quick change is its own step", () => {
    const h = run(start(), set("a", 1, 0), set("b", 1, 5000), { type: "undo" }, set("a", 2, 5100));
    expect(h.present).toEqual({ a: 2, b: 0 });
    expect(run(h, { type: "undo" }).present).toEqual({ a: 1, b: 0 });
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    let h = start();
    for (let i = 1; i <= 150; i++) h = run(h, set("a", i, i * 2000));
    expect(h.past).toHaveLength(100);
    expect(h.past[0]).toEqual({ a: 50, b: 0 });
  });

  it("a compound change is one step", () => {
    const h = run(start(), {
      type: "change",
      field: null,
      now: 0,
      update: (s) => ({ ...s, a: 7, b: 8 }),
    });
    expect(run(h, { type: "undo" }).present).toEqual({ a: 0, b: 0 });
  });

  it("undo or redo with nothing to do changes nothing", () => {
    const h0 = start();
    expect(run(h0, { type: "undo" })).toBe(h0);
    expect(run(h0, { type: "redo" })).toBe(h0);
  });
});
