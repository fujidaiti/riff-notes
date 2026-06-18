import { describe, expect, it } from "vitest";
import { dropForeignPart, partOfSelection, toggleNote } from "./selection";
import type { Sheet } from "./model/types";

const note = (id: string, partId: string) => ({
  id,
  partId,
  pitch: 60,
  start: 0,
  length: 1,
  vel: 2,
  subOffset: 0,
  subLength: 0,
});

const sheet = {
  parts: [
    { id: "pA", name: "", lo: 0, hi: 127, instrument: "epiano" as const, notes: [note("a1", "pA"), note("a2", "pA")] },
    { id: "pB", name: "", lo: 0, hi: 127, instrument: "epiano" as const, notes: [note("b1", "pB")] },
  ],
} as Sheet;

describe("partOfSelection", () => {
  it("returns null when empty", () => {
    expect(partOfSelection(sheet, new Set())).toBeNull();
  });
  it("returns the part of a selected note", () => {
    expect(partOfSelection(sheet, new Set(["b1"]))).toBe("pB");
  });
});

describe("dropForeignPart", () => {
  it("keeps only notes from keepPartId", () => {
    const next = dropForeignPart(sheet, new Set(["a1", "b1"]), "pA");
    expect([...next].sort()).toEqual(["a1"]);
  });
  it("returns a new set (immutability)", () => {
    const input = new Set(["a1"]);
    const next = dropForeignPart(sheet, input, "pA");
    expect(next).not.toBe(input);
  });
});

describe("toggleNote (single-part invariant)", () => {
  it("removes an already-selected note", () => {
    expect([...toggleNote(sheet, new Set(["a1"]), note("a1", "pA"))]).toEqual([]);
  });
  it("adds within the same part", () => {
    expect([...toggleNote(sheet, new Set(["a1"]), note("a2", "pA"))].sort()).toEqual(["a1", "a2"]);
  });
  it("drops the foreign part when selecting in another part", () => {
    const next = toggleNote(sheet, new Set(["a1", "a2"]), note("b1", "pB"));
    expect([...next].sort()).toEqual(["b1"]);
  });
});
