import { describe, expect, it } from "vitest";
import { removeNotesByIds } from "./notes";
import type { Sheet } from "./model/types";

const note = (id: string) => ({ id, partId: "p", pitch: 60, start: 0, length: 1, vel: 2, subOffset: 0, subLength: 0 });

const makeSheet = (): Sheet =>
  ({
    parts: [{ id: "p", name: "", lo: 0, hi: 127, instrument: "epiano", notes: [note("n1"), note("n2"), note("n3")] }],
    annotations: [
      { id: "a1", text: "x", noteIds: ["n1", "n2"], shrunkWidth: 140, placement: { anchorNoteId: "n1", dx: 1, dy: 2 } },
      { id: "a2", text: "y", noteIds: ["n3"], shrunkWidth: 140, placement: { anchorNoteId: "n3", dx: 0, dy: 0 } },
    ],
  }) as Sheet;

describe("removeNotesByIds", () => {
  it("removes notes and returns the count", () => {
    const sheet = makeSheet();
    expect(removeNotesByIds(sheet, new Set(["n1", "n3"]))).toBe(2);
    expect(sheet.parts[0].notes.map((n) => n.id)).toEqual(["n2"]);
  });

  it("re-anchors an annotation whose anchor was removed but members survive", () => {
    const sheet = makeSheet();
    removeNotesByIds(sheet, new Set(["n1"]));
    const a1 = sheet.annotations.find((a) => a.id === "a1")!;
    expect(a1.noteIds).toEqual(["n2"]);
    expect(a1.placement.anchorNoteId).toBe("n2");
    expect(a1.placement.dx).toBe(1); // offsets preserved
  });

  it("prunes annotations that lose all members", () => {
    const sheet = makeSheet();
    removeNotesByIds(sheet, new Set(["n3"]));
    expect(sheet.annotations.map((a) => a.id)).toEqual(["a1"]);
  });

  it("is a no-op for an empty id set", () => {
    const sheet = makeSheet();
    expect(removeNotesByIds(sheet, new Set())).toBe(0);
    expect(sheet.parts[0].notes).toHaveLength(3);
  });
});
