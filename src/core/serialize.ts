import type { Annotation, InstrumentId, Mix, Part, Project, Sheet } from "./model/types";
import { DEFAULT_INSTRUMENT, INSTRUMENTS, SUB_PER_STEP } from "./model/constants";
import { makeDefaultMix, makePart } from "./model/factory";
import { clamp01 } from "./mixer";
import { uid } from "./model/uid";

// Persisted document schema. This is the only persistence boundary: runtime /
// view state (selection, playback) is never part of it. The refactor took a
// clean break from the legacy format, so this starts at version 1 under a new
// storage key; bump the version and add a migration branch on breaking changes.
export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "riff-notes:project";

export const ANNOT_MIN_WIDTH = 24;
export const ANNOT_MAX_WIDTH = 320;
export const ANNOT_DEFAULT_SHRUNK_WIDTH = 140;

export interface SerializedProject {
  version: number;
  name: string;
  sheets: unknown[];
}

function serializeMix(sheet: Sheet): Mix {
  const mix = sheet.mix ?? makeDefaultMix(sheet.parts);
  const parts: Mix["parts"] = {};
  for (const pt of sheet.parts) {
    const pm = mix.parts[pt.id] ?? { vol: 1, mute: false, solo: false };
    parts[pt.id] = {
      vol: clamp01(Number.isFinite(pm.vol) ? pm.vol : 1),
      mute: !!pm.mute,
      solo: !!pm.solo,
    };
  }
  return {
    master: {
      vol: clamp01(Number.isFinite(mix.master?.vol) ? mix.master.vol : 1),
      mute: !!mix.master?.mute,
    },
    parts,
  };
}

export function serializeProject(p: Project): SerializedProject {
  return {
    version: SCHEMA_VERSION,
    name: p.name || "",
    sheets: p.sheets.map((s) => ({
      id: s.id,
      title: s.title,
      notes: s.notes,
      bpm: s.bpm,
      scale: { root: s.scale.root, mode: s.scale.mode },
      barCount: Math.max(1, s.barCount | 0),
      parts: s.parts.map((pt) => ({
        id: pt.id,
        name: pt.name,
        lo: pt.lo,
        hi: pt.hi,
        instrument: INSTRUMENTS[pt.instrument] ? pt.instrument : DEFAULT_INSTRUMENT,
        notes: pt.notes.map((n) => ({
          id: n.id,
          partId: n.partId,
          pitch: n.pitch,
          start: n.start,
          length: n.length,
          vel: n.vel,
          subOffset: n.subOffset || 0,
          subLength: n.subLength || 0,
        })),
      })),
      mix: serializeMix(s),
      annotations: (s.annotations ?? []).map((a) => ({
        id: a.id,
        text: a.text,
        noteIds: [...a.noteIds],
        shrunkWidth: Number.isFinite(a.shrunkWidth) ? a.shrunkWidth : ANNOT_DEFAULT_SHRUNK_WIDTH,
        placement: { anchorNoteId: a.placement.anchorNoteId, dx: a.placement.dx, dy: a.placement.dy },
      })),
    })),
  };
}

// --- deserialize (validating, coercing) ---

interface Raw {
  [k: string]: unknown;
}
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object";
const num = (v: unknown, d: number): number => (Number.isFinite(v) ? (v as number) : d);
const str = (v: unknown, d: string): string => (typeof v === "string" ? v : d);

function deserializeMix(raw: unknown, parts: Part[]): Mix {
  const out = makeDefaultMix(parts);
  if (!isObj(raw)) return out;
  if (isObj(raw.master)) {
    if (Number.isFinite(raw.master.vol)) out.master.vol = clamp01(raw.master.vol as number);
    out.master.mute = !!raw.master.mute;
  }
  if (isObj(raw.parts)) {
    for (const pt of parts) {
      const pm = (raw.parts as Raw)[pt.id];
      if (isObj(pm)) {
        out.parts[pt.id] = {
          vol: clamp01(Number.isFinite(pm.vol) ? (pm.vol as number) : 1),
          mute: !!pm.mute,
          solo: !!pm.solo,
        };
      }
    }
  }
  return out;
}

