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
