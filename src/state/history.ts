import type { Project } from "../core/model/types";
import type { SerializedProject } from "../core/serialize";
import { serializeProject } from "../core/serialize";

// Snapshot-based undo/redo. Snapshots are full serialized projects, so the
// restore path matches the JSON-load flow. In-memory only; not persisted.
export const HISTORY_CAP = 200;

export interface History {
  past: SerializedProject[];
  future: SerializedProject[];
}

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/**
 * Record `present` as a new undo point, clearing the redo stack. Called before
 * a mutating action so undo restores the pre-action state. Caps the past at
 * HISTORY_CAP, dropping the oldest entries.
 */
export function record(history: History, present: Project): History {
  const past = [...history.past, serializeProject(present)];
  if (past.length > HISTORY_CAP) past.splice(0, past.length - HISTORY_CAP);
  return { past, future: [] };
}

export interface Transition {
  history: History;
  snapshot: SerializedProject;
}

/** Move one step back. Returns null when there is nothing to undo. */
export function undo(history: History, present: Project): Transition | null {
  if (history.past.length === 0) return null;
  const past = history.past.slice(0, -1);
  const snapshot = history.past[history.past.length - 1];
  const future = [serializeProject(present), ...history.future];
  return { history: { past, future }, snapshot };
}

/** Move one step forward. Returns null when there is nothing to redo. */
export function redo(history: History, present: Project): Transition | null {
  if (history.future.length === 0) return null;
  const [snapshot, ...rest] = history.future;
  const past = [...history.past, serializeProject(present)];
  return { history: { past, future: rest }, snapshot };
}
