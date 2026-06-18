import { describe, expect, it } from "vitest";
import { HISTORY_CAP, emptyHistory, record, redo, undo } from "./history";
import type { Project } from "../core/model/types";
import { makeSheet } from "../core/model/factory";

const projectNamed = (name: string): Project => ({ name, sheets: [makeSheet("S")] });

describe("history record/undo/redo", () => {
  it("records the present and clears the redo stack", () => {
    let h = emptyHistory();
    h = record(h, projectNamed("a"));
    h = { ...h, future: [{ version: 1, name: "stale", sheets: [] }] };
    h = record(h, projectNamed("b"));
    expect(h.past).toHaveLength(2);
    expect(h.future).toHaveLength(0);
  });

  it("undo returns the last snapshot and pushes present onto future", () => {
    let h = emptyHistory();
    h = record(h, projectNamed("v1")); // past: [v1]
    const t = undo(h, projectNamed("v2"))!;
    expect(t).not.toBeNull();
    expect(t.snapshot.name).toBe("v1");
    expect(t.history.past).toHaveLength(0);
    expect(t.history.future[0].name).toBe("v2");
  });

  it("redo replays a previously undone snapshot", () => {
    let h = emptyHistory();
    h = record(h, projectNamed("v1"));
    const afterUndo = undo(h, projectNamed("v2"))!;
    const afterRedo = redo(afterUndo.history, projectNamed("v1"))!;
    expect(afterRedo.snapshot.name).toBe("v2");
    expect(afterRedo.history.past).toHaveLength(1);
  });

  it("returns null when there is nothing to undo/redo", () => {
    const h = emptyHistory();
    expect(undo(h, projectNamed("x"))).toBeNull();
    expect(redo(h, projectNamed("x"))).toBeNull();
  });

  it("caps the past at HISTORY_CAP, dropping the oldest", () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_CAP + 5; i++) h = record(h, projectNamed(`v${i}`));
    expect(h.past).toHaveLength(HISTORY_CAP);
    expect(h.past[0].name).toBe("v5"); // first five evicted
  });
});
