import { describe, expect, it } from "vitest";
import {
  gridTotalWidth,
  layoutFromCellW,
  makeLayout,
  noteWidthPx,
  stepToX,
  xToStep,
  xToStepFloor,
} from "./grid-layout";

const L = makeLayout(30); // { cellW:30, barSepW:7, beatSepW:5, stepSepW:1 }

describe("stepToX", () => {
  it("step 0 is barSepW (leading bar separator)", () => {
    expect(stepToX(0, L)).toBe(7);
  });

  it("step 1: barSep + cell + stepSep", () => {
    // 7 + 30 + 1 = 38
    expect(stepToX(1, L)).toBe(38);
  });

  it("step 4: crosses first beat separator", () => {
    // 7 + 4*30 + 3*stepSep + 1*beatSep = 7+120+3+5 = 135
    expect(stepToX(4, L)).toBe(135);
  });

  it("step 8: crosses two beat separators", () => {
    // 7 + 8*30 + 6*1 + 2*5 = 7+240+6+10 = 263
    expect(stepToX(8, L)).toBe(263);
  });

  it("step 12: crosses three beat separators", () => {
    // 7 + 12*30 + 9*1 + 3*5 = 7+360+9+15 = 391
    expect(stepToX(12, L)).toBe(391);
  });

  it("step 16: one full bar (7 + 16*30 + 1*7 + 3*5 + 12*1 = 521)", () => {
    expect(stepToX(16, L)).toBe(521);
  });

  it("step 32: two full bars", () => {
    // stepToX(32) = 7 + 32*30 + 2*7 + 6*5 + 24*1 = 7+960+14+30+24 = 1035
    expect(stepToX(32, L)).toBe(1035);
  });

  it("fractional step stays within its cell (no separator crossed)", () => {
    expect(stepToX(0.5, L)).toBe(7 + 0.5 * 30); // 22
    expect(stepToX(4.25, L)).toBe(135 + 0.25 * 30); // 142.5
  });

  it("zero-width layout matches legacy step*cellW", () => {
    const zeroL = layoutFromCellW(22);
    for (let s = 0; s <= 32; s++) {
      expect(stepToX(s, zeroL)).toBe(s * 22);
    }
  });
});

describe("gridTotalWidth", () => {
  it("1 bar = 521px with cellW=30", () => {
    expect(gridTotalWidth(16, L)).toBe(521);
  });
  it("equals stepToX(totalSteps)", () => {
    expect(gridTotalWidth(32, L)).toBe(stepToX(32, L));
  });
});

describe("xToStepFloor", () => {
  it("x at exactly stepToX(s) returns s", () => {
    for (let s = 0; s < 16; s++) {
      expect(xToStepFloor(stepToX(s, L), L, 16)).toBe(s);
    }
  });

  it("x within a cell returns that cell's step", () => {
    // cell 0: [7, 37), cell 1: [38, 68)
    expect(xToStepFloor(8, L, 32)).toBe(0);
    expect(xToStepFloor(20, L, 32)).toBe(0);
    expect(xToStepFloor(37, L, 32)).toBe(0);
    expect(xToStepFloor(39, L, 32)).toBe(1);
    expect(xToStepFloor(50, L, 32)).toBe(1);
  });

  it("x inside a separator is attributed to the preceding cell", () => {
    // step sep between steps 0 and 1 is at x=[37,38)
    expect(xToStepFloor(37, L, 32)).toBe(0);
    // beat sep between steps 3 and 4 is at x=[stepToX(4)-beatSepW, stepToX(4)) = [130,135)
    expect(xToStepFloor(131, L, 32)).toBe(3);
    expect(xToStepFloor(134, L, 32)).toBe(3);
  });

  it("x past the grid end clamps to totalSteps-1", () => {
    expect(xToStepFloor(10000, L, 16)).toBe(15);
  });

  it("x before the grid start clamps to 0", () => {
    expect(xToStepFloor(0, L, 16)).toBe(0);
    expect(xToStepFloor(-1, L, 16)).toBe(0);
  });

  it("round-trip: xToStepFloor(stepToX(s)) === s for all integer s in [0, 63]", () => {
    for (let s = 0; s < 64; s++) {
      expect(xToStepFloor(stepToX(s, L), L, 64)).toBe(s);
    }
  });
});

