import type { Sheet } from "./model/types";

// Selection is runtime/view state (a set of note ids), never serialized. These
// helpers are pure: they take the current selection and return a *new* set,
// which suits the reducer's immutable update model. The single-part invariant
// (a selection may only span one part) is enforced here.

export type Selection = ReadonlySet<string>;

/** The partId of the (single) part a selection belongs to, or null. */
export function partOfSelection(sheet: Sheet, selected: Selection): string | null {
  if (selected.size === 0) return null;
  for (const p of sheet.parts) {
    for (const n of p.notes) if (selected.has(n.id)) return n.partId;
  }
  return null;
}

/** Drop any selected notes that belong to a part other than `keepPartId`. */
export function dropForeignPart(sheet: Sheet, selected: Selection, keepPartId: string | null): Set<string> {
  const next = new Set(selected);
  if (!keepPartId || next.size === 0) return next;
  for (const p of sheet.parts) {
    for (const n of p.notes) {
      if (next.has(n.id) && n.partId !== keepPartId) next.delete(n.id);
    }
  }
  return next;
}

/** Toggle a note in/out of the selection, enforcing the single-part invariant. */
export function toggleNote(sheet: Sheet, selected: Selection, note: { id: string; partId: string }): Set<string> {
  if (selected.has(note.id)) {
    const next = new Set(selected);
    next.delete(note.id);
    return next;
  }
  const next = dropForeignPart(sheet, selected, note.partId);
  next.add(note.id);
  return next;
}

export function isNoteSelected(selected: Selection, noteId: string): boolean {
  return selected.has(noteId);
}

export function singleSelection(noteId: string): Set<string> {
  return new Set([noteId]);
}
