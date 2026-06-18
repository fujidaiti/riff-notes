import { beforeEach, describe, expect, it } from "vitest";
import { copyNotes, pasteNotes } from "./clipboard";
import { resetUidCounter } from "./model/uid";
import type { Part, Sheet } from "./model/types";

const note = (id: string, start: number, pitch: number) => ({
  id,
  partId: "p",
  pitch,
  start,
  length: 1,
  vel: 2,
  subOffset: 0,
  subLength: 0,
});

const sheet = {
  parts: [{ id: "p", name: "P", lo: 60, hi: 72, instrument: "epiano" as const, notes: [note("n1", 0, 64), note("n2", 2, 67)] }],
  annotations: [{ id: "a1", text: "chord", noteIds: ["n1", "n2"], shrunkWidth: 140, placement: { anchorNoteId: "n1", dx: 0, dy: 0 } }],
} as Sheet;

const pitchedPart: Part = sheet.parts[0];

beforeEach(() => resetUidCounter());

describe("copyNotes", () => {
  it("stores notes relative to the top-left anchor (min start, max pitch)", () => {
    const clip = copyNotes(sheet, new Set(["n1", "n2"]))!;
    expect(clip.notes).toHaveLength(2);
    const n1 = clip.notes.find((c) => c.key === "n1")!;
    const n2 = clip.notes.find((c) => c.key === "n2")!;
    expect(n1).toMatchObject({ dStart: 0, dRow: 3 }); // pitch 64 vs max 67
    expect(n2).toMatchObject({ dStart: 2, dRow: 0 });
  });
  it("captures annotations bound to copied notes", () => {
    const clip = copyNotes(sheet, new Set(["n1", "n2"]))!;
    expect(clip.annotations).toEqual([{ text: "chord", noteKeys: ["n1", "n2"] }]);
  });
  it("returns null for an empty selection", () => {
    expect(copyNotes(sheet, new Set())).toBeNull();
  });
});

describe("pasteNotes", () => {
  it("places notes under a new anchor with fresh ids", () => {
    const clip = copyNotes(sheet, new Set(["n1", "n2"]))!;
    const res = pasteNotes(clip, { part: pitchedPart, step: 4, pitch: 67 }, 16);
    expect(res.notes.map((n) => n.start).sort()).toEqual([4, 6]);
    expect(res.notes.every((n) => n.id !== "n1" && n.id !== "n2")).toBe(true);
  });
  it("rebinds annotations to the pasted note ids", () => {
    const clip = copyNotes(sheet, new Set(["n1", "n2"]))!;
    const res = pasteNotes(clip, { part: pitchedPart, step: 4, pitch: 67 }, 16);
    const ids = new Set(res.notes.map((n) => n.id));
    expect(res.annotations).toHaveLength(1);
    expect(res.annotations[0].noteIds.every((id) => ids.has(id))).toBe(true);
  });
  it("skips notes that fall outside the sheet steps", () => {
    const clip = copyNotes(sheet, new Set(["n1", "n2"]))!;
    const res = pasteNotes(clip, { part: pitchedPart, step: 15, pitch: 67 }, 16);
    // n2 would land at step 17 -> dropped; n1 at step 15 survives
    expect(res.notes).toHaveLength(1);
    expect(res.notes[0].start).toBe(15);
  });
  it("reports notes outside the part's visible pitch range", () => {
    const clip = copyNotes(sheet, new Set(["n1", "n2"]))!;
    // anchor pitch 60 means n2 lands at 60 and n1 at 57 (below lo=60)
    const res = pasteNotes(clip, { part: pitchedPart, step: 0, pitch: 60 }, 16);
    expect(res.outOfRange.count).toBe(1);
    expect(res.outOfRange.min).toBe(57);
  });
});
