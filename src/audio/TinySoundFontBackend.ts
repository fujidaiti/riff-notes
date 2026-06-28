import type { Sheet } from "../core/model/types";
import { VEL_MIDI } from "../core/model/constants";
import { effectivePartGain } from "../core/mixer";
import type { ScheduledEvent } from "../core/audioSchedule";
import type { VoiceBackend } from "./VoiceBackend";

// SoundFont bank/program for each instrument ID. GeneralUser GS exposes drum
// kits on SF2 bank 120; pitched instruments use their standard GM/GS bank.
// TSF selects a preset purely by (bank, program) — there is no separate
// "percussion channel" concept as in FluidSynth, so this table maps directly.
const GM_PRESETS: Record<string, { bank: number; program: number }> = {
  piano:     { bank: 0,   program: 0  },
  epiano:    { bank: 0,   program: 4  },
  clav:      { bank: 0,   program: 7  },
  organ:     { bank: 0,   program: 18 },
  bass:      { bank: 0,   program: 33 },
  synthbass: { bank: 0,   program: 39 },
  choir:     { bank: 0,   program: 52 },
  sax:       { bank: 0,   program: 65 },
  flute:     { bank: 0,   program: 73 },
  whistle:   { bank: 0,   program: 78 },
  guitar12:  { bank: 8,   program: 25 },
  guitar:    { bank: 12,  program: 27 },
  drum:      { bank: 120, program: 0  },
  kit808:    { bank: 120, program: 25 },
  jazzkit:   { bank: 120, program: 32 },
};
const DEFAULT_PRESET = GM_PRESETS.epiano;

// GM percussion note numbers.
const DRUM_GM: Record<string, number> = {
  kick: 36,
  snare: 38,
  hihat: 42,
};

// Global output gain — matches FluidSynthBackend's setGain(0.8).
const GLOBAL_VOLUME = 0.8;

/**
 * TinySoundFont (MIT) WASM backend.
 *
 * Architecture:
 *   - One AudioWorkletNode hosts the TSF synth and outputs a stereo bus → master.
 *   - Each Part maps to a MIDI channel (0–15, in part order).
 *   - Notes are converted to absolute sample indices and posted to the worklet,
 *     which fires them block-by-block (see public/audio/tsf-worklet.js). The
 *     worklet's sample clock shares ctx's timebase, so the conversion is just
 *     round(when * sampleRate) — no async sequencer tick reference needed.
 *   - Per-part volume/mute/solo is CC7 per channel.
 */
export class TinySoundFontBackend implements VoiceBackend {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;

  // partId → MIDI channel (rebuilt on each beginPlayback)
  private channelMap = new Map<string, number>();

  // Events buffered during a synchronous scheduling pass, flushed in one
  // postMessage on the next microtask.
  private pending: ScheduledEvent[] = [];
  private flushScheduled = false;

