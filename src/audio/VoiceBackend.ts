import type { Sheet } from "../core/model/types";

/**
 * Seam between AudioEngine and its synthesis implementation.
 *
 * Two implementations:
 *   JsSynthBackend  — original WebAudio oscillator/noise synthesis
 *   FluidSynthBackend — FluidSynth WASM via AudioWorklet + GeneralUser GS
 */
export interface VoiceBackend {
  /**
   * Called once, immediately after the AudioContext and master GainNode are
   * created. The backend attaches its output to `master` here.
   * For FluidSynthBackend this loads the AudioWorklet modules + SoundFont.
   */
  connect(ctx: AudioContext, master: GainNode): Promise<void>;

  /**
   * Called async before each playback session (including loop restarts).
   * For JsSynthBackend: creates per-part GainNodes.
   * For FluidSynthBackend: assigns MIDI channels, sends program changes, and
   * records the sequencer tick reference for sample-accurate scheduling.
   */
  beginPlayback(sheet: Sheet, t0: number): Promise<void>;

  /**
   * Schedule a pitched note.
   * `dest`   — fallback routing node (used by JsSynthBackend).
   * `partId` — part identifier used by FluidSynthBackend for channel lookup.
   */
  scheduleNote(
    when: number,
    durSec: number,
    midi: number,
    velIdx: number,
    dest: AudioNode,
    partId: string,
  ): void;

  /**
   * Schedule a drum hit.
   * `dest`   — fallback routing node (used by JsSynthBackend).
   * `partId` — part identifier used by FluidSynthBackend for channel lookup.
   */
  scheduleDrum(
    when: number,
    durSec: number,
    drumKey: string,
    velIdx: number,
    dest: AudioNode,
    partId: string,
  ): void;

  /**
   * Push live mixer changes (mute/solo/volume).
   * JsSynthBackend: ramps per-part GainNodes via setTargetAtTime.
   * FluidSynthBackend: sends CC7 per MIDI channel.
   */
  syncMix(sheet: Sheet): void;

  /**
   * Stop active sounds but keep channel/program state intact.
   * Called at the start of each playInternal (including loop restarts).
   */
  cancelActive(): void;

  /**
   * Full teardown: stop sounds AND release per-part/channel resources.
   * Called on stop().
   */
  teardown(): void;
}
