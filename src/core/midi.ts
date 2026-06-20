import type { Note, Part, Sheet } from "./model/types";
import { PIANO_MAX, PIANO_MIN, STEPS_PER_BAR, SUB_PER_STEP, VEL_MIDI } from "./model/constants";
import { makeDefaultMix } from "./model/factory";
import { subToStart } from "./timing";
import { uid } from "./model/uid";
import { noteFracLength, noteFracStart } from "./timing";

const TICKS_PER_QUARTER = 480;
const TICKS_PER_STEP = TICKS_PER_QUARTER / 4; // one sixteenth-note step

// ---------------------------------------------------------------------------
// Shared velocity mapping (also imported by useMidiRecording.ts)
// ---------------------------------------------------------------------------

export function midiVelToIdx(v: number): number {
  if (v <= 30) return 0;
  if (v <= 55) return 1;
  if (v <= 80) return 2;
  if (v <= 105) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// MIDI file export
// ---------------------------------------------------------------------------

function writeVarLen(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function strBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function buildTrack(sheet: Sheet, partIndex: number): number[] {
  const part = sheet.parts[partIndex];
  const isFirst = partIndex === 0;
  const events: { tick: number; order: number; bytes: number[] }[] = [];

  if (isFirst) {
    const mpq = Math.round(60_000_000 / sheet.bpm);
    events.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff] });
  }

  const nameBytes = strBytes(part.name);
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x03, nameBytes.length, ...nameBytes] });

  for (const n of part.notes) {
    const onTick = Math.round(noteFracStart(n) * TICKS_PER_STEP);
    const offTick = Math.round((noteFracStart(n) + noteFracLength(n)) * TICKS_PER_STEP);
    const vel = VEL_MIDI[n.vel] ?? 100;
    events.push({ tick: onTick, order: 1, bytes: [0x90, n.pitch, vel] });
    events.push({ tick: offTick, order: 0, bytes: [0x80, n.pitch, 0] });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const lastTick = events.length ? events[events.length - 1].tick : 0;
  events.push({ tick: lastTick, order: 2, bytes: [0xff, 0x2f, 0x00] });

  const out: number[] = [];
  let prev = 0;
  for (const e of events) {
    const delta = e.tick - prev;
    prev = e.tick;
    out.push(...writeVarLen(delta), ...e.bytes);
  }
  return out;
}

/** Build a Standard MIDI File (format 1) for the given sheet and return the bytes. */
export function buildSheetMidi(sheet: Sheet): Uint8Array {
  const tracks = sheet.parts.map((_, i) => buildTrack(sheet, i));
  const numTracks = tracks.length;
  const header: number[] = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
    (numTracks >> 8) & 0xff, numTracks & 0xff,
    (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff,
  ];
  const bytes: number[] = [...header];
  for (const t of tracks) {
    bytes.push(0x4d, 0x54, 0x72, 0x6b);
    bytes.push((t.length >> 24) & 0xff, (t.length >> 16) & 0xff, (t.length >> 8) & 0xff, t.length & 0xff);
    bytes.push(...t);
  }
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// MIDI file import
// ---------------------------------------------------------------------------

function readU16(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    (((data[offset] ?? 0) << 24) |
      ((data[offset + 1] ?? 0) << 16) |
      ((data[offset + 2] ?? 0) << 8) |
      (data[offset + 3] ?? 0)) >>>
    0
  );
}

function readVarLen(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  let b: number;
  do {
    b = data[offset + bytesRead] ?? 0;
    value = (value << 7) | (b & 0x7f);
    bytesRead++;
  } while (b & 0x80 && bytesRead < 4);
  return { value, bytesRead };
}

function tickToSub(tick: number, fileTpq: number): number {
  return Math.round((tick * 4 * SUB_PER_STEP) / fileTpq);
}

interface RawNote {
  pitch: number;
  channel: number;
  vel: number;       // 0-4
  start: number;
  subOffset: number;
  length: number;
  subLength: number;
}

interface ParsedTrack {
  name: string | null;
  bpm: number | null;
  notes: RawNote[];
}

