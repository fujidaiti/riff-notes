import type { Project, Sheet } from "../core/model/types";
import { STEPS_PER_BAR, VEL_LABELS, getInstrument } from "../core/model/constants";
import { defaultPartMix, makePart, makeSheet } from "../core/model/factory";
import { uid } from "../core/model/uid";
import { quantizeNotes } from "../core/quantize";
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

/** Apply a sheet mutation WITHOUT recording history (e.g. mixer changes). */
function update(state: AppState, sheetId: string, mutate: SheetMutator): AppState {
  return { ...state, project: withSheet(state.project, sheetId, mutate) };
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

    case "SET_PROJECT_NAME":
      return { ...state, project: { ...state.project, name: action.name } };

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
      return commit(state, action.sheetId, (s) => {
        const prevBarCount = s.barCount;
        Object.assign(s, action.fields);
        // When the bar count is reduced, remove notes that now fall beyond the sheet.
        if (typeof action.fields.barCount === "number" && s.barCount < prevBarCount) {
          const maxStep = s.barCount * STEPS_PER_BAR;
          for (const p of s.parts) p.notes = p.notes.filter((n) => n.start < maxStep);
        }
      });

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

    case "IMPORT_SHEET": {
      const history = record(state.history, state.project);
      const project = { ...state.project, sheets: [...state.project.sheets, action.sheet] };
      return { ...state, project, history, ui: { ...state.ui, activeSheetId: action.sheet.id } };
    }

    case "DELETE_SHEET": {
      if (state.project.sheets.length <= 1) return state;
      const history = record(state.history, state.project);
      const sheets = state.project.sheets.filter((s) => s.id !== action.sheetId);
      const project = { ...state.project, sheets };
      const ui = freshUi(project, state.ui);
      return { project, ui, history };
    }

    case "ADD_PART":
      return commit(state, action.sheetId, (s) => {
        const part = makePart(undefined, action.instrument);
        if (action.insertAt != null && action.insertAt >= 0 && action.insertAt <= s.parts.length) {
          s.parts.splice(action.insertAt, 0, part);
        } else {
          s.parts.push(part);
        }
        s.mix.parts[part.id] = defaultPartMix();
      });

    case "DELETE_PART":
      return commit(state, action.sheetId, (s) => {
        if (s.parts.length <= 1) return;
        s.parts = s.parts.filter((p) => p.id !== action.partId);
        delete s.mix.parts[action.partId];
        s.annotations = s.annotations.filter((a) => a.noteIds.length > 0);
      });

    case "UPDATE_PART":
      return commit(state, action.sheetId, (s) => {
        const part = s.parts.find((p) => p.id === action.partId);
        if (!part) return;
        const { name, lo, hi, instrument } = action.fields;
        if (name !== undefined) part.name = name;
        if (instrument !== undefined && instrument !== part.instrument) {
          // Crossing the pitched/fixed boundary changes the row layout, so
          // reset the range to the instrument defaults and drop the notes.
          const inst = getInstrument(instrument);
          const prev = getInstrument(part.instrument);
          part.instrument = instrument;
          if (inst.pitchMode !== prev.pitchMode) {
            part.lo = inst.defaultLo;
            part.hi = inst.defaultHi;
            part.notes = [];
            s.annotations = s.annotations.filter((a) => a.noteIds.length > 0);
          }
        }
        const inst = getInstrument(part.instrument);
        if (inst.pitchMode === "pitched") {
          if (lo !== undefined) part.lo = lo;
          if (hi !== undefined) part.hi = hi;
          if (part.lo > part.hi) [part.lo, part.hi] = [part.hi, part.lo];
        }
      });

    case "QUANTIZE_SELECTION":
      return commit(state, action.sheetId, (s) => {
        const notes = s.parts.flatMap((p) => p.notes.filter((n) => action.noteIds.has(n.id)));
        quantizeNotes(s, notes, action.posSub, action.lenSub);
      });

    case "CYCLE_VELOCITY":
      return commit(state, action.sheetId, (s) => {
        for (const p of s.parts) {
          for (const n of p.notes) {
            if (action.noteIds.has(n.id)) n.vel = (n.vel + 1) % VEL_LABELS.length;
          }
        }
      });

    case "ADD_ANNOTATION":
      if (action.noteIds.length === 0) return state;
      return commit(state, action.sheetId, (s) => {
        // Anchor on the earliest member; offset the card up-and-right of it.
        const ids = new Set(action.noteIds);
        const members = s.parts.flatMap((p) => p.notes.filter((n) => ids.has(n.id)));
        if (members.length === 0) return;
        const anchor = members.reduce((a, b) => (a.start <= b.start ? a : b));
        s.annotations.push({
          id: uid(),
          text: "Note",
          noteIds: [...action.noteIds],
          shrunkWidth: 140,
          placement: { anchorNoteId: anchor.id, dx: 8, dy: -22 },
        });
      });

    case "UPDATE_ANNOTATION":
      return commit(state, action.sheetId, (s) => {
        const a = s.annotations.find((x) => x.id === action.id);
        if (a) a.text = action.text;
      });

    case "DELETE_ANNOTATION":
      return commit(state, action.sheetId, (s) => {
        s.annotations = s.annotations.filter((a) => a.id !== action.id);
      });

    case "MOVE_ANNOTATION":
      return update(state, action.sheetId, (s) => {
        const a = s.annotations.find((x) => x.id === action.id);
        if (a) a.placement = { ...a.placement, dx: action.dx, dy: action.dy };
      });

    case "RESIZE_ANNOTATION":
      return update(state, action.sheetId, (s) => {
        const a = s.annotations.find((x) => x.id === action.id);
        if (a) {
          a.shrunkWidth = action.shrunkWidth;
          a.placement = { ...a.placement, dx: action.dx };
        }
      });

    case "SET_PART_MIX":
      return update(state, action.sheetId, (s) => {
        const pm = s.mix.parts[action.partId] ?? defaultPartMix();
        const next = { ...pm, ...action.patch };
        // mute and solo are mutually exclusive, matching the legacy UI.
        if (action.patch.mute) next.solo = false;
        if (action.patch.solo) next.mute = false;
        s.mix.parts[action.partId] = next;
      });

    case "SET_MASTER_MIX":
      return update(state, action.sheetId, (s) => {
        s.mix.master = { ...s.mix.master, ...action.patch };
      });

    case "MUTATE_SHEET": {
      const next = commit(state, action.sheetId, action.mutate);
      if (!action.selectNoteIds) return next;
      const sel: SheetSelection = { noteIds: action.selectNoteIds, cell: null };
      return { ...next, ui: { ...next.ui, selection: { ...next.ui.selection, [action.sheetId]: sel } } };
    }

    case "MUTATE_SHEET_LIVE":
      return update(state, action.sheetId, action.mutate);

    case "PUSH_HISTORY":
      return { ...state, history: record(state.history, state.project) };

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