describe("xToStep (fractional)", () => {
  it("round-trip: xToStep(stepToX(t)) ≈ t", () => {
    const samples = [0, 0.5, 1, 3.75, 4, 4.25, 15.99, 16, 31.5];
    for (const t of samples) {
      expect(xToStep(stepToX(t, L), L, 64)).toBeCloseTo(t, 4);
    }
  });

  it("clamps to [0, totalSteps]", () => {
    expect(xToStep(-999, L, 16)).toBeCloseTo(0, 4);
    expect(xToStep(99999, L, 16)).toBe(16);
  });
});

describe("noteWidthPx", () => {
  // All examples use cellW=22, barSepW=8, beatSepW=4, stepSepW=1.
  const L22 = makeLayout(22);

  it("length=1 is exactly cellW (single cell, no separators spanned)", () => {
    expect(noteWidthPx(0, 1, L22)).toBe(22);
    expect(noteWidthPx(3, 1, L22)).toBe(22);
  });

  it("length=2 crossing a step separator adds 1px", () => {
    // User example: 22*2 + 1 = 45
    expect(noteWidthPx(0, 2, L22)).toBe(45);
  });

  it("length=4 spanning a full beat crosses 3 step seps (no beat sep included)", () => {
    // Ends at beat boundary — beat sep is excluded (note ends before it)
    // Internal seps: 3 step seps
    expect(noteWidthPx(0, 4, L22)).toBe(22 * 4 + 3 * 1); // 91
  });

  it("length=3 crossing a bar sep and a step sep adds 8px", () => {
    // step 14→17, crosses step15(1px) and bar16(7px), ends before step sep at 17
    // Internal seps: stepSep at 15, barSep at 16 = 1+7 = 8; final stepSep at 17 excluded
    expect(noteWidthPx(14, 3, L22)).toBe(22 * 3 + 7 + 1); // 74
  });

  it("length=16 (full bar) includes all internal seps but not the trailing bar sep", () => {
    // Internal: 12 step seps + 3 beat seps = 12+15 = 27; trailing bar sep excluded
    expect(noteWidthPx(0, 16, L22)).toBe(22 * 16 + 12 * 1 + 3 * 5); // 379
  });

  it("sub-step note ending within a cell has no separator in its width", () => {
    // length=0.5: ends at step 0.5, entirely within cell 0 — just half a cell
    expect(noteWidthPx(0, 0.5, L22)).toBe(11);
    expect(noteWidthPx(0, 0.75, L22)).toBe(16.5);
  });

  it("fractional note that crosses a step boundary includes that separator", () => {
    // length=1.5: crosses step sep at step 1 (1px), ends mid-cell-1
    // width = cellW + stepSepW + 0.5*cellW = 22 + 1 + 11 = 34
    expect(noteWidthPx(0, 1.5, L22)).toBe(34);
    // length=1.25: crosses step sep at step 1, ends at 0.25 into cell 1
    expect(noteWidthPx(0, 1.25, L22)).toBe(28.5);
  });

  it("zero-width separators behave like the legacy fracLen*cellW formula", () => {
    const zeroL = layoutFromCellW(22);
    expect(noteWidthPx(0, 1, zeroL)).toBe(22);
    expect(noteWidthPx(0, 4, zeroL)).toBe(88);
    expect(noteWidthPx(14, 3, zeroL)).toBe(66);
  });
});

describe("makeLayout / layoutFromCellW", () => {
  it("makeLayout uses default sep widths", () => {
    const l = makeLayout(22);
    expect(l).toEqual({ cellW: 22, barSepW: 7, beatSepW: 5, stepSepW: 1 });
  });

  it("layoutFromCellW produces zero-width seps", () => {
    const l = layoutFromCellW(22);
    expect(l).toEqual({ cellW: 22, barSepW: 0, beatSepW: 0, stepSepW: 0 });
  });
});