function parseTrack(data: Uint8Array, chunkStart: number, chunkLen: number, fileTpq: number): ParsedTrack {
  let name: string | null = null;
  let bpm: number | null = null;
  const notes: RawNote[] = [];
  const pending = new Map<number, { startSub: number; vel: number }>();

  let pos = chunkStart;
  const end = chunkStart + chunkLen;
  let absTick = 0;
  let runningStatus = 0;

  while (pos < end) {
    const dv = readVarLen(data, pos);
    pos += dv.bytesRead;
    absTick += dv.value;

    const peek = data[pos] ?? 0;
    let status: number;
    if (peek >= 0x80) {
      status = peek;
      pos++;
    } else {
      status = runningStatus;
    }

    if (status === 0xFF) {
      const type = data[pos++] ?? 0;
      const mv = readVarLen(data, pos);
      pos += mv.bytesRead;
      const metaEnd = pos + mv.value;

      if (type === 0x51 && mv.value === 3 && bpm === null) {
        const mpq = ((data[pos] ?? 0) << 16) | ((data[pos + 1] ?? 0) << 8) | (data[pos + 2] ?? 0);
        if (mpq > 0) bpm = Math.round(60_000_000 / mpq);
      } else if (type === 0x03) {
        name = new TextDecoder().decode(data.subarray(pos, metaEnd));
      } else if (type === 0x2F) {
        break; // end of track
      }

      pos = metaEnd;
      runningStatus = 0;
    } else if (status === 0xF0 || status === 0xF7) {
      const sv = readVarLen(data, pos);
      pos += sv.bytesRead + sv.value;
      runningStatus = 0;
    } else {
      const cmd = status & 0xF0;
      const ch = status & 0x0F;
      runningStatus = status;

      if (cmd === 0x80 || cmd === 0x90) {
        const d1 = data[pos++] ?? 0; // pitch
        const d2 = data[pos++] ?? 0; // velocity
        const key = (d1 << 4) | ch;

        if (cmd === 0x90 && d2 > 0) {
          const startSub = tickToSub(absTick, fileTpq);
          pending.set(key, { startSub, vel: midiVelToIdx(d2) });
        } else {
          const entry = pending.get(key);
          if (entry) {
            pending.delete(key);
            const endSub = tickToSub(absTick, fileTpq);
            const lenSub = Math.max(1, endSub - entry.startSub);
            const { start, subOffset } = subToStart(entry.startSub);
            const length = Math.max(1, Math.floor(lenSub / SUB_PER_STEP));
            const subLength = lenSub - length * SUB_PER_STEP;
            notes.push({ pitch: d1, channel: ch, vel: entry.vel, start, subOffset, length, subLength });
          }
        }
      } else if (cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) {
        pos += 2;
      } else if (cmd === 0xC0 || cmd === 0xD0) {
        pos += 1;
      }
    }
  }

  return { name, bpm, notes };
}

function buildPart(rawNotes: RawNote[], name: string): Part {
  const partId = uid();
  let minPitch = 127;
  let maxPitch = 0;

  const notes: Note[] = rawNotes.map((rn) => {
    if (rn.pitch < minPitch) minPitch = rn.pitch;
    if (rn.pitch > maxPitch) maxPitch = rn.pitch;
    return { id: uid(), partId, pitch: rn.pitch, start: rn.start, subOffset: rn.subOffset, length: rn.length, subLength: rn.subLength, vel: rn.vel };
  });

  if (notes.length === 0) { minPitch = 60; maxPitch = 60; }

  const lo = Math.max(PIANO_MIN, Math.min(PIANO_MAX, minPitch - 2));
  const hi = Math.max(PIANO_MIN, Math.min(PIANO_MAX, maxPitch + 2));

  return { id: partId, name, lo, hi, instrument: "epiano", notes };
}

/**
 * Parse a Standard MIDI File (format 0 or 1) into a Sheet.
 * Format 1: one Part per track (conductor/empty tracks skipped).
 * Format 0: one Part per MIDI channel used.
 * Returns null if the data is not a recognized SMF.
 */
export function parseMidiToSheet(data: Uint8Array, titleHint?: string): Sheet | null {
  if (data.length < 14) return null;
  if (data[0] !== 0x4d || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) return null;

  const headerLen = readU32(data, 4);
  if (headerLen < 6) return null;

  const format = readU16(data, 8);
  if (format > 1) return null;

  const numTracks = readU16(data, 10);
  const fileTpq = readU16(data, 12);
  if (fileTpq & 0x8000) return null; // SMPTE timecode not supported

  const parsed: ParsedTrack[] = [];
  let pos = 8 + headerLen;

  for (let t = 0; t < numTracks; t++) {
    if (pos + 8 > data.length) break;
    if (data[pos] !== 0x4d || data[pos + 1] !== 0x54 || data[pos + 2] !== 0x72 || data[pos + 3] !== 0x6b) break;
    const trackLen = readU32(data, pos + 4);
    pos += 8;
    const chunkLen = Math.min(trackLen, data.length - pos);
    parsed.push(parseTrack(data, pos, chunkLen, fileTpq));
    pos += trackLen;
  }

  if (parsed.length === 0) return null;

  let bpm = 120;
  for (const t of parsed) {
    if (t.bpm !== null) { bpm = t.bpm; break; }
  }

  let parts: Part[];
  if (format === 0) {
    const byChannel = new Map<number, RawNote[]>();
    for (const n of parsed[0]?.notes ?? []) {
      let arr = byChannel.get(n.channel);
      if (!arr) { arr = []; byChannel.set(n.channel, arr); }
      arr.push(n);
    }
    const sortedChannels = [...byChannel.keys()].sort((a, b) => a - b);
    parts = sortedChannels.map((ch) => buildPart(byChannel.get(ch)!, `Channel ${ch}`));
  } else {
    const trackParts: Part[] = [];
    let partIdx = 0;
    for (const track of parsed) {
      if (track.notes.length === 0) continue;
      trackParts.push(buildPart(track.notes, track.name ?? `Part ${++partIdx}`));
    }
    parts = trackParts;
  }

  if (parts.length === 0) return null;

  let maxStep = 0;
  for (const p of parts) {
    for (const n of p.notes) maxStep = Math.max(maxStep, n.start + n.length);
  }
  const barCount = Math.max(1, Math.ceil(maxStep / STEPS_PER_BAR));

  return {
    id: uid(),
    title: titleHint ?? "Imported Sheet",
    notes: "",
    bpm,
    scale: { root: 0, mode: "major" },
    parts,
    barCount,
    annotations: [],
    mix: makeDefaultMix(parts),
  };
}
