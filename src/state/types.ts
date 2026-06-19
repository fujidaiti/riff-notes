import type { InstrumentId, Note, PartMix, Project, Scale, Sheet } from "../core/model/types";
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
  | { type: "SET_PROJECT_NAME"; name: string }
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
  | { type: "ADD_PART"; sheetId: string; instrument: InstrumentId; insertAt?: number }
  | { type: "DELETE_PART"; sheetId: string; partId: string }
  | { type: "UPDATE_PART"; sheetId: string; partId: string; fields: { name?: string; lo?: number; hi?: number; instrument?: InstrumentId } }
  | { type: "QUANTIZE_SELECTION"; sheetId: string; noteIds: Set<string>; posSub: number; lenSub: number }
  | { type: "CYCLE_VELOCITY"; sheetId: string; noteIds: Set<string> }
  // --- annotations ---
  | { type: "ADD_ANNOTATION"; sheetId: string; noteIds: string[] }
  | { type: "UPDATE_ANNOTATION"; sheetId: string; id: string; text: string }
  | { type: "DELETE_ANNOTATION"; sheetId: string; id: string }
  | { type: "MOVE_ANNOTATION"; sheetId: string; id: string; dx: number; dy: number } // no history (drag)
  | { type: "RESIZE_ANNOTATION"; sheetId: string; id: string; shrunkWidth: number; dx: number } // no history (drag)
  // --- mixer (persisted but NOT recorded in undo history) ---
  | { type: "SET_PART_MIX"; sheetId: string; partId: string; patch: Partial<PartMix> }
  | { type: "SET_MASTER_MIX"; sheetId: string; patch: Partial<{ vol: number; mute: boolean }> }
  // Escape hatch: apply an arbitrary sheet mutation, recorded in history. The
  // editor's interaction hooks use this to commit drag/resize/create/etc.
  // results that were computed against the pure core.
  | { type: "MUTATE_SHEET"; sheetId: string; mutate: SheetMutator; selectNoteIds?: Set<string> }
  // Like MUTATE_SHEET but WITHOUT recording history — for high-frequency live
  // updates (e.g. each note during a MIDI take). Pair with PUSH_HISTORY once at
  // the start so the whole take is a single undo step.
  | { type: "MUTATE_SHEET_LIVE"; sheetId: string; mutate: SheetMutator }
  | { type: "PUSH_HISTORY" };
