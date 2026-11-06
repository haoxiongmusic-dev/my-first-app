/**
 * Undo/redo for the editor's settings (M7 spec §4). The history is pure: state in, state out,
 * with the time passed in, so it is unit-tested without a browser. Each change is one step,
 * except that changes to the same field less than JOIN_MS apart join the step before (one
 * slider drag or one burst of typing is one step). Changes with no field (a preset, a
 * background picture) never join.
 */
export const HISTORY_LIMIT = 100;
export const JOIN_MS = 1000;

export type History<S> = {
  past: S[];
  present: S;
  future: S[];
  /** the field whose quick changes still join the current step, if any */
  joinField: string | null;
  /** when that field last changed */
  joinAt: number;
};

export type HistoryAction<S> =
  | { type: "change"; update: (s: S) => S; field: string | null; now: number }
  | { type: "undo" }
  | { type: "redo" };

export function startHistory<S>(present: S): History<S> {
  return { past: [], present, future: [], joinField: null, joinAt: 0 };
}

export function historyReducer<S>(h: History<S>, a: HistoryAction<S>): History<S> {
  switch (a.type) {
    case "change": {
      const next = a.update(h.present);
      if (next === h.present) return h;
      const joins = a.field !== null && a.field === h.joinField && a.now - h.joinAt < JOIN_MS;
      return {
        past: joins ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        joinField: a.field,
        joinAt: a.now,
      };
    }
    case "undo": {
      if (h.past.length === 0) return h;
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future],
        joinField: null,
        joinAt: 0,
      };
    }
    case "redo": {
      if (h.future.length === 0) return h;
      return {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
        joinField: null,
        joinAt: 0,
      };
    }
  }
}

export const canUndo = <S>(h: History<S>): boolean => h.past.length > 0;
export const canRedo = <S>(h: History<S>): boolean => h.future.length > 0;
