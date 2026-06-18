import { useEffect, useRef } from "react";
import { removeNotesByIds } from "../../core/notes";
import { copyNotes, pasteNotes, type Clipboard, type PasteAnchor } from "../../core/clipboard";
import { findNote, totalSteps } from "../../core/model/factory";
import { uid } from "../../core/model/uid";
import { shiftNoteSubOffset } from "../../core/timing";
import type { Action, AppState } from "../../state/types";
import { activeSheet } from "../../state/reducer";
import { isCreateModifier } from "../platform";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * Global editor keyboard shortcuts: undo/redo, delete, copy/cut/paste, toggle
 * annotations. Reads live state via a ref so the listener is installed once.
 */
export interface ShortcutHandlers {
  openQuantize: () => void;
  openHelp: () => void;
  onSave: () => void;
  onRewind: () => void;
  onRecord: () => void;
}

export function useKeyboardShortcuts(state: AppState, dispatch: (a: Action) => void, handlers: ShortcutHandlers) {
  const ref = useRef({ state, dispatch, handlers });
  ref.current = { state, dispatch, handlers };
  const clipboard = useRef<Clipboard | null>(null);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isEditable(ev.target)) return;
      const { state: st, dispatch: dsp, handlers: h } = ref.current;
      const sheet = activeSheet(st);
      const sel = st.ui.selection[sheet.id] ?? { noteIds: new Set<string>(), cell: null };
      const mod = isCreateModifier(ev);

      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        dsp({ type: ev.shiftKey ? "REDO" : "UNDO" });
        return;
      }
      if (mod && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        h.onSave();
        return;
      }
      if (mod && ev.key.toLowerCase() === "c") {
        clipboard.current = copyNotes(sheet, sel.noteIds);
        return;
      }
      if (mod && ev.key.toLowerCase() === "x") {
        clipboard.current = copyNotes(sheet, sel.noteIds);
        if (clipboard.current) {
          dsp({ type: "MUTATE_SHEET", sheetId: sheet.id, mutate: (s) => void removeNotesByIds(s, sel.noteIds), selectNoteIds: new Set() });
        }
        return;
      }
      if (mod && ev.key.toLowerCase() === "v") {
        const clip = clipboard.current;
        if (!clip) return;
        const anchor = resolvePasteAnchor(sheet, sel);
        if (!anchor) return;
        const res = pasteNotes(clip, anchor, totalSteps(sheet));
        if (res.notes.length === 0) return;
        dsp({
          type: "MUTATE_SHEET",
          sheetId: sheet.id,
          mutate: (s) => {
            const part = s.parts.find((p) => p.id === anchor.part.id);
            if (!part) return;
            part.notes.push(...res.notes);
            for (const a of res.annotations) {
              s.annotations.push({ id: uid(), text: a.text, noteIds: a.noteIds, shrunkWidth: 140, placement: { anchorNoteId: a.noteIds[0], dx: 8, dy: -8 } });
            }
          },
          selectNoteIds: new Set(res.notes.map((n) => n.id)),
        });
        if (res.outOfRange.count > 0) {
          const msg = `${res.outOfRange.count} pasted note(s) fall outside the part's pitch range. Extend the range to include them?`;
          if (window.confirm(msg)) {
            dsp({
              type: "UPDATE_PART",
              sheetId: sheet.id,
              partId: anchor.part.id,
              fields: {
                lo: Math.min(anchor.part.lo, res.outOfRange.min),
                hi: Math.max(anchor.part.hi, res.outOfRange.max),
              },
            });
          }
        }
        return;
      }
      if (mod && ev.key.toLowerCase() === "a") {
        ev.preventDefault();
        dsp({ type: "TOGGLE_ANNOTATIONS" });
        return;
      }
      if (mod && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") && sel.noteIds.size > 0) {
        ev.preventDefault();
        const delta = ev.key === "ArrowLeft" ? -1 : 1;
        dsp({
          type: "MUTATE_SHEET",
          sheetId: sheet.id,
          mutate: (s) => {
            for (const part of s.parts) {
              for (const note of part.notes) {
                if (sel.noteIds.has(note.id)) shiftNoteSubOffset(s, note, delta);
              }
            }
          },
          selectNoteIds: new Set(sel.noteIds),
        });
        return;
      }
      if ((ev.key === "Backspace" || ev.key === "Delete") && sel.noteIds.size > 0) {
        ev.preventDefault();
        dsp({ type: "MUTATE_SHEET", sheetId: sheet.id, mutate: (s) => void removeNotesByIds(s, sel.noteIds), selectNoteIds: new Set() });
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        h.onRewind();
        return;
      }
      if (!mod && ev.key.toLowerCase() === "q" && sel.noteIds.size > 0) {
        h.openQuantize();
        return;
      }
      if (!mod && ev.key.toLowerCase() === "r") {
        h.onRecord();
        return;
      }
      if (ev.key === "?") {
        h.openHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function resolvePasteAnchor(sheet: AppState["project"]["sheets"][number], sel: { noteIds: Set<string>; cell: { partId: string; step: number; pitch: number } | null }): PasteAnchor | null {
  if (sel.noteIds.size >= 1) {
    const firstId = [...sel.noteIds][0];
    const note = findNote(sheet, firstId);
    if (!note) return null;
    const part = sheet.parts.find((p) => p.id === note.partId);
    if (!part) return null;
    // top-left of the selection
    let minStart = Infinity;
    let maxPitch = -Infinity;
    for (const id of sel.noteIds) {
      const n = findNote(sheet, id);
      if (!n) continue;
      minStart = Math.min(minStart, n.start);
      maxPitch = Math.max(maxPitch, n.pitch);
    }
    return { part, step: minStart, pitch: maxPitch };
  }
  if (sel.cell) {
    const part = sheet.parts.find((p) => p.id === sel.cell!.partId);
    if (!part) return null;
    return { part, step: sel.cell.step, pitch: sel.cell.pitch };
  }
  return null;
}
