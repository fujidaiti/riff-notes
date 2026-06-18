import type { InstrumentId, Mix, Note, Part, PartMix, Sheet } from "./types";
import { DEFAULT_INSTRUMENT, STEPS_PER_BAR, getInstrument } from "./constants";
import { uid } from "./uid";

export function makePart(name?: string, instrument: InstrumentId = DEFAULT_INSTRUMENT): Part {
  const inst = getInstrument(instrument);
  return {
    id: uid(),
    name: name || inst.defaultName,
    lo: inst.defaultLo,
    hi: inst.defaultHi,
    instrument: inst.id,
    notes: [],
  };
}

export function defaultPartMix(): PartMix {
  return { vol: 1, mute: false, solo: false };
}

export function makeDefaultMix(parts: Part[]): Mix {
  const partsMix: Record<string, PartMix> = {};
  for (const p of parts) partsMix[p.id] = defaultPartMix();
  return { master: { vol: 1, mute: false }, parts: partsMix };
}

export function makeSheet(title = "Sheet"): Sheet {
  const parts = [makePart("Part 1")];
  return {
    id: uid(),
    title,
    notes: "",
    bpm: 120,
    scale: { root: 0, mode: "major" },
    parts,
    barCount: 1,
    annotations: [],
    mix: makeDefaultMix(parts),
  };
}

export function isRhythmPart(part: Part | null | undefined): boolean {
  return !!part && getInstrument(part.instrument).pitchMode === "fixed";
}

export function totalSteps(sheet: Sheet): number {
  return sheet.barCount * STEPS_PER_BAR;
}

export function findNote(sheet: Sheet, noteId: string): Note | null {
  for (const p of sheet.parts) {
    for (const n of p.notes) if (n.id === noteId) return n;
  }
  return null;
}
