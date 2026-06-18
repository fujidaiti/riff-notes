import { useRef } from "react";
import type { Annotation, Part } from "../core/model/types";
import { noteFracLength, noteFracStart } from "../core/timing";
import { noteWidthPx } from "../core/timing";
import styles from "./Annotations.module.css";

export interface AnnotationsProps {
  part: Part;
  annotations: Annotation[];
  cellW: number;
  cellH: number;
  readOnly?: boolean;
  onEdit?: (id: string) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Annotation overlay for one part: dashed polylines connecting member notes and
 * a text card anchored at (anchor note top-left + placement offset). Shared by
 * editor and viewer; when readOnly it renders without drag/edit handlers. All
 * geometry is analytic in the part's grid-wrap coordinate space (notes of an
 * annotation always belong to one part, by the single-part invariant).
 */
export function Annotations({ part, annotations, cellW, cellH, readOnly = false, onEdit, onMove }: AnnotationsProps) {
  const noteById = new Map(part.notes.map((n) => [n.id, n]));
  const centerOf = (id: string): Pt | null => {
    const n = noteById.get(id);
    if (!n) return null;
    return { x: noteFracStart(n) * cellW + noteWidthPx(noteFracLength(n), cellW) / 2, y: (part.hi - n.pitch) * cellH + cellH / 2 };
  };

  return (
    <div className={styles.overlay}>
      <svg className={styles.svg}>
        {annotations.map((a) => {
          const pts = a.noteIds.map(centerOf).filter((p): p is Pt => p !== null).sort((p, q) => p.x - q.x || p.y - q.y);
          if (pts.length < 2) return null;
          return <polyline key={a.id} className={styles.line} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />;
        })}
      </svg>
      {annotations.map((a) => {
        const anchor = noteById.get(a.placement.anchorNoteId);
        if (!anchor) return null;
        const x = noteFracStart(anchor) * cellW + a.placement.dx;
        const y = (part.hi - anchor.pitch) * cellH + a.placement.dy;
        return (
          <AnnotationCard
            key={a.id}
            annotation={a}
            x={x}
            y={y}
            readOnly={readOnly}
            onEdit={onEdit}
            onMove={onMove}
          />
        );
      })}
    </div>
  );
}

function AnnotationCard({
  annotation: a,
  x,
  y,
  readOnly,
  onEdit,
  onMove,
}: {
  annotation: Annotation;
  x: number;
  y: number;
  readOnly: boolean;
  onEdit?: (id: string) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
}) {
  const dragState = useRef<{ startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean } | null>(null);

  const onPointerDown = (ev: React.PointerEvent) => {
    if (readOnly || !onMove) return;
    ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    dragState.current = { startX: ev.clientX, startY: ev.clientY, baseDx: a.placement.dx, baseDy: a.placement.dy, moved: false };
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const ddx = ev.clientX - d.startX;
    const ddy = ev.clientY - d.startY;
    if (!d.moved && Math.abs(ddx) < 3 && Math.abs(ddy) < 3) return;
    d.moved = true;
    onMove?.(a.id, d.baseDx + ddx, d.baseDy + ddy);
  };
  const onPointerUp = (ev: React.PointerEvent) => {
    const d = dragState.current;
    dragState.current = null;
    if (d && !d.moved && onEdit) onEdit(a.id);
    (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
  };

  return (
    <div
      className={`${styles.card} ${readOnly ? "" : styles.editable}`}
      style={{ left: x, top: y }}
      onPointerDown={readOnly ? undefined : onPointerDown}
      onPointerMove={readOnly ? undefined : onPointerMove}
      onPointerUp={readOnly ? undefined : onPointerUp}
      title={readOnly ? a.text : "Drag to move · click to edit"}
    >
      {a.text}
    </div>
  );
}