function deserializePart(raw: Raw): Part {
  const instId: InstrumentId = INSTRUMENTS[raw.instrument as InstrumentId] ? (raw.instrument as InstrumentId) : DEFAULT_INSTRUMENT;
  const inst = INSTRUMENTS[instId];
  const fixed = inst.pitchMode === "fixed";
  const part: Part = {
    id: str(raw.id, "") || uid(),
    name: str(raw.name, "") || inst.defaultName,
    lo: fixed ? inst.defaultLo : num(raw.lo, inst.defaultLo),
    hi: fixed ? inst.defaultHi : num(raw.hi, inst.defaultHi),
    instrument: instId,
    notes: [],
  };
  part.notes = Array.isArray(raw.notes)
    ? (raw.notes as Raw[]).map((n) => {
        let so = Number.isInteger(n.subOffset) ? (n.subOffset as number) : 0;
        so = Math.max(-(SUB_PER_STEP - 1), Math.min(SUB_PER_STEP - 1, so));
        let sl = Number.isInteger(n.subLength) ? (n.subLength as number) : 0;
        sl = Math.max(0, Math.min(SUB_PER_STEP - 1, sl));
        return {
          id: str(n.id, "") || uid(),
          partId: part.id,
          pitch: num(n.pitch, 60),
          start: num(n.start, 0),
          length: fixed ? 1 : num(n.length, 1),
          vel: num(n.vel, 2),
          subOffset: so,
          subLength: sl,
        };
      })
    : [];
  return part;
}

function deserializeAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Raw[])
    .filter((a) => isObj(a) && typeof a.text === "string" && Array.isArray(a.noteIds))
    .map((a): Annotation | null => {
      const noteIds = (a.noteIds as unknown[]).filter((x): x is string => typeof x === "string");
      const p = a.placement as Raw | undefined;
      if (!p || typeof p.anchorNoteId !== "string" || !Number.isFinite(p.dx) || !Number.isFinite(p.dy) || !noteIds.includes(p.anchorNoteId)) {
        return null;
      }
      const sw = Number.isFinite(a.shrunkWidth)
        ? Math.max(ANNOT_MIN_WIDTH, Math.min(ANNOT_MAX_WIDTH, a.shrunkWidth as number))
        : ANNOT_DEFAULT_SHRUNK_WIDTH;
      return {
        id: str(a.id, "") || uid(),
        text: a.text as string,
        noteIds,
        shrunkWidth: sw,
        placement: { anchorNoteId: p.anchorNoteId as string, dx: p.dx as number, dy: p.dy as number },
      };
    })
    .filter((a): a is Annotation => a !== null);
}

/** Parse a persisted document into a Project, or null if invalid/incompatible. */
export function deserializeProject(doc: unknown): Project | null {
  if (!isObj(doc) || !Array.isArray(doc.sheets) || doc.sheets.length === 0) return null;
  if (doc.version !== SCHEMA_VERSION) return null;

  const sheets: Sheet[] = (doc.sheets as Raw[]).map((s) => {
    const barCount = Math.max(1, Number.isInteger(s.barCount) ? (s.barCount as number) : 1);
    const rawParts = Array.isArray(s.parts) && s.parts.length ? (s.parts as Raw[]) : [makePart("Part 1")];
    const parts = rawParts.map((pt) => deserializePart(pt as Raw));
    const scale = isObj(s.scale) ? s.scale : {};
    const sheet: Sheet = {
      id: str(s.id, "") || uid(),
      title: str(s.title, "Sheet"),
      notes: str(s.notes, ""),
      bpm: num(s.bpm, 120),
      scale: { root: num(scale.root, 0), mode: str(scale.mode, "major") },
      barCount,
      parts,
      annotations: deserializeAnnotations(s.annotations),
      mix: deserializeMix(s.mix, parts),
    };
    return sheet;
  });

  return { name: str(doc.name, ""), sheets };
}
