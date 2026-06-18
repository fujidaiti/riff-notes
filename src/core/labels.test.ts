import { describe, expect, it } from "vitest";
import { computeLabelPlacements } from "./labels";
import type { Note, Part } from "./model/types";

const note = (id: string, start: number, pitch: number): Note => ({
  id,
  partId: "p",
  pitch,
  start,
  length: 1,
  vel: 2,
  subOffset: 0,
  subLength: 0,
});

const part = (notes: Note[]): Part => ({ id: "p", name: "P", lo: 60, hi: 72, instrument: "epiano", notes });

describe("computeLabelPlacements", () => {
  it("labels a lone note with its pitch class name", () => {
    const out = computeLabelPlacements(part([note("n", 0, 60)]), 16, 22, 22);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ noteId: "n", text: "C" });
  });

  it("suppresses dense same-pitch notes within 6 steps (proximity rule)", () => {
    // Cs at steps 0,2,4 — all within 6 of the previous; only the first labels.
    const notes = [note("a", 0, 60), note("b", 2, 60), note("c", 4, 60)];
    const out = computeLabelPlacements(part(notes), 64, 22, 22);
    expect(out.map((l) => l.noteId)).toEqual(["a"]);
  });

  it("re-anchors a recurring pattern about once per bar", () => {
    // Cs every 2 steps across two+ bars: proximity suppresses, but the bar-width
    // rule re-labels once the gap from the last *labeled* C exceeds a bar.
    const notes: Note[] = [];
    for (let s = 0; s <= 34; s += 2) notes.push(note(`n${s}`, s, 60));
    const out = computeLabelPlacements(part(notes), 48, 22, 22);
    expect(out.length).toBeGreaterThan(1);
    // first label is the very first C
    expect(out[0].noteId).toBe("n0");
  });

  it("ignores notes outside the part range", () => {
    const out = computeLabelPlacements(part([note("lo", 0, 40), note("ok", 0, 64)]), 16, 22, 22);
    expect(out.map((l) => l.noteId)).toEqual(["ok"]);
  });
});
