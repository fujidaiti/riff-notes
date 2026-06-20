import type { Note, Sheet } from "./model/types";
import { SUB_PER_STEP } from "./model/constants";
import { totalSteps } from "./model/factory";

/** Absolute fractional step position, including the syncopation sub-offset. */
export function noteFracStart(n: Note): number {
  return n.start + (n.subOffset || 0) / SUB_PER_STEP;
}

/** Fractional length in steps (1 step = SUB_PER_STEP sub-steps). */
export function noteFracLength(n: Note): number {
  return n.length + (n.subLength || 0) / SUB_PER_STEP;
}

/** Absolute sub-step position of a note's start. */
export function noteStartSub(n: Note): number {
  return n.start * SUB_PER_STEP + (n.subOffset || 0);
}

/** Absolute sub-step length of a note. */
export function noteLengthSub(n: Note): number {
  return n.length * SUB_PER_STEP + (n.subLength || 0);
}

/** Split an absolute sub-step count into { start, subOffset }. */
export function subToStart(absSub: number): { start: number; subOffset: number } {
  const start = Math.floor(absSub / SUB_PER_STEP);
  return { start, subOffset: absSub - start * SUB_PER_STEP };
}

/** Split an absolute sub-step length into { length, subLength }. */
export function subToLength(lenSub: number): { length: number; subLength: number } {
  const length = Math.floor(lenSub / SUB_PER_STEP);
  return { length, subLength: lenSub - length * SUB_PER_STEP };
}

/**
 * Shift a note's absolute position by `delta` sub-steps, clamped so the note
 * never crosses the sheet's first/last absolute sub-position. Mutates the note
 * and returns true iff it actually moved.
 */
export function shiftNoteSubOffset(sheet: Sheet, note: Note, delta: number): boolean {
  const totalSheetSub = totalSteps(sheet) * SUB_PER_STEP;
  const absSub = noteStartSub(note);
  const lenSub = noteLengthSub(note);
  const maxAbsSub = totalSheetSub - lenSub;
  let target = absSub + delta;
  if (target < 0) target = 0;
  if (target > maxAbsSub) target = maxAbsSub;
  if (target === absSub) return false;
  const { start, subOffset } = subToStart(target);
  note.start = start;
  note.subOffset = subOffset;
  return true;
}
