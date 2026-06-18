import type { Project, Sheet } from "../core/model/types";
import { makeSheet } from "../core/model/factory";
import { deserializeProject, serializeProject } from "../core/serialize";
import { dropForeignPart, partOfSelection } from "../core/selection";
import { emptyHistory, record, redo, undo } from "./history";
import type { Action, AppState, SheetMutator, SheetSelection, UiState } from "./types";

function emptySelection(): SheetSelection {
  return { noteIds: new Set(), cell: null };
}

function selectionFor(ui: UiState, sheetId: string): SheetSelection {
  return ui.selection[sheetId] ?? emptySelection();
}

/** Reset view state to point at a (possibly new) project's sheets. */
function freshUi(project: Project, prev?: UiState): UiState {
  const active = prev && project.sheets.some((s) => s.id === prev.activeSheetId) ? prev.activeSheetId : project.sheets[0].id;
  return { activeSheetId: active, selection: {}, annotationsVisible: prev?.annotationsVisible ?? true };
}

export function initialState(project?: Project): AppState {
  const p = project ?? { name: "", sheets: [makeSheet("Sheet 1")] };
  return { project: p, ui: freshUi(p), history: emptyHistory() };
}

/** Clone the project replacing one sheet produced by `mutate` (applied to a clone). */
function withSheet(project: Project, sheetId: string, mutate: SheetMutator): Project {
  const sheets = project.sheets.map((s) => {
    if (s.id !== sheetId) return s;
    // Deep-clone via the serialize boundary so mutations can't leak into the
    // previous (history-captured) tree. Cheap relative to a full re-render.
    const clone = deserializeProject(serializeProject({ name: "", sheets: [s] }))!.sheets[0];
    mutate(clone);
    return clone;
  });
  return { ...project, sheets };
}

/** Record current project in history, then apply a sheet mutation. */
function commit(state: AppState, sheetId: string, mutate: SheetMutator): AppState {
  const history = record(state.history, state.project);
  const project = withSheet(state.project, sheetId, mutate);
  return { ...state, project, history };
}

function applySnapshot(state: AppState, snapshot: ReturnType<typeof serializeProject>, history: AppState["history"]): AppState {
  const project = deserializeProject(snapshot)!;
  return { project, ui: freshUi(project, state.ui), history };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD_PROJECT":
      return { project: action.project, ui: freshUi(action.project), history: emptyHistory() };

    case "NEW_PROJECT": {
      const project: Project = { name: "", sheets: [makeSheet("Sheet 1")] };
      return { project, ui: freshUi(project), history: emptyHistory() };
    }

    case "SET_ACTIVE_SHEET":
      if (!state.project.sheets.some((s) => s.id === action.sheetId)) return state;
      return { ...state, ui: { ...state.ui, activeSheetId: action.sheetId } };

    case "TOGGLE_ANNOTATIONS":
      return { ...state, ui: { ...state.ui, annotationsVisible: !state.ui.annotationsVisible } };

    case "SET_SELECTION": {
      const sel: SheetSelection = { noteIds: action.noteIds, cell: null };
      return { ...state, ui: { ...state.ui, selection: { ...state.ui.selection, [action.sheetId]: sel } } };
    }

    case "TOGGLE_NOTE": {
      const sheet = state.project.sheets.find((s) => s.id === action.sheetId);
      if (!sheet) return state;
      const cur = selectionFor(state.ui, action.sheetId);
      let next: Set<string>;
      if (cur.noteIds.has(action.note.id)) {
        next = new Set(cur.noteIds);
        next.delete(action.note.id);
      } else {
        next = dropForeignPart(sheet, cur.noteIds, action.note.partId);
        next.add(action.note.id);
      }
      return { ...state, ui: { ...state.ui, selection: { ...state.ui.selection, [action.sheetId]: { noteIds: next, cell: null } } } };
    }

    case "CLEAR_SELECTION":
      return { ...state, ui: { ...state.ui, selection: { ...state.ui.selection, [action.sheetId]: emptySelection() } } };

    case "SET_CELL":
      return { ...state, ui: { ...state.ui, selection: { ...state.ui.selection, [action.sheetId]: { noteIds: new Set(), cell: action.cell } } } };

    case "UNDO": {
      const t = undo(state.history, state.project);
      return t ? applySnapshot(state, t.snapshot, t.history) : state;
    }

    case "REDO": {
      const t = redo(state.history, state.project);
      return t ? applySnapshot(state, t.snapshot, t.history) : state;
    }

    case "SET_SHEET_FIELDS":
      return commit(state, action.sheetId, (s) => Object.assign(s, action.fields));

    case "SET_SCALE":
      return commit(state, action.sheetId, (s) => {
        s.scale = { ...action.scale };
      });

    case "ADD_SHEET": {
      const history = record(state.history, state.project);
      const sheet = makeSheet(`Sheet ${state.project.sheets.length + 1}`);
      const project = { ...state.project, sheets: [...state.project.sheets, sheet] };
      return { ...state, project, history, ui: { ...state.ui, activeSheetId: sheet.id } };
    }

    case "DELETE_SHEET": {
      if (state.project.sheets.length <= 1) return state;
      const history = record(state.history, state.project);
      const sheets = state.project.sheets.filter((s) => s.id !== action.sheetId);
      const project = { ...state.project, sheets };
      const ui = freshUi(project, state.ui);
      return { project, ui, history };
    }

    case "MUTATE_SHEET": {
      const next = commit(state, action.sheetId, action.mutate);
      if (!action.selectNoteIds) return next;
      const sel: SheetSelection = { noteIds: action.selectNoteIds, cell: null };
      return { ...next, ui: { ...next.ui, selection: { ...next.ui.selection, [action.sheetId]: sel } } };
    }

    default:
      return state;
  }
}

// Re-export for the editor: enforce single-part selection when needed.
export { partOfSelection };

/** Helper for components: read the active sheet, or the first sheet. */
export function activeSheet(state: AppState): Sheet {
  return state.project.sheets.find((s) => s.id === state.ui.activeSheetId) ?? state.project.sheets[0];
}
