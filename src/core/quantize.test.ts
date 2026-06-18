import { describe, expect, it } from "vitest";
import { quantizeNote, quantizeNotes } from "./quantize";
import type { Note, Sheet } from "./model/types";

const TOTAL_SUB = 16 * 4; // one bar

const baseNote = (over: Partial<Note> = {}): Note => ({
  id: "n",
  partId: "p",
  pitch: 60,
  start: 0,
  length: 1,
  vel: 2,
  subOffset: 0,
  subLength: 0,
  ...over,
});

describe("quantizeNote", () => {
  it("snaps start to the nearest grid multiple", () => {
    // start at step 1 + 1 sub = abs 5; snap to 1/16 (4 sub) -> 4
    const r = quantizeNote({ start: 1, length: 1, subOffset: 1, subLength: 0 }, 4, 0, TOTAL_SUB);
    expect(r.changed).toBe(true);
    expect(r.start).toBe(1);
    expect(r.subOffset).toBe(0);
  });
  it("forces length when lenSub > 0", () => {
    const r = quantizeNote({ start: 0, length: 2, subOffset: 0, subLength: 1 }, 0, 4, TOTAL_SUB);
    expect(r.length).toBe(1);
    expect(r.subLength).toBe(0);
    expect(r.changed).toBe(true);
  });
  it("reports no change when already on grid", () => {
    const r = quantizeNote({ start: 2, length: 1, subOffset: 0, subLength: 0 }, 4, 0, TOTAL_SUB);
    expect(r.changed).toBe(false);
  });
  it("clamps so a forced length stays within the sheet", () => {
    // place near the end and force a long length
    const r = quantizeNote({ start: 15, length: 1, subOffset: 0, subLength: 0 }, 0, 16, TOTAL_SUB);
    // abs start clamped to total(64) - len(16) = 48 sub -> step 12
    expect(r.start).toBe(12);
    expect(r.length).toBe(4);
  });
});

describe("quantizeNotes", () => {
  const sheet = { barCount: 1 } as Sheet;

  it("is a no-op when both grids are zero", () => {
    const notes = [baseNote({ subOffset: 1 })];
    expect(quantizeNotes(sheet, notes, 0, 0)).toBe(0);
    expect(notes[0].subOffset).toBe(1);
  });
  it("counts and applies changes", () => {
    const notes = [baseNote({ start: 0, subOffset: 1 }), baseNote({ id: "n2", start: 2 })];
    const changed = quantizeNotes(sheet, notes, 4, 0);
    expect(changed).toBe(1);
    expect(notes[0].subOffset).toBe(0);
  });
});
