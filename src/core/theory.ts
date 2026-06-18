import type { Part, Scale } from "./model/types";
import { PITCH_NAMES, SCALES } from "./model/constants";
import { isRhythmPart } from "./model/factory";

/** Note name with octave, e.g. 60 -> "C4". */
export function pitchName(midi: number): string {
  const n = ((midi % 12) + 12) % 12;
  return PITCH_NAMES[n] + (Math.floor(midi / 12) - 1);
}

/** Note name, optionally with octave: 60 -> "C" or "C4". */
export function pitchDisplayName(midi: number, withOctave: boolean): string {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  return PITCH_NAMES[pc] + (withOctave ? octave : "");
}

/** Set of pitch classes (0-11) that belong to the scale. */
export function inScaleSet(scale: Scale): Set<number> {
  const intervals = SCALES[scale.mode] ?? SCALES.major;
  return new Set(intervals.map((i) => (i + scale.root) % 12));
}

/**
 * Whether a pitch in a part is in-scale. Drum (rhythm) parts have no scale
 * coloring. Returns a semantic token rather than a CSS class so core stays
 * framework-agnostic; the UI maps "in-scale" to its own class name.
 */
export function noteScaleClass(scaleSet: Set<number>, part: Part, pitch: number): "in-scale" | "" {
  if (isRhythmPart(part)) return "";
  const pc = ((pitch % 12) + 12) % 12;
  return scaleSet.has(pc) ? "in-scale" : "";
}
