import * as JSSynth from "js-synthesizer";
import type { Sheet } from "../core/model/types";
import { VEL_MIDI, RHYTHM_KEYS } from "../core/model/constants";
import { effectivePartGain } from "../core/mixer";
import type { VoiceBackend } from "./VoiceBackend";

// SoundFont bank/program for each instrument ID.
// Drum kits use bank 128 (FluidSynth's internal percussion bank, which maps to
// SF2 bank 120). Pitched instruments use their standard GM/GS bank and program.
const GM_PRESETS: Record<string, { bank: number; program: number; drum: boolean }> = {
  piano:     { bank: 0,   program: 0,  drum: false },
  epiano:    { bank: 0,   program: 4,  drum: false },
  clav:      { bank: 0,   program: 7,  drum: false },
  organ:     { bank: 0,   program: 18, drum: false },
  bass:      { bank: 0,   program: 33, drum: false },
  synthbass: { bank: 0,   program: 39, drum: false },
  choir:     { bank: 0,   program: 52, drum: false },
  sax:       { bank: 0,   program: 65, drum: false },
  flute:     { bank: 0,   program: 73, drum: false },
  whistle:   { bank: 0,   program: 78, drum: false },
  guitar12:  { bank: 8,   program: 25, drum: false },
  guitar:    { bank: 12,  program: 27, drum: false },
  drum:      { bank: 120, program: 0,  drum: true  },
  kit808:    { bank: 120, program: 25, drum: true  },
  jazzkit:   { bank: 120, program: 32, drum: true  },
};
const DEFAULT_PRESET = GM_PRESETS.epiano;

// GM percussion note numbers
const DRUM_GM: Record<string, number> = {
  kick: 36,
  snare: 38,
  hihat: 42,
};

// Sequencer time scale: 1 tick = 1 ms → easy to convert sec→tick (*1000)
const TIME_SCALE = 1000;

/**
 * FluidSynth WASM backend using js-synthesizer + GeneralUser GS SoundFont.
 *
 * Architecture:
 *   - One AudioWorkletNode outputs a single stereo bus → master GainNode.
 *   - Each Part maps to a MIDI channel (0–15, in part order).
 *   - Notes are scheduled into FluidSynth's MIDI sequencer for sample-accurate timing.
 *   - Per-part volume/mute/solo is implemented via CC7 per channel.
 *   - `currentStep()` in AudioEngine still uses ctx.currentTime - t0 (sequencer
 *     tick readback is async, so we use the WebAudio clock as an equivalent estimate).
 */
export class FluidSynthBackend implements VoiceBackend {
  private ctx: AudioContext | null = null;
  private synth: JSSynth.AudioWorkletNodeSynthesizer | null = null;
  private sequencer: JSSynth.ISequencer | null = null;
  private sfontId: number | null = null;

  // partId → MIDI channel (rebuilt on each beginPlayback)
  private channelMap = new Map<string, number>();

  // Timing reference: the sequencer's tick and the corresponding ctx.currentTime,
  // captured once in beginPlayback. Used to convert when (ctx time) → seq tick.
  private seqRefTick = 0;
  private seqRefTime = 0;

  async connect(ctx: AudioContext, master: GainNode): Promise<void> {
    this.ctx = ctx;
    const base = import.meta.env.BASE_URL;

    // Load worklet modules into the AudioWorklet scope.
    await ctx.audioWorklet.addModule(base + "audio/libfluidsynth-2.4.6.js");
    await ctx.audioWorklet.addModule(base + "audio/js-synthesizer.worklet.js");

    // Create synth and connect to master.
    this.synth = new JSSynth.AudioWorkletNodeSynthesizer();
    this.synth.init(ctx.sampleRate);
    const node = this.synth.createAudioNode(ctx);
    node.connect(master);

    // Create sequencer and register synth as the event destination.
    this.sequencer = await this.synth.createSequencer();
    await this.sequencer.registerSynthesizer(this.synth);
    this.sequencer.setTimeScale(TIME_SCALE);

    // Enable light reverb, disable chorus.
    this.synth.setGain(0.8);

    // Fetch and load the SoundFont.
    const res = await fetch(base + "audio/GeneralUser-GS.sf2");
    if (!res.ok) throw new Error(`Failed to fetch SoundFont: ${res.status}`);
    const sf2 = await res.arrayBuffer();
    this.sfontId = await this.synth.loadSFont(sf2);

    // Seed default channels so audition works before the first play().
    this.seedDefaultChannels();
  }

