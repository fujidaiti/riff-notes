import type { Sheet } from "../core/model/types";
import { effectivePartGain } from "../core/mixer";
import type { VoiceBackend } from "./VoiceBackend";

// Velocity index (0–4) → oscillator peak gain. Mirrors VEL_MIDI in core but
// lives here because it's purely an audio-synthesis concern.
const VEL_GAIN = [0.08, 0.16, 0.3, 0.5, 0.75];

function safeStop(fn: () => void): void {
  try {
    fn();
  } catch {
    /* already stopped */
  }
}

/**
 * Web Audio oscillator + noise backend (the original hand-written synthesis).
 * Manages its own per-part GainNode routing so AudioEngine is decoupled from
 * the WebAudio graph topology.
 */
export class JsSynthBackend implements VoiceBackend {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private stops: Array<() => void> = [];
  private partGains = new Map<string, GainNode>();

  async connect(ctx: AudioContext, master: GainNode): Promise<void> {
    this.ctx = ctx;
    this.master = master;
  }

  async beginPlayback(sheet: Sheet, t0: number): Promise<void> {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    // Remove gains for deleted parts.
    const ids = new Set(sheet.parts.map((p) => p.id));
    for (const [id, node] of this.partGains) {
      if (!ids.has(id)) {
        try { node.disconnect(); } catch { /* gone */ }
        this.partGains.delete(id);
      }
    }
    // Create gains for new parts and set initial volumes precisely at t0 to
    // avoid clicks when gains change right as playback starts.
    for (const p of sheet.parts) {
      if (!this.partGains.has(p.id)) {
        const g = ctx.createGain();
        g.connect(master);
        this.partGains.set(p.id, g);
      }
      this.partGains.get(p.id)!.gain.setValueAtTime(effectivePartGain(sheet.mix, p.id), t0);
    }
  }

  scheduleNote(when: number, durSec: number, midi: number, velIdx: number, dest: AudioNode, partId: string): void {
    const ctx = this.ctx!;
    const target = this.partGains.get(partId) ?? dest;
    const peak = VEL_GAIN[velIdx];
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.005);
    gain.gain.setValueAtTime(peak, when + Math.max(0.01, durSec - 0.04));
    gain.gain.linearRampToValueAtTime(0, when + durSec);
    osc.connect(gain).connect(target);
    osc.start(when);
    osc.stop(when + durSec + 0.02);
    this.stops.push(() =>
      safeStop(() => { osc.stop(); osc.disconnect(); gain.disconnect(); }),
    );
  }

  scheduleDrum(when: number, durSec: number, drumKey: string, velIdx: number, dest: AudioNode, partId: string): void {
    const ctx = this.ctx!;
    const target = this.partGains.get(partId) ?? dest;
    const peak = VEL_GAIN[velIdx];
    if (drumKey === "kick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, when);
      osc.frequency.exponentialRampToValueAtTime(80, when + 0.08);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(Math.min(1, peak * 1.8), when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      osc.connect(gain).connect(target);
      osc.start(when);
      osc.stop(when + 0.22);
      this.stops.push(() =>
        safeStop(() => (osc.stop(), osc.disconnect(), gain.disconnect())),
      );
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
      src.connect(bp).connect(ng).connect(target);
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
      body.connect(bg).connect(target);
      body.start(when);
      body.stop(when + 0.12);
      this.stops.push(() =>
        safeStop(() => (
          src.stop(), src.disconnect(), bp.disconnect(), ng.disconnect(),
          body.stop(), body.disconnect(), bg.disconnect()
        )),
      );
    } else {
      // hihat
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
      src.connect(hp).connect(ng).connect(target);
      src.start(when);
      src.stop(when + decay + 0.02);
      this.stops.push(() =>
        safeStop(() => (src.stop(), src.disconnect(), hp.disconnect(), ng.disconnect())),
      );
    }
  }

  syncMix(sheet: Sheet): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Master gain is managed by AudioEngine. Only per-part gains here.
    for (const p of sheet.parts) {
      this.partGains.get(p.id)?.gain.setTargetAtTime(effectivePartGain(sheet.mix, p.id), ctx.currentTime, 0.01);
    }
  }

  cancelActive(): void {
    for (const fn of this.stops) fn();
    this.stops = [];
  }

  teardown(): void {
    this.cancelActive();
    for (const node of this.partGains.values()) {
      try { node.disconnect(); } catch { /* ignore */ }
    }
    this.partGains.clear();
    this.noiseBuffer = null;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate)
      return this.noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }
}
