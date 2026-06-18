import { useEffect, useRef } from "react";
import { removeNotesByIds } from "../../core/notes";
import { copyNotes, pasteNotes, type Clipboard, type PasteAnchor } from "../../core/clipboard";
import { findNote, totalSteps } from "../../core/model/factory";
import { uid } from "../../core/model/uid";
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
        return;
      }
      if (mod && ev.key.toLowerCase() === "a") {
        ev.preventDefault();
        dsp({ type: "TOGGLE_ANNOTATIONS" });
        return;
      }
      if ((ev.key === "Backspace" || ev.key === "Delete") && sel.noteIds.size > 0) {
        ev.preventDefault();
        dsp({ type: "MUTATE_SHEET", sheetId: sheet.id, mutate: (s) => void removeNotesByIds(s, sel.noteIds), selectNoteIds: new Set() });
        return;
      }
      if (!mod && ev.key.toLowerCase() === "q" && sel.noteIds.size > 0) {
        h.openQuantize();
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
