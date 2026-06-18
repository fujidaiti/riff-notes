import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, Part, Sheet } from "../../core/model/types";
import { DEFAULT_VEL, PIANO_MAX, PIANO_MIN, STEPS_PER_BAR } from "../../core/model/constants";
import { isRhythmPart } from "../../core/model/factory";
import { uid } from "../../core/model/uid";
import { computeMove, computeResizeLeft, computeResizeRight, type DragMetrics, type DragOrigin, type NotePatch } from "../../core/drag";
import { dropForeignPart } from "../../core/selection";
import type { AudioEngine } from "../../audio/AudioEngine";
import type { Action, SheetSelection } from "../../state/types";
import type { NoteRegion } from "../../ui/grid/Grid";
import { isCreateModifier } from "../platform";

const CLICK_MAX_MOVE = 3;

interface DragState {
  mode: "move" | "resize-l" | "resize-r";
  origins: DragOrigin[];
  part: Part;
  startX: number;
  startY: number;
  moved: boolean;
  subGranular: boolean;
  /** Create-modifier held at press — a non-moved click cycles velocity. */
  createMod: boolean;
  groupIds: Set<string>;
}

function applyPatches(sheet: Sheet, patches: Map<string, NotePatch>): Sheet {
  for (const p of sheet.parts) {
    for (const n of p.notes) {
      const patch = patches.get(n.id);
      if (patch) Object.assign(n, patch);
    }
  }
  return sheet;
}

function cloneSheet(sheet: Sheet): Sheet {
  return { ...sheet, parts: sheet.parts.map((p) => ({ ...p, notes: p.notes.map((n) => ({ ...n })) })) };
}

/**
 * Interaction for one sheet's grids: note selection, drag-move, edge-resize,
 * and modifier-click note creation. Drag previews live in local state (so they
 * never pollute undo history) and are committed once on pointer-up via a single
 * MUTATE_SHEET action computed against the pure core/drag math. Window
 * listeners are stable and read mutable refs to avoid stale closures.
 */
export function useGridInteraction(
  sheet: Sheet,
  selection: SheetSelection,
  dispatch: (a: Action) => void,
  cellW: number,
  cellH: number,
  engine?: AudioEngine,
) {
  const [preview, setPreview] = useState<Map<string, NotePatch> | null>(null);
  const drag = useRef<DragState | null>(null);
  const cfg = useRef({ sheet, selection, dispatch, cellW, cellH, engine });
  cfg.current = { sheet, selection, dispatch, cellW, cellH, engine };

  const computeFor = useCallback((d: DragState, dx: number, dy: number): Map<string, NotePatch> => {
    const { cellW: cw, cellH: ch, sheet: sh } = cfg.current;
    const m: DragMetrics = { cellW: cw, cellH: ch, sheetSteps: sh.barCount * STEPS_PER_BAR, partLo: d.part.lo, partHi: d.part.hi };
    if (d.mode === "move") return computeMove(d.origins, dx, dy, m, d.subGranular);
    if (d.mode === "resize-r") return computeResizeRight(d.origins, dx, m, d.subGranular);
    return computeResizeLeft(d.origins, dx, m, d.subGranular);
  }, []);

  // Stable window listeners installed once.
  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.abs(dx) < CLICK_MAX_MOVE && Math.abs(dy) < CLICK_MAX_MOVE) return;
      d.moved = true;
      d.subGranular = isCreateModifier(ev);
      setPreview(computeFor(d, dx, d.mode === "move" ? dy : 0));
    };
    const onUp = (ev: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const { dispatch: dsp, sheet: sh } = cfg.current;
      if (d.moved) {
        const patches = computeFor(d, ev.clientX - d.startX, d.mode === "move" ? ev.clientY - d.startY : 0);
        dsp({ type: "MUTATE_SHEET", sheetId: sh.id, mutate: (s) => applyPatches(s, patches) });
      } else if (d.createMod) {
        // Modifier-click without a drag cycles the selected notes' velocity.
        dsp({ type: "CYCLE_VELOCITY", sheetId: sh.id, noteIds: d.groupIds });
      }
      setPreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [computeFor]);

  const onNotePointerDown = useCallback((note: Note, ev: React.PointerEvent, region: NoteRegion) => {
    ev.preventDefault();
    const { sheet: sh, selection: sel, dispatch: dsp, engine: eng } = cfg.current;
    const part = sh.parts.find((p) => p.id === note.partId);
    if (!part) return;

    let selected = sel.noteIds;
    if (ev.shiftKey) {
      if (selected.has(note.id)) {
        selected = new Set(selected);
        selected.delete(note.id);
      } else {
        selected = dropForeignPart(sh, selected, note.partId);
        selected.add(note.id);
      }
      dsp({ type: "SET_SELECTION", sheetId: sh.id, noteIds: selected });
    } else if (!selected.has(note.id)) {
      selected = new Set([note.id]);
      dsp({ type: "SET_SELECTION", sheetId: sh.id, noteIds: selected });
      eng?.auditionNote(sh, note);
    }

    const groupIds = selected.has(note.id) ? selected : new Set([note.id]);
    const origins: DragOrigin[] = [];
    for (const n of part.notes) {
      if (groupIds.has(n.id)) {
        origins.push({ id: n.id, start: n.start, subOffset: n.subOffset, length: n.length, subLength: n.subLength, pitch: n.pitch });
      }
    }
    const mode = region === "resize-l" ? "resize-l" : region === "resize-r" ? "resize-r" : "move";
    drag.current = {
      mode,
      origins,
      part,
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      subGranular: isCreateModifier(ev),
      createMod: isCreateModifier(ev),
      groupIds,
    };
  }, []);

  const onGridPointerDown = useCallback((ev: React.PointerEvent) => {
    const { sheet: sh, dispatch: dsp, cellW: cw, cellH: ch, engine: eng } = cfg.current;
    const wrap = ev.currentTarget as HTMLElement;
    const part = sh.parts.find((p) => p.id === wrap.dataset.partId);
    if (!part) return;
    const sheetSteps = sh.barCount * STEPS_PER_BAR;
    const rect = wrap.getBoundingClientRect();
    const step = Math.floor((ev.clientX - rect.left) / cw);
    const pitch = part.hi - Math.floor((ev.clientY - rect.top) / ch);
    if (step < 0 || step >= sheetSteps) return;

    if (isCreateModifier(ev)) {
      ev.preventDefault();
      const lo = isRhythmPart(part) ? 0 : PIANO_MIN;
      const hi = isRhythmPart(part) ? 2 : PIANO_MAX;
      if (pitch < Math.max(lo, part.lo) || pitch > Math.min(hi, part.hi)) return;
      const id = uid();
      const note: Note = { id, partId: part.id, pitch, start: step, length: 1, vel: DEFAULT_VEL, subOffset: 0, subLength: 0 };
      dsp({
        type: "MUTATE_SHEET",
        sheetId: sh.id,
        mutate: (s) => void s.parts.find((p) => p.id === part.id)?.notes.push(note),
        selectNoteIds: new Set([id]),
      });
      eng?.auditionNote(sh, note);
      return;
    }

    if (pitch >= part.lo && pitch <= part.hi) {
      dsp({ type: "SET_CELL", sheetId: sh.id, cell: { partId: part.id, step, pitch } });
    } else {
      dsp({ type: "CLEAR_SELECTION", sheetId: sh.id });
    }
  }, []);

  const displaySheet: Sheet = preview ? applyPatches(cloneSheet(sheet), preview) : sheet;
  return { displaySheet, onNotePointerDown, onGridPointerDown };
}