  async beginPlayback(sheet: Sheet, t0: number): Promise<void> {
    if (!this.synth || this.sfontId === null || !this.sequencer) return;

    // Assign parts to MIDI channels 0–15 (ephemeral; rebuilt each session).
    this.channelMap.clear();
    const parts = sheet.parts.slice(0, 16);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ch = i;
      this.channelMap.set(part.id, ch);
      const preset = GM_PRESETS[part.instrument] ?? DEFAULT_PRESET;
      this.synth.midiSetChannelType(ch, preset.drum);
      this.synth.midiProgramSelect(ch, this.sfontId, preset.bank, preset.program);
    }

    // Apply initial CC7 per channel before audio starts.
    for (const [partId, ch] of this.channelMap) {
      const part = sheet.parts.find((p) => p.id === partId);
      if (!part) continue;
      const cc7 = Math.round(effectivePartGain(sheet.mix, partId) * 127);
      this.synth.midiControl(ch, 7, cc7);
    }

    // Capture sequencer tick reference. After getTick() resolves, use
    // ctx.currentTime as the corresponding wall-clock anchor. Fall back to
    // (t0 - 0.05) if the context is gone (t0 = ctx.currentTime + 0.05 was the
    // value at call time, so t0 - 0.05 ≈ ctx.currentTime before the async trip).
    const tickNow = await this.sequencer.getTick();
    this.seqRefTick = tickNow;
    this.seqRefTime = this.ctx?.currentTime ?? (t0 - 0.05);
  }

  scheduleNote(when: number, durSec: number, midi: number, velIdx: number, _dest: AudioNode, partId: string): void {
    if (!this.sequencer) return;
    const ch = this.channelMap.get(partId) ?? 0;
    const vel = VEL_MIDI[velIdx];
    const seqTick = Math.round(this.seqRefTick + (when - this.seqRefTime) * TIME_SCALE);
    const durTicks = Math.round(durSec * TIME_SCALE);
    this.sequencer.sendEventAt(
      { type: "note", channel: ch, key: midi, vel, duration: durTicks },
      seqTick,
      true,
    );
  }

  scheduleDrum(when: number, durSec: number, drumKey: string, velIdx: number, _dest: AudioNode, partId: string): void {
    if (!this.sequencer) return;
    const ch = this.channelMap.get(partId) ?? 1;
    const note = DRUM_GM[drumKey];
    if (note === undefined) return;
    const vel = VEL_MIDI[velIdx];
    const seqTick = Math.round(this.seqRefTick + (when - this.seqRefTime) * TIME_SCALE);
    const durTicks = Math.round(Math.max(durSec * 0.5, 0.05) * TIME_SCALE);
    this.sequencer.sendEventAt(
      { type: "note", channel: ch, key: note, vel, duration: durTicks },
      seqTick,
      true,
    );
  }

  syncMix(sheet: Sheet): void {
    if (!this.synth) return;
    for (const [partId, ch] of this.channelMap) {
      const cc7 = Math.round(effectivePartGain(sheet.mix, partId) * 127);
      this.synth.midiControl(ch, 7, cc7);
    }
  }

  cancelActive(): void {
    if (!this.synth) return;
    this.sequencer?.removeAllEvents();
    this.synth.midiAllSoundsOff();
  }

  teardown(): void {
    this.cancelActive();
    this.channelMap.clear();
  }

  // Seeds ch0=epiano, ch1=drums so the very first audition click works before
  // any play() call has established the channel map.
  private seedDefaultChannels(): void {
    if (!this.synth || this.sfontId === null) return;
    const epiano = GM_PRESETS.epiano;
    const drum = GM_PRESETS.drum;
    this.synth.midiSetChannelType(0, epiano.drum);
    this.synth.midiProgramSelect(0, this.sfontId, epiano.bank, epiano.program);
    this.synth.midiSetChannelType(1, drum.drum);
    this.synth.midiProgramSelect(1, this.sfontId, drum.bank, drum.program);
    this.channelMap.set("__default_epiano__", 0);
    this.channelMap.set("__default_drum__", 1);
  }
}

// Re-export RHYTHM_KEYS so AudioEngine can access drum GM note lookup without
// importing FluidSynthBackend directly.
export { RHYTHM_KEYS };
