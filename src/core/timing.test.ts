import { describe, expect, it } from "vitest";
import {
  noteFracLength,
  noteFracStart,
  noteLengthSub,
  noteStartSub,
  noteWidthPx,
  shiftNoteSubOffset,
  subToLength,
  subToStart,
} from "./timing";
import type { Note, Sheet } from "./model/types";

const note = (over: Partial<Note> = {}): Note => ({
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

describe("fractional helpers", () => {
  it("noteFracStart adds the sub-offset (4 sub-steps per step)", () => {
    expect(noteFracStart(note({ start: 3, subOffset: 2 }))).toBe(3.5);
    expect(noteFracStart(note({ start: 3 }))).toBe(3);
  });
  it("noteFracLength adds the sub-length", () => {
    expect(noteFracLength(note({ length: 2, subLength: 1 }))).toBe(2.25);
  });
  it("noteWidthPx is length*cellW + 1", () => {
    expect(noteWidthPx(2, 22)).toBe(45);
  });
  it("sub accessors", () => {
    expect(noteStartSub(note({ start: 2, subOffset: 3 }))).toBe(11);
    expect(noteLengthSub(note({ length: 1, subLength: 2 }))).toBe(6);
  });
});

describe("sub <-> step splitting round-trips", () => {
  it("subToStart", () => {
    expect(subToStart(11)).toEqual({ start: 2, subOffset: 3 });
    expect(subToStart(8)).toEqual({ start: 2, subOffset: 0 });
  });
  it("subToLength", () => {
    expect(subToLength(6)).toEqual({ length: 1, subLength: 2 });
  });
});

describe("shiftNoteSubOffset", () => {
  const sheet = { barCount: 1 } as Sheet; // totalSteps = 16 -> 64 sub-steps

  it("moves forward and reports movement", () => {
    const n = note({ start: 0 });
    expect(shiftNoteSubOffset(sheet, n, 2)).toBe(true);
    expect(noteStartSub(n)).toBe(2);
  });
  it("clamps at 0", () => {
    const n = note({ start: 0, subOffset: 1 });
    expect(shiftNoteSubOffset(sheet, n, -5)).toBe(true);
    expect(noteStartSub(n)).toBe(0);
  });
  it("clamps at the sheet end accounting for length", () => {
    const n = note({ start: 14, length: 1 }); // one step shy of the end
    expect(shiftNoteSubOffset(sheet, n, 100)).toBe(true);
    // max abs start = 64 total - 4 length = 60 sub-steps = step 15
    expect(noteStartSub(n)).toBe(60);
  });
  it("returns false when already pinned at the end", () => {
    const n = note({ start: 15, length: 1 });
    expect(shiftNoteSubOffset(sheet, n, 100)).toBe(false);
  });
  it("returns false when no movement occurs", () => {
    const n = note({ start: 0 });
    expect(shiftNoteSubOffset(sheet, n, 0)).toBe(false);
  });
});
