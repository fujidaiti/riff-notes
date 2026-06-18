import type { Note, Part, Sheet } from "../core/model/types";
import { RHYTHM_KEYS } from "../core/model/constants";
import { isRhythmPart, totalSteps } from "../core/model/factory";
import { effectiveMasterValue, effectivePartGain } from "../core/mixer";
import { noteFracLength, noteFracStart } from "../core/timing";

// Velocity -> oscillator peak gain. Audio-only concern, so it lives here rather
// than in core (which keeps VEL_OPACITY, the visual counterpart).
const VEL_GAIN = [0.08, 0.16, 0.3, 0.5, 0.75];

export interface PlayOptions {
  fromStep?: number;
  repeat?: boolean;
  onEnd?: () => void;
}

/**
 * Encapsulates all WebAudio: a lazily-created AudioContext, master + per-part
 * gain nodes, oscillator/drum synthesis, and seamless looping. Interaction-free
 * so it could be reused by the embed for playback. The playhead is reported
 * out-of-band via currentStep(): callers poll it from their own rAF loop so
 * per-frame updates never re-render React note trees.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private partGains = new Map<string, GainNode>();
  private stops: Array<() => void> = [];
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private playingSheetId: string | null = null;
  private t0 = 0;
  private startStep = 0;
  private secPerStep = 0;
  private totalStepsCount = 0;

  private ensureContext(masterValue: number): void {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = masterValue;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) return this.noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  private ensurePartGains(sheet: Sheet): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const ids = new Set(sheet.parts.map((p) => p.id));
    for (const [id, node] of this.partGains) {
      if (!ids.has(id)) {
        try {
          node.disconnect();
        } catch {
          /* already gone */
        }
        this.partGains.delete(id);
      }
    }
    for (const p of sheet.parts) {
      if (!this.partGains.has(p.id)) {
        const g = ctx.createGain();
        g.gain.value = effectivePartGain(sheet.mix, p.id);
        g.connect(master);
        this.partGains.set(p.id, g);
      }
    }
  }

  /** Push live mixer changes (mute/solo/volume) to the running graph. */
  syncMix(sheet: Sheet): void {
    if (!this.ctx) return;
    if (this.master) this.master.gain.setTargetAtTime(effectiveMasterValue(sheet.mix), this.ctx.currentTime, 0.01);
    for (const p of sheet.parts) {
      this.partGains.get(p.id)?.gain.setTargetAtTime(effectivePartGain(sheet.mix, p.id), this.ctx.currentTime, 0.01);
    }
  }

  private destFor(part: Part | undefined): AudioNode {
    if (part) {
      const node = this.partGains.get(part.id);
      if (node) return node;
    }
    return this.master ?? this.ctx!.destination;
  }

  private teardown(): void {
    for (const fn of this.stops) fn();
    this.stops = [];
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    for (const node of this.partGains.values()) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.partGains.clear();
  }

  private scheduleNote(when: number, durSec: number, midi: number, vel: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const peak = VEL_GAIN[vel];
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.005);
    gain.gain.setValueAtTime(peak, when + Math.max(0.01, durSec - 0.04));
    gain.gain.linearRampToValueAtTime(0, when + durSec);
    osc.connect(gain).connect(dest);
    osc.start(when);
    osc.stop(when + durSec + 0.02);
    this.stops.push(() => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    });
  }

  private scheduleDrum(when: number, durSec: number, drumKey: string, vel: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const peak = VEL_GAIN[vel];
    if (drumKey === "kick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, when);
      osc.frequency.exponentialRampToValueAtTime(80, when + 0.08);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(Math.min(1, peak * 1.8), when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      osc.connect(gain).connect(dest);
      osc.start(when);
      osc.stop(when + 0.22);
      this.stops.push(() => safeStop(() => (osc.stop(), osc.disconnect(), gain.disconnect())));
    } else if (drumKey === "snare") {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1700;
      bp.Q.value = 0.9;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, when);
      ng.gain.linearRampToValueAtTime(peak * 0.9, when + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
      src.connect(bp).connect(ng).connect(dest);
      src.start(when);
      src.stop(when + 0.18);
      const body = ctx.createOscillator();
      const bg = ctx.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(220, when);
      body.frequency.exponentialRampToValueAtTime(140, when + 0.05);
      bg.gain.setValueAtTime(0, when);
      bg.gain.linearRampToValueAtTime(peak * 0.4, when + 0.003);
      bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
      body.connect(bg).connect(dest);
      body.start(when);
      body.stop(when + 0.12);
      this.stops.push(() => safeStop(() => (src.stop(), src.disconnect(), bp.disconnect(), ng.disconnect(), body.stop(), body.disconnect(), bg.disconnect())));
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const ng = ctx.createGain();
      const decay = Math.max(0.04, Math.min(0.25, durSec * 0.6));
      ng.gain.setValueAtTime(0, when);
      ng.gain.linearRampToValueAtTime(peak * 0.7, when + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      src.connect(hp).connect(ng).connect(dest);
      src.start(when);
      src.stop(when + decay + 0.02);
      this.stops.push(() => safeStop(() => (src.stop(), src.disconnect(), hp.disconnect(), ng.disconnect())));
    }
  }

  /** A short metronome click; accented on the downbeat. */
  click(accent: boolean): void {
    this.ensureContext(1);
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
  auditionNote(sheet: Sheet, note: Note): void {
    this.ensureContext(effectiveMasterValue(sheet.mix));
    this.ensurePartGains(sheet);
    const secPerStep = 60 / sheet.bpm / 4;
    const dur = secPerStep * 0.95;
    const when = this.ctx!.currentTime + 0.005;
    const part = sheet.parts.find((p) => p.id === note.partId);
    const dest = this.destFor(part);
    if (part && isRhythmPart(part)) {
      const key = RHYTHM_KEYS[part.hi - note.pitch];
      if (key) this.scheduleDrum(when, dur, key, note.vel, dest);
    } else {
      this.scheduleNote(when, dur, note.pitch, note.vel, dest);
    }
  }

  play(sheet: Sheet, opts: PlayOptions = {}): void {
    this.ensureContext(effectiveMasterValue(sheet.mix));
    const ctx = this.ctx!;
    this.playInternal(sheet, opts, ctx.currentTime + 0.05);
  }

  private playInternal(sheet: Sheet, opts: PlayOptions, t0: number): void {
    const ctx = this.ctx!;
    this.teardown();
    this.ensurePartGains(sheet);
    this.syncMix(sheet);
    this.playingSheetId = sheet.id;

    const secPerStep = 60 / sheet.bpm / 4;
    const sheetSteps = totalSteps(sheet);
    const wanted = opts.fromStep ?? 0;
    const startStep = Math.max(0, Math.min(sheetSteps - 1, wanted));
    let lastEnd = t0;

    for (const part of sheet.parts) {
      const dest = this.destFor(part);
      for (const n of part.notes) {
        const absStart = noteFracStart(n);
        if (absStart < startStep) continue;
        const when = t0 + (absStart - startStep) * secPerStep;
        const dur = noteFracLength(n) * secPerStep * 0.95;
        if (isRhythmPart(part)) {
          const key = RHYTHM_KEYS[part.hi - n.pitch];
          if (key) this.scheduleDrum(when, dur, key, n.vel, dest);
        } else {
          this.scheduleNote(when, dur, n.pitch, n.vel, dest);
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
    this.stopTimer = setTimeout(() => {
      if (this.playingSheetId !== myId) return;
      if (opts.repeat) {
        this.playInternal(sheet, opts, endStepTime);
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
    this.teardown();
    this.playingSheetId = null;
    return clamped;
  }

  stop(): void {
    this.teardown();
    this.playingSheetId = null;
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
}

function safeStop(fn: () => void): void {
  try {
    fn();
  } catch {
    /* already stopped */
  }
}
