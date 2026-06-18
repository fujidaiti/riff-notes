import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, Sheet } from "../../core/model/types";
import { SUB_PER_STEP } from "../../core/model/constants";
import { isRhythmPart, totalSteps } from "../../core/model/factory";
import { uid } from "../../core/model/uid";
import { subToStart } from "../../core/timing";
import type { AudioEngine } from "../../audio/AudioEngine";
import type { Action } from "../../state/types";

export type RecordPhase = "idle" | "count-in" | "recording";

// Minimal Web MIDI typings (the DOM lib doesn't always ship them).
interface MidiMessage {
  data: Uint8Array | null;
}
interface MidiInput {
  addEventListener(type: "midimessage", listener: (e: MidiMessage) => void): void;
  removeEventListener(type: "midimessage", listener: (e: MidiMessage) => void): void;
}
interface MidiAccess {
  inputs: Map<string, MidiInput>;
}
type RequestMIDIAccess = () => Promise<MidiAccess>;

function midiVelToIdx(v: number): number {
  if (v <= 30) return 0;
  if (v <= 55) return 1;
  if (v <= 80) return 2;
  if (v <= 105) return 3;
  return 4;
}

/**
 * Web-MIDI recording into a part. A one-bar metronome count-in precedes a
 * free-time take: incoming note-ons create notes at the current step (optionally
 * quantized), note-offs set their length. Notes are written live via
 * MUTATE_SHEET_LIVE, with a single PUSH_HISTORY at the start so the whole take
 * is one undo step. The metronome clicks each beat throughout.
 */
export function useMidiRecording(engine: AudioEngine, sheet: Sheet, dispatch: (a: Action) => void, posQuantizeSub = SUB_PER_STEP) {
  const [phase, setPhase] = useState<RecordPhase>("idle");
  const cfg = useRef({ sheet, dispatch, posQuantizeSub });
  cfg.current = { sheet, dispatch, posQuantizeSub };

  const t0 = useRef(0);
  const secPerStep = useRef(0);
  const held = useRef(new Map<number, { id: string; startSub: number }>());
  const access = useRef<MidiAccess | null>(null);
  const metro = useRef<ReturnType<typeof setInterval> | null>(null);
  const countIn = useRef<ReturnType<typeof setInterval> | null>(null);
  const partId = useRef<string | null>(null);
  const recStep = useRef<() => number | null>(() => null);

  const getRecordStep = useCallback(() => recStep.current(), []);

  const cleanup = useCallback(() => {
    if (metro.current) clearInterval(metro.current);
    if (countIn.current) clearInterval(countIn.current);
    metro.current = null;
    countIn.current = null;
    held.current.clear();
    recStep.current = () => null;
  }, []);

  const onMidiMessage = useCallback((ev: MidiMessage) => {
    const data = ev.data;
    if (!data || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data[2];
    const { sheet: sh, dispatch: dsp, posQuantizeSub: q } = cfg.current;
    const pid = partId.current;
    if (!pid) return;
    const part = sh.parts.find((p) => p.id === pid);
    if (!part) return;
    const total = totalSteps(sh);
    const curStep = recStep.current() ?? 0;

    if (cmd === 0x90 && d2 > 0) {
      const endSub = total * SUB_PER_STEP;
      let curSub = Math.round(curStep * SUB_PER_STEP);
      if (q > 0) curSub = Math.round(curSub / q) * q;
      curSub = Math.max(0, Math.min(curSub, endSub - 1));
      const { start, subOffset } = subToStart(curSub);
      const pitch = isRhythmPart(part) ? part.hi - (((d1 - 36) % 3) + 3) % 3 : d1;
      const id = uid();
      const note: Note = { id, partId: pid, pitch, start, length: 1, vel: midiVelToIdx(d2), subOffset, subLength: 0 };
      held.current.set(d1, { id, startSub: curSub });
      dsp({ type: "MUTATE_SHEET_LIVE", sheetId: sh.id, mutate: (s) => void s.parts.find((p) => p.id === pid)?.notes.push(note) });
      engine.auditionNote(sh, note);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      const entry = held.current.get(d1);
      if (!entry) return;
      held.current.delete(d1);
      const endSub = Math.max(entry.startSub + 1, Math.round(curStep * SUB_PER_STEP));
      const lenSub = endSub - entry.startSub;
      const length = Math.max(1, Math.floor(lenSub / SUB_PER_STEP));
      const subLength = lenSub - length * SUB_PER_STEP;
      dsp({
        type: "MUTATE_SHEET_LIVE",
        sheetId: sh.id,
        mutate: (s) => {
          for (const p of s.parts) {
            if (isRhythmPart(p)) continue;
            const n = p.notes.find((x) => x.id === entry.id);
            if (n) {
              n.length = length;
              n.subLength = subLength;
            }
          }
        },
      });
    }
  }, [engine]);

  const stop = useCallback(() => {
    cleanup();
    for (const input of access.current?.inputs.values() ?? []) input.removeEventListener("midimessage", onMidiMessage);
    partId.current = null;
    setPhase("idle");
  }, [cleanup, onMidiMessage]);

  const start = useCallback(
    async (recordPartId: string) => {
      const req = (navigator as Navigator & { requestMIDIAccess?: RequestMIDIAccess }).requestMIDIAccess;
      if (!req) {
        alert("Web MIDI is not supported in this browser.");
        return;
      }
      let midi = access.current;
      if (!midi) {
        try {
          midi = await req.call(navigator);
          access.current = midi;
        } catch {
          alert("MIDI access was denied. Connect a device and allow access.");
          return;
        }
      }
      if ([...midi.inputs.values()].length === 0) {
        alert("No MIDI input devices found.");
        return;
      }

      const sh = cfg.current.sheet;
      partId.current = recordPartId;
      secPerStep.current = 60 / sh.bpm / 4;
      const beatDur = secPerStep.current * 4 * 1000; // one beat = 4 sixteenth steps
      const total = totalSteps(sh);

      const beginRecording = () => {
        setPhase("recording");
        t0.current = performance.now();
        recStep.current = () => {
          const cur = (performance.now() - t0.current) / 1000 / secPerStep.current;
          if (cur >= total) {
            stop();
            return null;
          }
          return cur;
        };
        let beat = 0;
        metro.current = setInterval(() => {
          engine.click(beat % 4 === 0);
          beat++;
        }, beatDur);
        for (const input of midi!.inputs.values()) input.addEventListener("midimessage", onMidiMessage);
      };

      // One snapshot for the whole take, then a one-bar (4-beat) count-in.
      dispatch({ type: "PUSH_HISTORY" });
      setPhase("count-in");
      engine.click(true);
      let beat = 1;
      countIn.current = setInterval(() => {
        if (beat >= 4) {
          if (countIn.current) clearInterval(countIn.current);
          countIn.current = null;
          beginRecording();
          return;
        }
        engine.click(false);
        beat++;
      }, beatDur);
    },
    [dispatch, engine, onMidiMessage, stop],
  );

  useEffect(() => cleanup, [cleanup]);

  return { phase, start, stop, getRecordStep, recording: phase !== "idle" };
}
