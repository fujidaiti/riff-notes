import type { Mix, Note, Sheet } from "../core/model/types";
import { RHYTHM_KEYS } from "../core/model/constants";
import { isRhythmPart, totalSteps } from "../core/model/factory";
import { effectiveMasterValue } from "../core/mixer";
import { noteFracLength, noteFracStart } from "../core/timing";
import type { VoiceBackend } from "./VoiceBackend";
import { FluidSynthBackend } from "./FluidSynthBackend";

export interface PlayOptions {
  fromStep?: number;
  repeat?: boolean;
  onEnd?: () => void;
  /** Tempo override in BPM (e.g. a slower practice tempo for a take). */
  bpmOverride?: number;
  /** Skip this part entirely — used to punch-in record over the rest. */
  silentPartId?: string;
}

/**
 * Orchestrates playback timing, looping, pause/resume, and audition via a
 * pluggable VoiceBackend. Currently uses FluidSynthBackend (SoundFont via WASM).
 *
 * The playhead is reported out-of-band via currentStep(): callers poll it from
 * their own rAF loop so per-frame updates never re-render React note trees.
 * Although FluidSynth's sequencer is the scheduling clock, currentStep() uses
 * ctx.currentTime - t0 as an equivalent synchronous estimate (sequencer tick
 * readback is async and would stall rAF).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private keeper: AudioNode | null = null;
  private backend: VoiceBackend = new FluidSynthBackend();
  private backendConnected = false;

  private playingSheetId: string | null = null;
  // Incremented by stop()/pause() so play() can detect cancellation mid-await.
  private playGen = 0;
  // Tracks the most-recent mix pushed via syncMix so the repeat loop restarts
  // with the user's current mixer state rather than the snapshot from play().
  private liveMix: Mix | null = null;
  private t0 = 0;
  private startStep = 0;
  private secPerStep = 0;
  private totalStepsCount = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  /** True once the AudioWorklet and SoundFont have finished loading. */
  isReady = false;

  private async ensureContext(masterValue: number): Promise<void> {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Fire-and-forget resume on the earliest possible user interaction so the
      // context is already running by the time the first auditionNote/play call
      // reaches its await.
      const warmUp = () => { void this.ctx?.resume(); };
      window.addEventListener("pointerdown", warmUp, { once: true });
      window.addEventListener("keydown", warmUp, { once: true });
    }
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = masterValue;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("AudioContext.resume() failed:", e);
      }
    }
    if (!this.keeper && this.ctx.state === "running") {
      const src = this.ctx.createConstantSource();
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
      this.keeper = gain;
    }
    // Connect the backend once — loads WASM worklet and SoundFont.
    if (!this.backendConnected) {
      this.backendConnected = true;
      await this.backend.connect(this.ctx, this.master);
      this.isReady = true;
    }
  }

  /** Push live mixer changes (mute/solo/volume) to the running graph. */
  syncMix(sheet: Sheet): void {
    if (!this.ctx || !this.master) return;
    this.liveMix = sheet.mix;
    this.master.gain.setTargetAtTime(effectiveMasterValue(sheet.mix), this.ctx.currentTime, 0.01);
    this.backend.syncMix(sheet);
  }

  /** A short metronome click; accented on the downbeat. Stays a plain oscillator. */
  async click(accent: boolean): Promise<void> {
    await this.ensureContext(1);
    const ctx = this.ctx!;
    const when = ctx.currentTime + 0.001;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1600 : 1100;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.15, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(this.master ?? ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  /** Audition a single note immediately (e.g. on click). */
  async auditionNote(sheet: Sheet, note: Note): Promise<void> {
    await this.ensureContext(effectiveMasterValue(sheet.mix));
    const ctx = this.ctx!;
    const secPerStep = 60 / sheet.bpm / 4;
    const dur = secPerStep * 0.95;
    const when = ctx.currentTime + 0.005;
    const part = sheet.parts.find((p) => p.id === note.partId);
    if (part && isRhythmPart(part)) {
      const key = RHYTHM_KEYS[part.hi - note.pitch];
      if (key) this.backend.scheduleDrum(when, dur, key, note.vel, this.master!, note.partId);
    } else {
      this.backend.scheduleNote(when, dur, note.pitch, note.vel, this.master!, note.partId);
    }
  }

  async play(sheet: Sheet, opts: PlayOptions = {}): Promise<void> {
    const gen = ++this.playGen;
    await this.ensureContext(effectiveMasterValue(sheet.mix));
    if (gen !== this.playGen) return; // cancelled by stop()/pause() mid-await
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    await this.backend.beginPlayback(sheet, t0);
    if (gen !== this.playGen) return;
    this.playInternal(sheet, opts, t0);
  }

  private playInternal(sheet: Sheet, opts: PlayOptions, t0: number): void {
    const ctx = this.ctx!;
    this.cancelScheduled();
    this.playingSheetId = sheet.id;

    const secPerStep = 60 / (opts.bpmOverride && opts.bpmOverride > 0 ? opts.bpmOverride : sheet.bpm) / 4;
    const sheetSteps = totalSteps(sheet);
    const wanted = opts.fromStep ?? 0;
    const startStep = Math.max(0, Math.min(sheetSteps - 1, wanted));
    let lastEnd = t0;

    for (const part of sheet.parts) {
      if (part.id === opts.silentPartId) continue;
      for (const n of part.notes) {
        const absStart = noteFracStart(n);
        if (absStart < startStep) continue;
        const when = t0 + (absStart - startStep) * secPerStep;
        const dur = noteFracLength(n) * secPerStep * 0.95;
        if (isRhythmPart(part)) {
          const key = RHYTHM_KEYS[part.hi - n.pitch];
          if (key) this.backend.scheduleDrum(when, dur, key, n.vel, this.master!, part.id);
        } else {
          this.backend.scheduleNote(when, dur, n.pitch, n.vel, this.master!, part.id);
        }
        lastEnd = Math.max(lastEnd, when + dur);
      }
    }

    this.t0 = t0;
    this.startStep = startStep;
    this.secPerStep = secPerStep;
    this.totalStepsCount = sheetSteps;

    const endStepTime = t0 + (sheetSteps - startStep) * secPerStep;
    const endTime = Math.max(lastEnd, endStepTime);
    const myId = sheet.id;
    const earlyMs = Math.max(0, (endStepTime - ctx.currentTime) * 1000 - 50);
    this.stopTimer = setTimeout(async () => {
      if (this.playingSheetId !== myId) return;
      if (opts.repeat) {
        const latestSheet = this.liveMix ? { ...sheet, mix: this.liveMix } : sheet;
        await this.backend.beginPlayback(latestSheet, endStepTime);
        this.playInternal(latestSheet, opts, endStepTime);
      } else {
        const remainingMs = Math.max(100, (endTime - ctx.currentTime) * 1000 + 100);
        this.stopTimer = setTimeout(() => {
          if (this.playingSheetId === myId) {
            this.stop();
            opts.onEnd?.();
          }
        }, remainingMs);
      }
    }, earlyMs);
  }

  pause(): number {
    if (!this.playingSheetId || !this.ctx) return 0;
    const elapsed = this.ctx.currentTime - this.t0;
    const step = this.startStep + Math.max(0, elapsed) / this.secPerStep;
    const clamped = Math.max(0, Math.min(this.totalStepsCount - 0.0001, step));
    this.playGen++;
    this.cancelScheduled();
    this.playingSheetId = null;
    return clamped;
  }

  stop(): void {
    this.playGen++;
    this.cancelScheduled();
    this.backend.teardown();
    this.playingSheetId = null;
    this.liveMix = null;
  }

  get isPlaying(): boolean {
    return this.playingSheetId !== null;
  }

  /** Current playhead position in steps, or null when stopped. Poll from rAF. */
  currentStep(): number | null {
    if (!this.playingSheetId || !this.ctx) return null;
    const elapsed = this.ctx.currentTime - this.t0;
    const cur = this.startStep + Math.max(0, elapsed) / this.secPerStep;
    return Math.min(this.totalStepsCount - 0.0001, cur);
  }

  private cancelScheduled(): void {
    this.backend.cancelActive();
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }
}