  async connect(ctx: AudioContext, master: GainNode): Promise<void> {
    this.ctx = ctx;
    const base = import.meta.env.BASE_URL;

    // Compile the wasm on the main thread (worklets can't fetch), then load the
    // processor module and hand the compiled module to it.
    const [wasmRes] = await Promise.all([
      fetch(base + "audio/tsf.wasm"),
      ctx.audioWorklet.addModule(base + "audio/tsf-worklet.js"),
    ]);
    if (!wasmRes.ok) throw new Error(`Failed to fetch tsf.wasm: ${wasmRes.status}`);
    const wasmBytes = await wasmRes.arrayBuffer();

    this.node = new AudioWorkletNode(ctx, "tsf-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.connect(master);

    // Compile + instantiate wasm inside the worklet (we send the raw bytes;
    // transferring a WebAssembly.Module to the audio thread is unreliable),
    // then load the SoundFont.
    await this.message("ready", { type: "wasm", bytes: wasmBytes }, [wasmBytes]);
    const res = await fetch(base + "audio/GeneralUser-GS.sf2");
    if (!res.ok) throw new Error(`Failed to fetch SoundFont: ${res.status}`);
    const sf2 = await res.arrayBuffer();
    await this.message("loaded", { type: "load", sf2, sampleRate: ctx.sampleRate, volume: GLOBAL_VOLUME }, [sf2]);

    // Seed default channels so the first audition click works before play().
    this.post({
      type: "setupChannels",
      channels: [
        { channel: 0, ...GM_PRESETS.epiano, cc7: 127 },
        { channel: 1, ...GM_PRESETS.drum, cc7: 127 },
      ],
    });
    this.channelMap.set("__default_epiano__", 0);
    this.channelMap.set("__default_drum__", 1);
  }

  async beginPlayback(sheet: Sheet): Promise<void> {
    if (!this.node) return;
    this.channelMap.clear();
    const parts = sheet.parts.slice(0, 16);
    const channels = parts.map((part, i) => {
      this.channelMap.set(part.id, i);
      const preset = GM_PRESETS[part.instrument] ?? DEFAULT_PRESET;
      const cc7 = Math.round(effectivePartGain(sheet.mix, part.id) * 127);
      return { channel: i, bank: preset.bank, program: preset.program, cc7 };
    });
    this.post({ type: "setupChannels", channels });
  }

  scheduleNote(when: number, durSec: number, midi: number, velIdx: number, _dest: AudioNode, partId: string): void {
    const ch = this.channelMap.get(partId) ?? 0;
    this.scheduleHit(ch, when, durSec, midi, velIdx);
  }

  scheduleDrum(when: number, durSec: number, drumKey: string, velIdx: number, _dest: AudioNode, partId: string): void {
    const note = DRUM_GM[drumKey];
    if (note === undefined) return;
    const ch = this.channelMap.get(partId) ?? 1;
    // Drums are one-shot; keep the gate short like the FluidSynth path did.
    this.scheduleHit(ch, when, Math.max(durSec * 0.5, 0.05), note, velIdx);
  }

  syncMix(sheet: Sheet): void {
    for (const [partId, ch] of this.channelMap) {
      const part = sheet.parts.find((p) => p.id === partId);
      if (!part) continue;
      const cc7 = Math.round(effectivePartGain(sheet.mix, partId) * 127);
      this.post({ type: "ccNow", channel: ch, controller: 7, value: cc7 });
    }
  }

  cancelActive(): void {
    this.pending = [];
    this.post({ type: "panic" });
  }

  teardown(): void {
    this.cancelActive();
    this.channelMap.clear();
  }

  // Queue a note-on now and a note-off after the gate, both as sample-tagged
  // events. Velocity is converted to TSF's 0..1 range.
  private scheduleHit(channel: number, when: number, durSec: number, key: number, velIdx: number): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const vel = VEL_MIDI[velIdx] / 127;
    const onAt = Math.round(when * sr);
    const offAt = Math.round((when + durSec) * sr);
    this.pending.push({ atSample: onAt, kind: "on", channel, key, value: vel });
    this.pending.push({ atSample: offAt, kind: "off", channel, key });
    this.scheduleFlush();
  }

  // Batch all events scheduled in one synchronous pass into a single message.
  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      if (!this.pending.length) return;
      this.post({ type: "events", events: this.pending });
      this.pending = [];
    });
  }

  private post(msg: unknown): void {
    this.node?.port.postMessage(msg);
  }

  // Post a message and resolve when the worklet replies with `replyType`.
  // Rejects if the worklet reports an error first, so a wasm/SoundFont failure
  // surfaces through connect() instead of hanging the handshake forever.
  private message(replyType: string, msg: object, transfer: Transferable[] = []): Promise<void> {
    const node = this.node;
    if (!node) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => node.port.removeEventListener("message", handler);
      const handler = (e: MessageEvent) => {
        if (e.data?.type === replyType) {
          cleanup();
          resolve();
        } else if (e.data?.type === "error") {
          cleanup();
          reject(new Error(`TSF worklet error (${e.data.stage ?? "?"}): ${e.data.message ?? "unknown"}`));
        }
      };
      node.port.addEventListener("message", handler);
      node.port.start();
      node.port.postMessage(msg, transfer);
    });
  }
}
