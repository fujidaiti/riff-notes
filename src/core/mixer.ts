import type { Mix, PartMix } from "./model/types";
import { defaultPartMix } from "./model/factory";

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function anyPartSoloed(mix: Mix): boolean {
  for (const k of Object.keys(mix.parts)) {
    if (mix.parts[k]?.solo) return true;
  }
  return false;
}

function partMix(mix: Mix, partId: string): PartMix {
  return mix.parts[partId] ?? defaultPartMix();
}

/**
 * Linear gain (0-1) for a part, applying master mute, part mute, and solo
 * rules. Note: the recording "armed part is silent" rule is intentionally NOT
 * here — that is a transient editor/audio concern applied by the audio layer.
 */
export function effectivePartGain(mix: Mix | null | undefined, partId: string): number {
  if (!mix) return 1;
  if (mix.master.mute) return 0;
  const pm = partMix(mix, partId);
  if (pm.mute) return 0;
  if (anyPartSoloed(mix) && !pm.solo) return 0;
  return pm.vol;
}

/** Effective master gain (0 when muted). */
export function effectiveMasterValue(mix: Mix | null | undefined): number {
  if (!mix) return 1;
  return mix.master.mute ? 0 : mix.master.vol;
}
