import type { Note, Sheet } from "./model/types";
import { SUB_PER_STEP } from "./model/constants";
import { totalSteps } from "./model/factory";
import { noteLengthSub, noteStartSub, subToLength, subToStart } from "./timing";

/** Quantize grid choices, in sub-steps. `sub: 0` means "don't change". */
export const QUANTIZE_GRIDS: ReadonlyArray<{ label: string; sub: number }> = [
  { label: "Don't change", sub: 0 },
  { label: "1/64 note", sub: 1 },
  { label: "1/32 note", sub: 2 },
  { label: "1/16 note", sub: 4 },
  { label: "1/8 note", sub: 8 },
  { label: "1/4 note", sub: 16 },
  { label: "1/2 bar", sub: 32 },
  { label: "1 bar", sub: 64 },
];

export interface QuantizeResult {
  start: number;
  subOffset: number;
  length: number;
  subLength: number;
  changed: boolean;
}

/**
 * Pure quantize math for a single note. `posSub > 0` snaps the start to the
 * nearest multiple of posSub; `lenSub > 0` forces the length. The result is
 * clamped so the note stays within the sheet.
 */
export function quantizeNote(
  note: Pick<Note, "start" | "length" | "subOffset" | "subLength">,
  posSub: number,
  lenSub: number,
  totalSheetSub: number,
): QuantizeResult {
  const absSub = note.start * SUB_PER_STEP + (note.subOffset || 0);
  const oldLenSub = note.length * SUB_PER_STEP + (note.subLength || 0);

  const newLenSub = lenSub > 0 ? lenSub : oldLenSub;
  let newAbsSub = posSub > 0 ? Math.round(absSub / posSub) * posSub : absSub;

  const maxAbsSub = Math.max(0, totalSheetSub - newLenSub);
  if (newAbsSub < 0) newAbsSub = 0;
  if (newAbsSub > maxAbsSub) newAbsSub = maxAbsSub;

  const changed = newAbsSub !== absSub || newLenSub !== oldLenSub;
  const { start, subOffset } = subToStart(newAbsSub);
  const { length, subLength } = subToLength(newLenSub);
  return { start, subOffset, length, subLength, changed };
}

/**
 * Apply quantization to the given notes in a sheet (mutates them). Returns the
 * number of notes actually changed. No-op when both grids are <= 0.
 */
export function quantizeNotes(sheet: Sheet, notes: Note[], posSub: number, lenSub: number): number {
  if (posSub <= 0 && lenSub <= 0) return 0;
  const totalSheetSub = totalSteps(sheet) * SUB_PER_STEP;
  let changedCount = 0;
  for (const n of notes) {
    const r = quantizeNote(n, posSub, lenSub, totalSheetSub);
    if (!r.changed) continue;
    n.start = r.start;
    n.subOffset = r.subOffset;
    n.length = r.length;
    n.subLength = r.subLength;
    changedCount++;
  }
  return changedCount;
}

// Re-exported for callers that work directly in sub-steps.
export { noteStartSub, noteLengthSub };
