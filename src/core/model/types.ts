// Domain model for Riff Notes. These types describe the *serialized* shape of a
// project (Project -> Sheet -> Part -> Note, with Annotations and Mix). Runtime
// / view-only state (selection, playback) lives outside these types, in the
// state layer, so the serialize boundary stays clean.

export type InstrumentId = "epiano" | "drum";

export type PitchMode = "pitched" | "fixed";

export interface Instrument {
  id: InstrumentId;
  label: string;
  pitchMode: PitchMode;
  defaultLo: number;
  defaultHi: number;
  defaultName: string;
}

export interface Note {
  id: string;
  partId: string;
  /** MIDI pitch (0-127). For drum parts this is reinterpreted as a row index. */
  pitch: number;
  /** Integer step position (0-based) within the sheet. */
  start: number;
  /** Duration in whole steps (>= 1). Drums are always length 1. */
  length: number;
  /** Velocity index into VEL_* arrays (0-4). */
  vel: number;
  /** Fractional start offset in sub-steps (syncopation). */
  subOffset: number;
  /** Fractional length in sub-steps. */
  subLength: number;
}

export interface Part {
  id: string;
  name: string;
  /** Lowest visible pitch (inclusive). */
  lo: number;
  /** Highest visible pitch (inclusive). */
  hi: number;
  instrument: InstrumentId;
  notes: Note[];
}

export interface AnnotationPlacement {
  anchorNoteId: string;
  dx: number;
  dy: number;
}

export interface Annotation {
  id: string;
  text: string;
  noteIds: string[];
  shrunkWidth: number;
  placement: AnnotationPlacement;
}

export interface PartMix {
  vol: number;
  mute: boolean;
  solo: boolean;
}

export interface Mix {
  master: { vol: number; mute: boolean };
  parts: Record<string, PartMix>;
}

export interface Scale {
  /** Root pitch class (0-11). */
  root: number;
  /** Key into SCALES. */
  mode: string;
}

export interface Sheet {
  id: string;
  title: string;
  /** Free-text notes / description metadata. */
  notes: string;
  bpm: number;
  scale: Scale;
  parts: Part[];
  barCount: number;
  annotations: Annotation[];
  mix: Mix;
}

export interface Project {
  name: string;
  sheets: Sheet[];
}
