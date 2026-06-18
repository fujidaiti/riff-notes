import { describe, expect, it } from "vitest";
import { inScaleSet, noteScaleClass, pitchDisplayName, pitchName } from "./theory";
import type { Part } from "./model/types";

describe("pitchName", () => {
  it("names with octave (middle C is C4)", () => {
    expect(pitchName(60)).toBe("C4");
    expect(pitchName(69)).toBe("A4");
    expect(pitchName(21)).toBe("A0");
    expect(pitchName(108)).toBe("C8");
  });
  it("uses flats for accidentals", () => {
    expect(pitchName(61)).toBe("Db4");
    expect(pitchName(66)).toBe("F#4");
  });
  it("handles negative midi with floored octaves", () => {
    expect(pitchName(0)).toBe("C-1");
  });
});

describe("pitchDisplayName", () => {
  it("omits or includes octave", () => {
    expect(pitchDisplayName(60, false)).toBe("C");
    expect(pitchDisplayName(60, true)).toBe("C4");
  });
});

describe("inScaleSet", () => {
  it("computes C major pitch classes", () => {
    expect([...inScaleSet({ root: 0, mode: "major" })].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
  it("transposes by root", () => {
    expect([...inScaleSet({ root: 2, mode: "major" })].sort((a, b) => a - b)).toEqual([1, 2, 4, 6, 7, 9, 11]);
  });
  it("falls back to major for an unknown mode", () => {
    expect([...inScaleSet({ root: 0, mode: "nope" })].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
});

describe("noteScaleClass", () => {
  const pitched: Part = { id: "p", name: "", lo: 0, hi: 127, instrument: "epiano", notes: [] };
  const drum: Part = { id: "d", name: "", lo: 0, hi: 2, instrument: "drum", notes: [] };
  const cMajor = inScaleSet({ root: 0, mode: "major" });

  it("marks in-scale pitches on pitched parts", () => {
    expect(noteScaleClass(cMajor, pitched, 60)).toBe("in-scale"); // C
    expect(noteScaleClass(cMajor, pitched, 61)).toBe(""); // Db
  });
  it("never marks drum parts", () => {
    expect(noteScaleClass(cMajor, drum, 60)).toBe("");
  });
});
