import { describe, expect, it } from "vitest";
import { activeSheet, initialState, reducer } from "./reducer";
import { resetUidCounter } from "../core/model/uid";
import type { AppState } from "./types";

const setup = (): AppState => {
  resetUidCounter();
  return initialState();
};

describe("reducer mutations + history", () => {
  it("SET_SHEET_FIELDS edits the sheet and records history", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    s = reducer(s, { type: "SET_SHEET_FIELDS", sheetId: id, fields: { bpm: 90 } });
    expect(activeSheet(s).bpm).toBe(90);
    expect(s.history.past).toHaveLength(1);
  });

  it("UNDO restores the previous project and REDO re-applies", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    s = reducer(s, { type: "SET_SHEET_FIELDS", sheetId: id, fields: { bpm: 90 } });
    s = reducer(s, { type: "UNDO" });
    expect(activeSheet(s).bpm).toBe(120);
    s = reducer(s, { type: "REDO" });
    expect(activeSheet(s).bpm).toBe(90);
  });

  it("does not mutate the previous state tree (history isolation)", () => {
    const s = setup();
    const id = s.ui.activeSheetId;
    const before = s.project;
    const next = reducer(s, { type: "SET_SHEET_FIELDS", sheetId: id, fields: { bpm: 200 } });
    expect(before.sheets[0].bpm).toBe(120); // original untouched
    expect(next.project).not.toBe(before);
  });

  it("ADD_SHEET and DELETE_SHEET adjust the project and active sheet", () => {
    let s = setup();
    s = reducer(s, { type: "ADD_SHEET" });
    expect(s.project.sheets).toHaveLength(2);
    const newId = s.ui.activeSheetId;
    s = reducer(s, { type: "DELETE_SHEET", sheetId: newId });
    expect(s.project.sheets).toHaveLength(1);
  });

  it("refuses to delete the last sheet", () => {
    const s = setup();
    const id = s.ui.activeSheetId;
    const next = reducer(s, { type: "DELETE_SHEET", sheetId: id });
    expect(next.project.sheets).toHaveLength(1);
  });

  it("MUTATE_SHEET commits an arbitrary change and optional selection", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    s = reducer(s, {
      type: "MUTATE_SHEET",
      sheetId: id,
      mutate: (sheet) => {
        const part = sheet.parts[0];
        part.notes.push({ id: "x", partId: part.id, pitch: 60, start: 0, length: 1, vel: 2, subOffset: 0, subLength: 0 });
      },
      selectNoteIds: new Set(["x"]),
    });
    expect(activeSheet(s).parts[0].notes).toHaveLength(1);
    expect([...s.ui.selection[id].noteIds]).toEqual(["x"]);
    expect(s.history.past).toHaveLength(1);
  });

  it("mixer changes update the project WITHOUT recording history", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    const partId = activeSheet(s).parts[0].id;
    s = reducer(s, { type: "SET_PART_MIX", sheetId: id, partId, patch: { mute: true } });
    expect(activeSheet(s).mix.parts[partId].mute).toBe(true);
    expect(s.history.past).toHaveLength(0);
  });

  it("SET_PART_MIX makes mute and solo mutually exclusive", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    const partId = activeSheet(s).parts[0].id;
    s = reducer(s, { type: "SET_PART_MIX", sheetId: id, partId, patch: { solo: true } });
    s = reducer(s, { type: "SET_PART_MIX", sheetId: id, partId, patch: { mute: true } });
    expect(activeSheet(s).mix.parts[partId]).toMatchObject({ mute: true, solo: false });
  });

  it("ADD_PART / DELETE_PART adjust parts and mix, and record history", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    s = reducer(s, { type: "ADD_PART", sheetId: id, instrument: "drum" });
    expect(activeSheet(s).parts).toHaveLength(2);
    const drumId = activeSheet(s).parts[1].id;
    expect(activeSheet(s).parts[1].instrument).toBe("drum");
    expect(activeSheet(s).mix.parts[drumId]).toBeDefined();
    s = reducer(s, { type: "DELETE_PART", sheetId: id, partId: drumId });
    expect(activeSheet(s).parts).toHaveLength(1);
  });

  it("CYCLE_VELOCITY advances velocity and wraps around", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    s = reducer(s, {
      type: "MUTATE_SHEET",
      sheetId: id,
      mutate: (sheet) => {
        const p = sheet.parts[0];
        p.notes.push({ id: "v", partId: p.id, pitch: 60, start: 0, length: 1, vel: 4, subOffset: 0, subLength: 0 });
      },
    });
    s = reducer(s, { type: "CYCLE_VELOCITY", sheetId: id, noteIds: new Set(["v"]) });
    expect(activeSheet(s).parts[0].notes[0].vel).toBe(0); // 4 -> wraps to 0
  });

  it("SET_SHEET_FIELDS removes notes beyond the new barCount when shrinking", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    // Add two notes: one in bar 1, one in bar 2 (steps 0 and 16 for 4/4 with 4 steps/beat).
    s = reducer(s, {
      type: "MUTATE_SHEET",
      sheetId: id,
      mutate: (sheet) => {
        const p = sheet.parts[0];
        p.notes.push({ id: "n1", partId: p.id, pitch: 60, start: 0, length: 1, vel: 2, subOffset: 0, subLength: 0 });
        p.notes.push({ id: "n2", partId: p.id, pitch: 60, start: 16, length: 1, vel: 2, subOffset: 0, subLength: 0 });
        sheet.barCount = 2;
      },
    });
    expect(activeSheet(s).parts[0].notes).toHaveLength(2);
    // Remove bar 2 — n2 (start=16, bar 2) should be pruned.
    s = reducer(s, { type: "SET_SHEET_FIELDS", sheetId: id, fields: { barCount: 1 } });
    const notes = activeSheet(s).parts[0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("n1");
  });

  it("SET_SHEET_FIELDS does not prune notes when barCount increases", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    s = reducer(s, {
      type: "MUTATE_SHEET",
      sheetId: id,
      mutate: (sheet) => {
        sheet.parts[0].notes.push({ id: "n1", partId: sheet.parts[0].id, pitch: 60, start: 0, length: 1, vel: 2, subOffset: 0, subLength: 0 });
      },
    });
    s = reducer(s, { type: "SET_SHEET_FIELDS", sheetId: id, fields: { barCount: 4 } });
    expect(activeSheet(s).parts[0].notes).toHaveLength(1);
  });

  it("TOGGLE_NOTE enforces the single-part invariant", () => {
    let s = setup();
    const id = s.ui.activeSheetId;
    // add a second part with a note, then notes in both
    s = reducer(s, {
      type: "MUTATE_SHEET",
      sheetId: id,
      mutate: (sheet) => {
        const p0 = sheet.parts[0];
        p0.notes.push({ id: "a", partId: p0.id, pitch: 60, start: 0, length: 1, vel: 2, subOffset: 0, subLength: 0 });
        sheet.parts.push({ id: "p2", name: "P2", lo: 60, hi: 72, instrument: "epiano", notes: [] });
        sheet.parts[1].notes.push({ id: "b", partId: "p2", pitch: 64, start: 0, length: 1, vel: 2, subOffset: 0, subLength: 0 });
      },
    });
    s = reducer(s, { type: "SET_SELECTION", sheetId: id, noteIds: new Set(["a"]) });
    s = reducer(s, { type: "TOGGLE_NOTE", sheetId: id, note: { id: "b", partId: "p2" } });
    expect([...s.ui.selection[id].noteIds]).toEqual(["b"]); // "a" dropped
  });
});
