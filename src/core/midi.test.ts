import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSheetMidi, midiVelToIdx, parseMidiToSheet } from "./midi";
import { makeSheet } from "./model/factory";
import { resetUidCounter } from "./model/uid";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__/midi");
const load = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

describe("midiVelToIdx", () => {
  it("maps velocity ranges to 0-4", () => {
    expect(midiVelToIdx(0)).toBe(0);
    expect(midiVelToIdx(30)).toBe(0);
    expect(midiVelToIdx(31)).toBe(1);
    expect(midiVelToIdx(55)).toBe(1);
    expect(midiVelToIdx(56)).toBe(2);
    expect(midiVelToIdx(80)).toBe(2);
    expect(midiVelToIdx(81)).toBe(3);
    expect(midiVelToIdx(105)).toBe(3);
    expect(midiVelToIdx(106)).toBe(4);
    expect(midiVelToIdx(127)).toBe(4);
  });
});

describe("parseMidiToSheet", () => {
  it("returns null for invalid magic", () => {
    expect(parseMidiToSheet(load("invalid.mid"))).toBeNull();
  });

  it("returns null for empty data", () => {
    expect(parseMidiToSheet(new Uint8Array(0))).toBeNull();
  });

  describe("format1-simple.mid", () => {
    it("parses BPM, part name, note count, pitches and velocity indices", () => {
      const sheet = parseMidiToSheet(load("format1-simple.mid"), "Simple");
      expect(sheet).not.toBeNull();
      expect(sheet!.bpm).toBe(100);
      expect(sheet!.title).toBe("Simple");
      expect(sheet!.parts).toHaveLength(1);
      expect(sheet!.parts[0].name).toBe("Piano");
      expect(sheet!.parts[0].notes).toHaveLength(2);

      const [n1, n2] = sheet!.parts[0].notes;
      expect(n1.pitch).toBe(60);
      expect(n1.vel).toBe(2);   // vel 80 → idx 2
      expect(n2.pitch).toBe(64);
      expect(n2.vel).toBe(1);   // vel 40 → idx 1
    });

    it("converts tick timing to steps correctly (tpq=480, TICKS_PER_STEP=120)", () => {
      // note1: on at tick 0, off at tick 480 → 4 steps
      // note2: on at tick 960, off at tick 1440 → start=8, length=4
      const sheet = parseMidiToSheet(load("format1-simple.mid"))!;
      const [n1, n2] = sheet.parts[0].notes;
      expect(n1.start).toBe(0);
      expect(n1.subOffset).toBe(0);
      expect(n1.length).toBe(4);
      expect(n1.subLength).toBe(0);
      expect(n2.start).toBe(8);
      expect(n2.subOffset).toBe(0);
      expect(n2.length).toBe(4);
      expect(n2.subLength).toBe(0);
    });

    it("sets lo/hi from min/max pitch ±2 clamped to piano range", () => {
      const sheet = parseMidiToSheet(load("format1-simple.mid"))!;
      const part = sheet.parts[0];
      // pitches: 60, 64
      expect(part.lo).toBeLessThanOrEqual(58); // 60 - 2
      expect(part.hi).toBeGreaterThanOrEqual(66); // 64 + 2
      expect(part.lo).toBeGreaterThanOrEqual(21); // PIANO_MIN
      expect(part.hi).toBeLessThanOrEqual(108);   // PIANO_MAX
    });

    it("uses 'Imported Sheet' title when titleHint is omitted", () => {
      const sheet = parseMidiToSheet(load("format1-simple.mid"));
      expect(sheet!.title).toBe("Imported Sheet");
    });
  });

  describe("format1-2parts.mid", () => {
    it("creates one part per non-empty track with correct names and BPM", () => {
      const sheet = parseMidiToSheet(load("format1-2parts.mid"))!;
      expect(sheet.bpm).toBe(140);
      expect(sheet.parts).toHaveLength(2);
      expect(sheet.parts[0].name).toBe("Melody");
      expect(sheet.parts[1].name).toBe("Bass");
    });

    it("parses notes in both parts correctly", () => {
      const sheet = parseMidiToSheet(load("format1-2parts.mid"))!;
      // Melody: pitch=67, 2 steps (tick 240 → 2 steps)
      expect(sheet.parts[0].notes[0].pitch).toBe(67);
      expect(sheet.parts[0].notes[0].length).toBe(2);
      // Bass: pitch=48, 4 steps
      expect(sheet.parts[1].notes[0].pitch).toBe(48);
      expect(sheet.parts[1].notes[0].length).toBe(4);
    });
  });

  describe("format1-tpq960.mid", () => {
    it("handles non-standard TPQ (960) correctly", () => {
      // note-on at tick 960 with tpq=960: 960 ticks = 1 quarter = 4 steps
      // subSteps: round(960 * 16 / 960) = 16 sub-steps = 4 steps
      const sheet = parseMidiToSheet(load("format1-tpq960.mid"))!;
      expect(sheet.parts).toHaveLength(1);
      expect(sheet.parts[0].name).toBe("Lead");
      const note = sheet.parts[0].notes[0];
      expect(note.start).toBe(4);
      expect(note.subOffset).toBe(0);
      expect(note.length).toBe(4);
    });

    it("defaults to BPM 120 when no tempo meta is present", () => {
      const sheet = parseMidiToSheet(load("format1-tpq960.mid"))!;
      expect(sheet.bpm).toBe(120);
    });
  });

  describe("format0-2channels.mid", () => {
    it("splits a format-0 file into one part per MIDI channel", () => {
      const sheet = parseMidiToSheet(load("format0-2channels.mid"))!;
      expect(sheet.parts).toHaveLength(2);
      expect(sheet.parts[0].name).toBe("Channel 0");
      expect(sheet.parts[1].name).toBe("Channel 1");
    });

    it("assigns notes to the correct parts", () => {
      const sheet = parseMidiToSheet(load("format0-2channels.mid"))!;
      expect(sheet.parts[0].notes.every((n) => n.pitch === 60)).toBe(true);
      expect(sheet.parts[1].notes.every((n) => n.pitch === 72)).toBe(true);
    });
  });

  describe("barcount.mid", () => {
    it("sets barCount to ceil(lastNoteEnd / STEPS_PER_BAR)", () => {
      // Note ends at step 17 (just past bar 1 of 16 steps) → barCount=2
      const sheet = parseMidiToSheet(load("barcount.mid"))!;
      expect(sheet.barCount).toBe(2);
    });
  });

  describe("round-trip fidelity (format 1)", () => {
    it("preserves pitches, velocity indices, and BPM through export → import", () => {
      resetUidCounter();
      const source = makeSheet("Round-trip");
      source.bpm = 88;
      const part = source.parts[0];
      part.name = "Test Part";
      part.notes = [
        { id: "n1", partId: part.id, pitch: 55, start: 0, length: 4, vel: 3, subOffset: 0, subLength: 0 },
        { id: "n2", partId: part.id, pitch: 62, start: 8, length: 2, vel: 1, subOffset: 0, subLength: 0 },
      ];

      const bytes = buildSheetMidi(source);
      const imported = parseMidiToSheet(bytes, "Round-trip")!;

      expect(imported.bpm).toBe(88);
      expect(imported.parts).toHaveLength(1);
      expect(imported.parts[0].name).toBe("Test Part");
      expect(imported.parts[0].notes).toHaveLength(2);

      const [i1, i2] = imported.parts[0].notes;
      expect(i1.pitch).toBe(55);
      expect(i1.start).toBe(0);
      expect(i1.length).toBe(4);
      expect(i1.vel).toBe(3);
      expect(i2.pitch).toBe(62);
      expect(i2.start).toBe(8);
      expect(i2.length).toBe(2);
      expect(i2.vel).toBe(1);
    });
  });
});
