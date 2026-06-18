import { describe, expect, it } from "vitest";
import { computeMove, computeResizeLeft, computeResizeRight, type DragMetrics, type DragOrigin } from "./drag";

const metrics: DragMetrics = { cellW: 20, cellH: 20, sheetSteps: 16, partLo: 60, partHi: 72 };

const origin = (over: Partial<DragOrigin> = {}): DragOrigin => ({
  id: "n",
  start: 4,
  subOffset: 0,
  length: 2,
  subLength: 0,
  pitch: 64,
  ...over,
});

describe("computeMove", () => {
  it("snaps to whole steps without the modifier", () => {
    // dx of 1.5 cells -> rounds to 2 steps; dy of one cell -> down one pitch
    const out = computeMove([origin()], 30, 20, metrics, false);
    expect(out.get("n")).toMatchObject({ start: 6, subOffset: 0, pitch: 63 });
  });
  it("allows sub-step movement with the modifier", () => {
    // dx of one sub-step (cellW/4 = 5px)
    const out = computeMove([origin()], 5, 0, metrics, true);
    expect(out.get("n")).toMatchObject({ start: 4, subOffset: 1 });
  });
  it("clamps the group at the sheet start", () => {
    const out = computeMove([origin({ start: 1 })], -1000, 0, metrics, false);
    expect(out.get("n")).toMatchObject({ start: 0, subOffset: 0 });
  });
  it("clamps pitch to the part range", () => {
    const out = computeMove([origin({ pitch: 71 })], 0, -1000, metrics, false);
    expect(out.get("n")!.pitch).toBe(72); // partHi
  });
});

describe("computeResizeRight", () => {
  it("grows the length in whole steps", () => {
    const out = computeResizeRight([origin({ length: 2 })], 40, metrics, false);
    expect(out.get("n")).toMatchObject({ length: 4, subLength: 0 });
  });
  it("never shrinks below one step", () => {
    const out = computeResizeRight([origin({ length: 2 })], -1000, metrics, false);
    expect(out.get("n")).toMatchObject({ length: 1, subLength: 0 });
  });
});

describe("computeResizeLeft", () => {
  it("moves the start and shrinks the length", () => {
    const out = computeResizeLeft([origin({ start: 4, length: 3 })], 20, metrics, false);
    expect(out.get("n")).toMatchObject({ start: 5, length: 2 });
  });
});
