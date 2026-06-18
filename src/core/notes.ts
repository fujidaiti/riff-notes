import type { Sheet } from "./model/types";

/**
 * Remove notes whose ids are in `idSet` from every part of `sheet`, then prune
 * any annotations whose noteIds become empty. If an annotation's anchor note
 * was removed but other members survive, the anchor is re-pointed at the first
 * surviving member (offsets preserved). Mutates the sheet; returns the count
 * of notes actually removed.
 *
 * Note: the editor additionally runs a DOM-based reconciliation that preserves
 * the annotation card's on-screen position before calling this. That step
 * needs rendered rects, so it lives in the editor layer; this function is the
 * pure, model-only fallback.
 */
export function removeNotesByIds(sheet: Sheet, idSet: ReadonlySet<string>): number {
  if (!idSet || idSet.size === 0) return 0;
  let removed = 0;
  for (const p of sheet.parts) {
    p.notes = p.notes.filter((n) => {
      if (idSet.has(n.id)) {
        removed++;
        return false;
      }
      return true;
    });
  }
  if (sheet.annotations && sheet.annotations.length > 0) {
    sheet.annotations = sheet.annotations
      .map((a) => {
        const noteIds = a.noteIds.filter((id) => !idSet.has(id));
        let placement = a.placement;
        if (placement && !noteIds.includes(placement.anchorNoteId) && noteIds.length > 0) {
          placement = { anchorNoteId: noteIds[0], dx: placement.dx, dy: placement.dy };
        }
        return { ...a, noteIds, placement };
      })
      .filter((a) => a.noteIds.length > 0);
  }
  return removed;
}
