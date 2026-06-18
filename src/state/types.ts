import type { Note, Project, Scale, Sheet } from "../core/model/types";
import type { History } from "./history";

/** Empty-cell selection target (for placement / paste). */
export interface CellSelection {
  partId: string;
  step: number;
  pitch: number;
}

/** Per-sheet selection state. Runtime/view only — never serialized. */
export interface SheetSelection {
  noteIds: Set<string>;
  cell: CellSelection | null;
}

export interface UiState {
  activeSheetId: string;
  /** Selection keyed by sheet id, so switching tabs preserves it. */
  selection: Record<string, SheetSelection>;
  annotationsVisible: boolean;
}

export interface AppState {
  project: Project;
  ui: UiState;
  history: History;
}

/** A function that mutates a draft sheet in place. */
export type SheetMutator = (sheet: Sheet) => void;

export type Action =
  // --- project lifecycle (no history) ---
  | { type: "LOAD_PROJECT"; project: Project }
  | { type: "NEW_PROJECT" }
  // --- navigation / view (no history) ---
  | { type: "SET_ACTIVE_SHEET"; sheetId: string }
  | { type: "TOGGLE_ANNOTATIONS" }
  // --- selection (no history) ---
  | { type: "SET_SELECTION"; sheetId: string; noteIds: Set<string> }
  | { type: "TOGGLE_NOTE"; sheetId: string; note: Pick<Note, "id" | "partId"> }
  | { type: "CLEAR_SELECTION"; sheetId: string }
  | { type: "SET_CELL"; sheetId: string; cell: CellSelection | null }
  // --- undo/redo ---
  | { type: "UNDO" }
  | { type: "REDO" }
  // --- history-recording mutations ---
  | { type: "SET_SHEET_FIELDS"; sheetId: string; fields: Partial<Pick<Sheet, "title" | "notes" | "bpm" | "barCount">> }
  | { type: "SET_SCALE"; sheetId: string; scale: Scale }
  | { type: "ADD_SHEET" }
  | { type: "DELETE_SHEET"; sheetId: string }
  // Escape hatch: apply an arbitrary sheet mutation, recorded in history. The
  // editor's interaction hooks use this to commit drag/resize/create/etc.
  // results that were computed against the pure core.
  | { type: "MUTATE_SHEET"; sheetId: string; mutate: SheetMutator; selectNoteIds?: Set<string> };
