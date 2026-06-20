import { STEPS_PER_BAR } from "./model/constants";

export interface GridLayout {
  cellW: number;
  barSepW: number;
  beatSepW: number;
  stepSepW: number;
}

export const DEFAULT_SEP_WIDTHS = {
  barSepW: 7,
  beatSepW: 5,
  stepSepW: 1,
} as const;

/** Create a GridLayout with the default physical separator widths. */
export function makeLayout(cellW: number): GridLayout {
  return { cellW, ...DEFAULT_SEP_WIDTHS };
}

/** Create a GridLayout with zero-width separators (identical to the legacy step*cellW system). */
export function layoutFromCellW(cellW: number): GridLayout {
  return { cellW, barSepW: 0, beatSepW: 0, stepSepW: 0 };
}

/**
 * Convert a fractional step position to a pixel X coordinate.
 *
 * The grid starts with a bar separator, so stepToX(0) === barSepW.
 * Every bar boundary introduces another barSepW; beat boundaries add beatSepW;
 * step boundaries add stepSepW.
 *
 * O(1).
 */
export function stepToX(t: number, layout: GridLayout): number {
  const s = Math.floor(t);
  const frac = t - s;
  const nBars = Math.floor(s / STEPS_PER_BAR);
  const nBeats = Math.floor(s / 4) - nBars;
  const nSteps = s - Math.floor(s / 4);
  return (
    layout.barSepW +
    s * layout.cellW +
    nBars * layout.barSepW +
    nBeats * layout.beatSepW +
    nSteps * layout.stepSepW +
    frac * layout.cellW
  );
}

/**
 * Convert a pixel X coordinate back to a fractional step position.
 * Binary search over [0, totalSteps]; O(log totalSteps) iterations.
 */
export function xToStep(
  x: number,
  layout: GridLayout,
  totalSteps: number,
): number {
  if (x <= stepToX(0, layout)) return 0;
  if (x >= stepToX(totalSteps, layout)) return totalSteps;
  let lo = 0;
  let hi = totalSteps;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (stepToX(mid, layout) < x) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

/**
 * Return the integer step index of the cell that contains pixel X.
 * Equivalent to Math.floor(xToStep(…)) but avoids float precision issues
 * right at cell boundaries.
 */
export function xToStepFloor(
  x: number,
  layout: GridLayout,
  totalSteps: number,
): number {
  let lo = 0;
  let hi = totalSteps;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (stepToX(mid, layout) <= x) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(totalSteps - 1, lo));
}

/**
 * Total pixel width of a grid with the given number of steps.
 * Equals stepToX(totalSteps) — includes the trailing bar separator.
 */
export function gridTotalWidth(totalSteps: number, layout: GridLayout): number {
  return stepToX(totalSteps, layout);
}

/** Width of one bar: from the start of bar i's first cell to the start of bar i+1's first cell. */
export function barWidth(layout: GridLayout): number {
  return stepToX(STEPS_PER_BAR, layout) - stepToX(0, layout);
}

/** Width of the separator that sits immediately before step boundary `s`. */
export function sepWidthBefore(s: number, layout: GridLayout): number {
  if (s % STEPS_PER_BAR === 0) return layout.barSepW;
  if (s % 4 === 0) return layout.beatSepW;
  return layout.stepSepW;
}

/**
 * Pixel width of a note starting at `fracStart` steps with length `fracLen` steps.
 *
 * When the note ends exactly on a step boundary (integer fracEnd), stepToX(fracEnd)
 * lands at the left edge of the following separator — so we subtract that separator's
 * width so the note ends flush against it rather than overlapping it. For fractional
 * endpoints (sub-step notes that end mid-cell) no correction is needed.
 */
export function noteWidthPx(fracStart: number, fracLen: number, layout: GridLayout): number {
  const fracEnd = fracStart + fracLen;
  const leftEdge = stepToX(fracStart, layout);
  const rightEdge = stepToX(fracEnd, layout);
  const adj = Number.isInteger(fracEnd) ? sepWidthBefore(fracEnd, layout) : 0;
  return rightEdge - leftEdge - adj;
}
