import type { Note, Part, Sheet } from "./model/types";
import { PIANO_MAX, PIANO_MIN } from "./model/constants";
import { isRhythmPart } from "./model/factory";
import { uid } from "./model/uid";
import type { Selection } from "./selection";

// Clipboard payload. `key` is the source note's id at copy time; annotations
// reference copied notes by key so paste can rebind them to fresh ids. Notes
// are stored relative to the selection's top-left anchor (earliest start,
// highest pitch) so paste can place them under any new anchor.
export interface ClipboardNote {
  key: string;
  dStart: number;
  dRow: number;
  length: number;
  vel: number;
  subOffset: number;
  subLength: number;
}

export interface ClipboardAnnotation {
  text: string;
  noteKeys: string[];
}

export interface Clipboard {
  notes: ClipboardNote[];
  annotations: ClipboardAnnotation[];
}

export interface PasteAnchor {
  part: Part;
  step: number;
  pitch: number;
}

export interface PasteResult {
  notes: Note[];
  /** Annotations to recreate, already rebound to the new note ids. */
  annotations: { text: string; noteIds: string[] }[];
  /** Notes that landed outside the target part's visible pitch range. */
  outOfRange: { count: number; min: number; max: number };
}

/** Build a clipboard payload from the current selection. Pure; no mutation. */
export function copyNotes(sheet: Sheet, selected: Selection): Clipboard | null {
  if (selected.size === 0) return null;
  const picked: Note[] = [];
  for (const p of sheet.parts) {
    for (const n of p.notes) if (selected.has(n.id)) picked.push(n);
  }
  if (picked.length === 0) return null;

  let minStart = Infinity;
  let maxPitch = -Infinity;
  for (const n of picked) {
    if (n.start < minStart) minStart = n.start;
    if (n.pitch > maxPitch) maxPitch = n.pitch;
  }

  const pickedIdSet = new Set(picked.map((n) => n.id));
  const annotations: ClipboardAnnotation[] = [];
  for (const a of sheet.annotations ?? []) {
    const noteKeys = a.noteIds.filter((id) => pickedIdSet.has(id));
    if (noteKeys.length > 0) annotations.push({ text: a.text, noteKeys });
  }

  return {
    notes: picked.map((n) => ({
      key: n.id,
      dStart: n.start - minStart,
      dRow: maxPitch - n.pitch,
      length: n.length,
      vel: n.vel,
      subOffset: n.subOffset || 0,
      subLength: n.subLength || 0,
    })),
    annotations,
  };
}

/**
 * Compute the notes and annotations that pasting `clipboard` under `anchor`
 * would create. Pure: mints fresh ids, clamps to the sheet and part range, and
 * reports how many notes fell outside the part's visible range (so the caller
 * can offer to widen it). Does not mutate the sheet.
 */
export function pasteNotes(clipboard: Clipboard, anchor: PasteAnchor, sheetSteps: number): PasteResult {
  const { part, step: targetStep, pitch: targetPitch } = anchor;
  const rhythm = isRhythmPart(part);

  const notes: Note[] = [];
  const keyToNewId = new Map<string, string>();
  let count = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const cn of clipboard.notes) {
    const absStart = targetStep + cn.dStart;
    const newPitch = targetPitch - cn.dRow;
    if (absStart < 0 || absStart >= sheetSteps) continue;
    if (rhythm) {
      if (newPitch < 0 || newPitch > 2) continue;
    } else if (newPitch < PIANO_MIN || newPitch > PIANO_MAX) {
      continue;
    }
    let newLength = Math.min(cn.length, sheetSteps - absStart);
    if (newLength < 1) newLength = 1;
    if (rhythm) newLength = 1;

    const note: Note = {
      id: uid(),
      partId: part.id,
      pitch: newPitch,
      start: absStart,
      length: newLength,
      vel: cn.vel,
      subOffset: cn.subOffset || 0,
      subLength: cn.subLength || 0,
    };
    notes.push(note);
    keyToNewId.set(cn.key, note.id);
    if (newPitch < part.lo || newPitch > part.hi) {
      count++;
      if (newPitch < min) min = newPitch;
      if (newPitch > max) max = newPitch;
    }
  }

  const annotations: { text: string; noteIds: string[] }[] = [];
  if (notes.length > 0) {
    for (const ca of clipboard.annotations) {
      const mapped = ca.noteKeys.map((k) => keyToNewId.get(k)).filter((x): x is string => !!x);
      if (mapped.length === 0) continue;
      annotations.push({ text: ca.text, noteIds: mapped });
    }
  }

  return { notes, annotations, outOfRange: { count, min, max } };
}
