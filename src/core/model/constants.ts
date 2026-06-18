import type { Instrument, InstrumentId } from "./types";

// Grid timing.
export const STEPS_PER_BAR = 16;
export const SUB_PER_STEP = 4;
export const TICKS_PER_QUARTER = 480;
export const TICKS_PER_STEP = TICKS_PER_QUARTER / 4;

// Velocity. Index 0-4 selects label / MIDI value / visual opacity. VEL_GAIN is
// an audio-only concern and lives in the audio layer, not here.
export const VEL_LABELS = ["pp", "p", "mf", "f", "ff"] as const;
export const VEL_MIDI = [25, 50, 75, 100, 120] as const;
export const VEL_OPACITY = [0.25, 0.45, 0.65, 0.85, 1.0] as const;
export const DEFAULT_VEL = 2;

// Pitch.
export const PITCH_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const PIANO_MIN = 21; // A0
export const PIANO_MAX = 108; // C8

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentMajor: [0, 2, 4, 7, 9],
  pentMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["major", "Major"],
  ["minor", "Natural Minor"],
  ["harmonicMinor", "Harmonic Minor"],
  ["melodicMinor", "Melodic Minor"],
  ["dorian", "Dorian"],
  ["phrygian", "Phrygian"],
  ["lydian", "Lydian"],
  ["mixolydian", "Mixolydian"],
  ["locrian", "Locrian"],
  ["pentMajor", "Pent Major"],
  ["pentMinor", "Pent Minor"],
  ["blues", "Blues"],
  ["chromatic", "Chromatic"],
];

// Drum part: a fixed-pitch lane with three rows. The drum part reuses the
// standard note schema (pitch is reinterpreted as a row index via part.lo=0,
// part.hi=2). Row index = part.hi - note.pitch.
export const RHYTHM_NAMES = ["Hi-hat", "Snare", "Kick"] as const;
export const RHYTHM_KEYS = ["hihat", "snare", "kick"] as const;

// pitchMode "pitched" means the part exposes the full MIDI range and notes have
// user-chosen pitches; "fixed" means an instrument-defined row layout (drums).
export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  epiano: { id: "epiano", label: "E-piano", pitchMode: "pitched", defaultLo: 60, defaultHi: 72, defaultName: "Part" },
  drum: { id: "drum", label: "Drums", pitchMode: "fixed", defaultLo: 0, defaultHi: 2, defaultName: "Drums" },
};
export const INSTRUMENT_OPTIONS: ReadonlyArray<readonly [InstrumentId, string]> = [
  ["epiano", "E-piano"],
  ["drum", "Drums"],
];
export const DEFAULT_INSTRUMENT: InstrumentId = "epiano";

export function getInstrument(id: string): Instrument {
  return INSTRUMENTS[id as InstrumentId] ?? INSTRUMENTS[DEFAULT_INSTRUMENT];
}
