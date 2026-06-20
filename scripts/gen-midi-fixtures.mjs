/**
 * Generates binary MIDI fixture files used by src/core/midi.test.ts.
 * Run once: node scripts/gen-midi-fixtures.mjs
 * Commit the resulting .mid files under src/core/__fixtures__/midi/.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../src/core/__fixtures__/midi");
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function varLen(n) {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}

function u16(n) { return [(n >> 8) & 0xff, n & 0xff]; }
function u32(n) { return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; }

function strBytes(s) { return [...new TextEncoder().encode(s)]; }

function metaTempo(bpm) {
  const mpq = Math.round(60_000_000 / bpm);
  return [0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff];
}

function metaTrackName(name) {
  const b = strBytes(name);
  return [0xff, 0x03, b.length, ...b];
}

const META_EOT = [0xff, 0x2f, 0x00];

/** Build a raw event list from an array of { dt, bytes } and wrap in MTrk. */
function buildTrack(events) {
  const body = [];
  for (const { dt, bytes } of events) {
    body.push(...varLen(dt), ...bytes);
  }
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
}

/** Assemble format-1 SMF from pre-built track byte arrays. */
function smf1(tpq, tracks) {
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(tpq)];
  return new Uint8Array([...header, ...tracks.flat()]);
}

/** Assemble format-0 SMF from a single track byte array. */
function smf0(tpq, track) {
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(tpq)];
  return new Uint8Array([...header, ...track]);
}

function noteOn(ch, pitch, vel) { return [0x90 | ch, pitch, vel]; }
function noteOff(ch, pitch) { return [0x80 | ch, pitch, 0]; }

// ---------------------------------------------------------------------------
// format1-simple.mid
// BPM 100, TPQ 480, 1 part "Piano"
// Note 1: pitch=60 vel=80 at tick=0, off at tick=480 (4 steps)     → vel idx 2
// Note 2: pitch=64 vel=40 at tick=960, off at tick=1440 (4 steps)  → vel idx 1
// ---------------------------------------------------------------------------
{
  const tempoTrack = buildTrack([
    { dt: 0, bytes: metaTempo(100) },
    { dt: 0, bytes: META_EOT },
  ]);
  const noteTrack = buildTrack([
    { dt: 0,    bytes: metaTrackName("Piano") },
    { dt: 0,    bytes: noteOn(0, 60, 80) },   // vel 80 → idx 2
    { dt: 480,  bytes: noteOff(0, 60) },
    { dt: 480,  bytes: noteOn(0, 64, 40) },   // vel 40 → idx 1
    { dt: 480,  bytes: noteOff(0, 64) },
    { dt: 0,    bytes: META_EOT },
  ]);
  writeFileSync(join(OUT, "format1-simple.mid"), smf1(480, [tempoTrack, noteTrack]));
  console.log("wrote format1-simple.mid");
}

// ---------------------------------------------------------------------------
// format1-2parts.mid
// BPM 140, TPQ 480, 2 parts "Melody" and "Bass"
// Melody: pitch=67 vel=100 at tick=0, off at tick=240 (2 steps)    → vel idx 3
// Bass:   pitch=48 vel=60  at tick=0, off at tick=480 (4 steps)    → vel idx 2
// ---------------------------------------------------------------------------
{
  const tempoTrack = buildTrack([
    { dt: 0, bytes: metaTempo(140) },
    { dt: 0, bytes: META_EOT },
  ]);
  const melodyTrack = buildTrack([
    { dt: 0,   bytes: metaTrackName("Melody") },
    { dt: 0,   bytes: noteOn(0, 67, 100) },
    { dt: 240, bytes: noteOff(0, 67) },
    { dt: 0,   bytes: META_EOT },
  ]);
  const bassTrack = buildTrack([
    { dt: 0,   bytes: metaTrackName("Bass") },
    { dt: 0,   bytes: noteOn(0, 48, 60) },
    { dt: 480, bytes: noteOff(0, 48) },
    { dt: 0,   bytes: META_EOT },
  ]);
  writeFileSync(join(OUT, "format1-2parts.mid"), smf1(480, [tempoTrack, melodyTrack, bassTrack]));
  console.log("wrote format1-2parts.mid");
}

// ---------------------------------------------------------------------------
// format1-tpq960.mid
// TPQ 960 (double the app's default), no tempo meta (default 120)
// 1 part "Lead"
// Note: pitch=60 vel=64 at tick=960 (= 4 steps at tpq=960), off at tick=1920
// ---------------------------------------------------------------------------
{
  const tempoTrack = buildTrack([
    { dt: 0, bytes: META_EOT },
  ]);
  const noteTrack = buildTrack([
    { dt: 0,    bytes: metaTrackName("Lead") },
    { dt: 960,  bytes: noteOn(0, 60, 64) },   // vel 64 → idx 2
    { dt: 960,  bytes: noteOff(0, 60) },
    { dt: 0,    bytes: META_EOT },
  ]);
  writeFileSync(join(OUT, "format1-tpq960.mid"), smf1(960, [tempoTrack, noteTrack]));
  console.log("wrote format1-tpq960.mid");
}

// ---------------------------------------------------------------------------
// format0-2channels.mid
// TPQ 480, format 0, notes on channels 0 and 1
// Ch 0: pitch=60 vel=64 at tick=0, off at tick=480
// Ch 1: pitch=72 vel=100 at tick=0, off at tick=480
// Last note end: tick=480 = 4 steps → barCount=1
// ---------------------------------------------------------------------------
{
  const track = buildTrack([
    { dt: 0,   bytes: noteOn(0, 60, 64) },
    { dt: 0,   bytes: noteOn(1, 72, 100) },
    { dt: 480, bytes: noteOff(0, 60) },
    { dt: 0,   bytes: noteOff(1, 72) },
    { dt: 0,   bytes: META_EOT },
  ]);
  writeFileSync(join(OUT, "format0-2channels.mid"), smf0(480, track));
  console.log("wrote format0-2channels.mid");
}

// ---------------------------------------------------------------------------
// barcount.mid
// Format 1, TPQ 480, 1 part
// Note ending at step 17 (just past bar 1) → barCount should be 2
// step 17 = tick 17 * 120 = 2040 (at app's internal TICKS_PER_STEP=120)
// note-on at tick=1920 (step 16), off at tick=2040 (step 17)
// ---------------------------------------------------------------------------
{
  const tempoTrack = buildTrack([
    { dt: 0, bytes: META_EOT },
  ]);
  const noteTrack = buildTrack([
    { dt: 1920, bytes: noteOn(0, 60, 64) },
    { dt: 120,  bytes: noteOff(0, 60) },
    { dt: 0,    bytes: META_EOT },
  ]);
  writeFileSync(join(OUT, "barcount.mid"), smf1(480, [tempoTrack, noteTrack]));
  console.log("wrote barcount.mid");
}

// ---------------------------------------------------------------------------
// invalid.mid — not a valid MIDI file
// ---------------------------------------------------------------------------
{
  writeFileSync(join(OUT, "invalid.mid"), new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]));
  console.log("wrote invalid.mid");
}

console.log("Done.");
