import { type GridLayout, stepToX, xToStep } from "./grid-layout";
import { SUB_PER_STEP } from "./model/constants";
import { subToLength, subToStart } from "./timing";

// Pure drag math at sub-step granularity. All *Sub values are integers in
// 1/SUB_PER_STEP-step units; callers split them back into start/subOffset and
// length/subLength. Mirrors the legacy pointermove handler, minus the DOM.

export interface DragOrigin {
  id: string;
  start: number;
  subOffset: number;
  length: number;
  subLength: number;
  pitch: number;
}

export interface DragMetrics {
  layout: GridLayout;
  cellH: number;
  /** Total steps in the sheet (barCount * STEPS_PER_BAR). */
  sheetSteps: number;
  partLo: number;
  partHi: number;
}

export interface NotePatch {
  start?: number;
  subOffset?: number;
  length?: number;
  subLength?: number;
  pitch?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const absSub = (o: DragOrigin) => o.start * SUB_PER_STEP + o.subOffset;
const lenSub = (o: DragOrigin) => o.length * SUB_PER_STEP + o.subLength;

/**
 * Move a group of notes by a pixel delta. Sub-step granular when `subGranular`
 * (the create-modifier is held); otherwise snaps to whole steps. The whole
 * group is clamped together so no note leaves the sheet or the part range.
 */
export function computeMove(items: DragOrigin[], dx: number, dy: number, m: DragMetrics, subGranular: boolean): Map<string, NotePatch> {
  const refFrac = absSub(items[0]) / SUB_PER_STEP;
  const targetFrac = xToStep(stepToX(refFrac, m.layout) + dx, m.layout, m.sheetSteps);
  let dSub = Math.round((targetFrac - refFrac) * SUB_PER_STEP);
  if (!subGranular) dSub = Math.round(dSub / SUB_PER_STEP) * SUB_PER_STEP;
  const dRows = Math.round(dy / m.cellH);
  const sheetSub = m.sheetSteps * SUB_PER_STEP;

  let minPitch = Infinity;
  let maxPitch = -Infinity;
  let dsLo = -Infinity;
  let dsHi = Infinity;
  for (const o of items) {
    minPitch = Math.min(minPitch, o.pitch);
    maxPitch = Math.max(maxPitch, o.pitch);
    dsLo = Math.max(dsLo, -absSub(o));
    dsHi = Math.min(dsHi, sheetSub - absSub(o) - lenSub(o));
  }
  const ds = clamp(dSub, dsLo, dsHi);
  const dr = clamp(dRows, maxPitch - m.partHi, minPitch - m.partLo);

  const out = new Map<string, NotePatch>();
  for (const o of items) {
    const { start, subOffset } = subToStart(absSub(o) + ds);
    out.set(o.id, { start, subOffset, pitch: o.pitch - dr });
  }
  return out;
}

/** Resize the right edge (length) of a group by a pixel delta. */
export function computeResizeRight(items: DragOrigin[], dx: number, m: DragMetrics, subGranular: boolean): Map<string, NotePatch> {
  const refFrac = (absSub(items[0]) + lenSub(items[0])) / SUB_PER_STEP;
  const targetFrac = xToStep(stepToX(refFrac, m.layout) + dx, m.layout, m.sheetSteps);
  const dSub = Math.round((targetFrac - refFrac) * SUB_PER_STEP);
  const sheetSub = m.sheetSteps * SUB_PER_STEP;

  let minLen = Infinity;
  let dlHi = Infinity;
  for (const o of items) {
    minLen = Math.min(minLen, lenSub(o));
    dlHi = Math.min(dlHi, sheetSub - absSub(o) - lenSub(o));
  }
  let dl = clamp(dSub, 1 - minLen, dlHi);
  if (!subGranular) dl = Math.round(dl / SUB_PER_STEP) * SUB_PER_STEP;

  const out = new Map<string, NotePatch>();
  for (const o of items) {
    let newLen = lenSub(o) + dl;
    if (!subGranular) newLen = Math.max(SUB_PER_STEP, Math.round(newLen / SUB_PER_STEP) * SUB_PER_STEP);
    out.set(o.id, subToLength(newLen));
  }
  return out;
}

/** Resize the left edge (start + length) of a group by a pixel delta. */
export function computeResizeLeft(items: DragOrigin[], dx: number, m: DragMetrics, subGranular: boolean): Map<string, NotePatch> {
  const refFrac = absSub(items[0]) / SUB_PER_STEP;
  const targetFrac = xToStep(stepToX(refFrac, m.layout) + dx, m.layout, m.sheetSteps);
  const dSub = Math.round((targetFrac - refFrac) * SUB_PER_STEP);

  let minLen = Infinity;
  let dsLo = -Infinity;
  for (const o of items) {
    minLen = Math.min(minLen, lenSub(o));
    dsLo = Math.max(dsLo, -absSub(o));
  }
  const dsHi = minLen - 1;
  let ds = clamp(dSub, dsLo, dsHi);
  if (!subGranular) ds = Math.round(ds / SUB_PER_STEP) * SUB_PER_STEP;

  const out = new Map<string, NotePatch>();
  for (const o of items) {
    const { start, subOffset } = subToStart(absSub(o) + ds);
    let newLen = lenSub(o) - ds;
    if (!subGranular) newLen = Math.max(SUB_PER_STEP, Math.round(newLen / SUB_PER_STEP) * SUB_PER_STEP);
    const { length, subLength } = subToLength(newLen);
    out.set(o.id, { start, subOffset, length, subLength });
  }
  return out;
}
