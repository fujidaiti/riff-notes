import type { Sheet } from "./model/types";
import { VEL_MIDI } from "./model/constants";
import { noteFracLength, noteFracStart } from "./timing";

const TICKS_PER_QUARTER = 480;
const TICKS_PER_STEP = TICKS_PER_QUARTER / 4; // one sixteenth-note step

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
