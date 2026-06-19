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
  stepHighlight: HTMLDivElement | null;
  /** Note that was clicked — if released without drag and already multi-selected, collapses selection to this note. */
  clickedNoteId: string;
  clickedWasInMultiSelection: boolean;
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

interface RubberState {
  startX: number;
  startY: number;
  additive: boolean;
  base: Set<string>;
  cell: { partId: string; step: number; pitch: number } | null;
  moved: boolean;
  overlay: HTMLDivElement | null;
  /** First part the band touched — selection is constrained to it. */
  lockedPartId: string | null;
}

/**
 * Update the rubber-band overlay and recompute the selection by hit-testing the
 * band rectangle against rendered note elements (`div[data-note-id]`). The
 * selection locks to the first part touched, preserving the single-part
 * invariant even though the band can span bars and parts visually.
 */
function updateRubberBand(rb: RubberState, x: number, y: number, dispatch: (a: Action) => void, sheetId: string): void {
  const left = Math.min(rb.startX, x);
  const top = Math.min(rb.startY, y);
  const w = Math.abs(x - rb.startX);
  const h = Math.abs(y - rb.startY);

  if (!rb.overlay) {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;border:1px solid var(--note-sel,#2b6cb0);background:rgba(43,108,176,0.12);pointer-events:none;z-index:9999;";
    document.body.appendChild(el);
    rb.overlay = el;
  }
  Object.assign(rb.overlay.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });

  const sel = new Set(rb.additive ? rb.base : []);
  const rectRight = left + w;
  const rectBottom = top + h;
  for (const el of document.querySelectorAll<HTMLElement>("div[data-note-id]")) {
    const r = el.getBoundingClientRect();
    if (r.left >= rectRight || r.right <= left || r.top >= rectBottom || r.bottom <= top) continue;
    const partId = el.closest<HTMLElement>("[data-part-id]")?.dataset.partId;
    if (!partId) continue;
    if (!rb.lockedPartId) rb.lockedPartId = partId;
    if (partId !== rb.lockedPartId) continue;
    const id = el.dataset.noteId;
    if (id) sel.add(id);
  }
  dispatch({ type: "SET_SELECTION", sheetId, noteIds: sel });
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
  const rubber = useRef<RubberState | null>(null);
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
      const rb = rubber.current;
      if (rb) {
        if (!rb.moved && Math.abs(ev.clientX - rb.startX) < CLICK_MAX_MOVE && Math.abs(ev.clientY - rb.startY) < CLICK_MAX_MOVE) return;
        rb.moved = true;
        updateRubberBand(rb, ev.clientX, ev.clientY, cfg.current.dispatch, cfg.current.sheet.id);
        return;
      }
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.abs(dx) < CLICK_MAX_MOVE && Math.abs(dy) < CLICK_MAX_MOVE) return;
      d.moved = true;
      d.subGranular = isCreateModifier(ev);
      const patches = computeFor(d, dx, d.mode === "move" ? dy : 0);
      setPreview(patches);
      // Step-highlight: show a vertical line at the snapped step position.
      if (d.mode === "move" || d.mode === "resize-l") {
        const firstPatch = patches.values().next().value as (typeof patches extends Map<string, infer V> ? V : never) | undefined;
        const snapStep = firstPatch?.start ?? null;
        const gridEl = document.querySelector<HTMLElement>(`[data-part-id="${d.part.id}"]`);
        if (snapStep != null && gridEl) {
          if (!d.stepHighlight) {
            const el = document.createElement("div");
            el.style.cssText = "position:absolute;top:0;width:2px;height:100%;background:var(--note-sel,#2b6cb0);opacity:0.7;pointer-events:none;z-index:8;";
            gridEl.appendChild(el);
            d.stepHighlight = el;
          }
          d.stepHighlight.style.left = `${snapStep * cfg.current.cellW}px`;
        }
      }
    };
    const onUp = (ev: PointerEvent) => {
      const rb = rubber.current;
      if (rb) {
        rubber.current = null;
        rb.overlay?.remove();
        const { dispatch: dsp, sheet: sh } = cfg.current;
        if (!rb.moved) {
          if (rb.cell) dsp({ type: "SET_CELL", sheetId: sh.id, cell: rb.cell });
          else dsp({ type: "CLEAR_SELECTION", sheetId: sh.id });
        }
        return;
      }
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      d.stepHighlight?.remove();
      const { dispatch: dsp, sheet: sh } = cfg.current;
      if (d.moved) {
        const patches = computeFor(d, ev.clientX - d.startX, d.mode === "move" ? ev.clientY - d.startY : 0);
        dsp({ type: "MUTATE_SHEET", sheetId: sh.id, mutate: (s) => applyPatches(s, patches) });
      } else if (d.createMod) {
        // Modifier-click without a drag cycles the selected notes' velocity.
        dsp({ type: "CYCLE_VELOCITY", sheetId: sh.id, noteIds: d.groupIds });
      } else if (!ev.shiftKey && d.clickedWasInMultiSelection) {
        // Click-release on an already-selected note in a multi-selection collapses to just that note.
        dsp({ type: "SET_SELECTION", sheetId: sh.id, noteIds: new Set([d.clickedNoteId]) });
      }
      setPreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      rubber.current?.overlay?.remove();
      drag.current?.stepHighlight?.remove();
    };
  }, [computeFor]);

  const onNotePointerDown = useCallback((note: Note, ev: React.PointerEvent, region: NoteRegion) => {
    ev.preventDefault();
    ev.stopPropagation(); // prevent bubbling to grid, which would start a rubber-band simultaneously
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
    } else {
      // Note already selected — still audition it on click.
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
      stepHighlight: null,
      clickedNoteId: note.id,
      clickedWasInMultiSelection: sel.noteIds.has(note.id) && sel.noteIds.size > 1,
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

    // Begin a rubber-band: a plain press that doesn't move just sets the cell
    // (or clears); dragging selects notes across bars/parts. Shift keeps the
    // current selection as the additive base.
    const inRange = pitch >= part.lo && pitch <= part.hi;
    rubber.current = {
      startX: ev.clientX,
      startY: ev.clientY,
      additive: ev.shiftKey,
      base: ev.shiftKey ? new Set(cfg.current.selection.noteIds) : new Set(),
      cell: inRange ? { partId: part.id, step, pitch } : null,
      moved: false,
      overlay: null,
      lockedPartId: null,
    };
  }, []);

  const displaySheet: Sheet = preview ? applyPatches(cloneSheet(sheet), preview) : sheet;
  return { displaySheet, onNotePointerDown, onGridPointerDown };
}
