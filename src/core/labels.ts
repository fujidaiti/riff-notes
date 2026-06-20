import type { Part } from "./model/types";
import { PITCH_NAMES, STEPS_PER_BAR } from "./model/constants";
import { type GridLayout, gridTotalWidth, noteWidthPx, stepToX } from "./grid-layout";
import { noteFracLength, noteFracStart } from "./timing";

export const LABEL_W = 14;
export const LABEL_H = 12;

export interface LabelPlacement {
  noteId: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  noteId: string;
  pitch: number;
  start: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute collision-avoided pitch-label placements for a pitched part. Pure
 * geometry — no DOM. The two suppression rules (mirrored from the legacy
 * renderer):
 *   1. Proximity: suppress a label if the previous same-pitch note (labeled or
 *      not) is within 6 steps. Tracking the previous *note* (not the previous
 *      labeled note) is what thins out dense rows.
 *   2. Bar-width re-anchor: override rule 1 when the last *labeled* same-pitch
 *      note is more than one bar away, so a recurring "C_C_C..." pattern gets
 *      re-labeled about once per bar.
 * Suppressed notes still participate in collision avoidance so rendered labels
 * never overlap an unlabeled note.
 */
export function computeLabelPlacements(part: Part, sheetSteps: number, layout: GridLayout, cellH: number): LabelPlacement[] {
  const wrapW = gridTotalWidth(sheetSteps, layout);
  const wrapH = (part.hi - part.lo + 1) * cellH;

  const boxes: Box[] = part.notes
    .filter((n) => n.pitch >= part.lo && n.pitch <= part.hi)
    .map((n) => ({
      noteId: n.id,
      pitch: n.pitch,
      start: n.start,
      x: stepToX(noteFracStart(n), layout),
      y: (part.hi - n.pitch) * cellH,
      w: noteWidthPx(noteFracStart(n), noteFracLength(n), layout),
      h: cellH,
    }));
  boxes.sort((a, b) => a.x - b.x || b.pitch - a.pitch);

  const lastStart = new Map<number, number>();
  const lastLabeledStart = new Map<number, number>();
  const out: LabelPlacement[] = [];

  for (const r of boxes) {
    const prevStart = lastStart.get(r.pitch);
    const prevLabeled = lastLabeledStart.get(r.pitch);
    const proximitySuppress = prevStart !== undefined && r.start - prevStart <= 6;
    const reAnchor = prevLabeled === undefined || r.start - prevLabeled >= STEPS_PER_BAR + 1;
    lastStart.set(r.pitch, r.start);
    if (proximitySuppress && !reAnchor) continue;
    lastLabeledStart.set(r.pitch, r.start);

    const cxMid = r.x + r.w / 2;
    const cyMid = r.y + r.h / 2;
    const left = r.x - LABEL_W / 2;
    const right = r.x + r.w + LABEL_W / 2;
    const top = r.y - LABEL_H / 2;
    const bot = r.y + r.h + LABEL_H / 2;
    const candidates = [
      { cx: right, cy: top },
      { cx: cxMid, cy: top },
      { cx: right, cy: cyMid },
      { cx: right, cy: bot },
      { cx: cxMid, cy: bot },
      { cx: left, cy: bot },
      { cx: left, cy: cyMid },
      { cx: left, cy: top },
      { cx: cxMid, cy: cyMid }, // center fallback
    ];

    let chosen = candidates[candidates.length - 1];
    for (const c of candidates) {
      const lx = c.cx - LABEL_W / 2;
      const ly = c.cy - LABEL_H / 2;
      if (lx < 0 || ly < 0 || lx + LABEL_W > wrapW || ly + LABEL_H > wrapH) continue;
      let hit = false;
      for (const o of boxes) {
        if (o === r) continue;
        if (lx < o.x + o.w && lx + LABEL_W > o.x && ly < o.y + o.h && ly + LABEL_H > o.y) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        chosen = c;
        break;
      }
    }

    out.push({
      noteId: r.noteId,
      text: PITCH_NAMES[((r.pitch % 12) + 12) % 12],
      x: chosen.cx - LABEL_W / 2,
      y: chosen.cy - LABEL_H / 2,
      w: LABEL_W,
      h: LABEL_H,
    });
  }

  return out;
}
