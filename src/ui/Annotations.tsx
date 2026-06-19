import React, { useEffect, useRef, useState } from "react";
import type { Annotation, Part } from "../core/model/types";
import { noteFracLength, noteFracStart } from "../core/timing";
import { noteWidthPx } from "../core/timing";
import { ANNOT_MIN_WIDTH, ANNOT_MAX_WIDTH } from "../core/serialize";
import styles from "./Annotations.module.css";

const RESIZE_EDGE = 14;

export interface AnnotationsProps {
  part: Part;
  annotations: Annotation[];
  cellW: number;
  cellH: number;
  readOnly?: boolean;
  hoveredAnnotationId?: string | null;
  onAnnotationHover?: (id: string | null) => void;
  onEdit?: (id: string) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
  onResize?: (id: string, shrunkWidth: number, dx: number) => void;
  onDelete?: (id: string) => void;
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
export function Annotations({ part, annotations, cellW, cellH, readOnly = false, hoveredAnnotationId, onAnnotationHover, onEdit, onMove, onResize, onDelete }: AnnotationsProps) {
  const noteById = new Map(part.notes.map((n) => [n.id, n]));
  const centerOf = (id: string): Pt | null => {
    const n = noteById.get(id);
    if (!n) return null;
    return { x: noteFracStart(n) * cellW + noteWidthPx(noteFracLength(n), cellW) / 2, y: (part.hi - n.pitch) * cellH + cellH / 2 };
  };

  return (
    <>
      <div className={styles.overlay}>
        <svg className={styles.svg}>
          {annotations.map((a) => {
            const pts = a.noteIds.map(centerOf).filter((p): p is Pt => p !== null).sort((p, q) => p.x - q.x || p.y - q.y);
            if (pts.length < 2) return null;
            const active = hoveredAnnotationId === a.id;
            return <polyline key={a.id} className={`${styles.line} ${active ? styles.lineActive : ""}`} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />;
          })}
        </svg>
      </div>
      {annotations.map((a) => {
        const anchor = noteById.get(a.placement.anchorNoteId);
        if (!anchor) return null;
        const x = noteFracStart(anchor) * cellW + a.placement.dx;
        const y = (part.hi - anchor.pitch) * cellH + a.placement.dy;
        return (
          <div key={a.id} className={styles.cardWrapper}>
            <AnnotationCard
              annotation={a}
              x={x}
              y={y}
              active={hoveredAnnotationId === a.id}
              readOnly={readOnly}
              onHover={onAnnotationHover}
              onEdit={onEdit}
              onMove={onMove}
              onResize={onResize}
              onDelete={onDelete}
            />
          </div>
        );
      })}
    </>
  );
}

type DragState =
  | { mode: "move"; startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean }
  | { mode: "resize"; startX: number; startW: number; startDx: number; edge: "left" | "right" };

function AnnotationCard({
  annotation: a,
  x,
  y,
  active,
  readOnly,
  onHover,
  onEdit,
  onMove,
  onResize,
  onDelete,
}: {
  annotation: Annotation;
  x: number;
  y: number;
  active: boolean;
  readOnly: boolean;
  onHover?: (id: string | null) => void;
  onEdit?: (id: string) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
  onResize?: (id: string, shrunkWidth: number, dx: number) => void;
  onDelete?: (id: string) => void;
}) {
  const dragState = useRef<DragState | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cmdHeld, setCmdHeld] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Meta" || ev.key === "Control") setCmdHeld(true);
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === "Meta" || ev.key === "Control") setCmdHeld(false);
    };
    const onBlur = () => setCmdHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [readOnly]);

  const isExpanded = isHovered && !cmdHeld && !isResizing && !isDragging;

  const onMouseMove = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (dragState.current || readOnly || !onResize) return;
    if (cmdHeld && !isExpanded) {
      const rect = ev.currentTarget.getBoundingClientRect();
      const nearEdge = ev.clientX - rect.left <= RESIZE_EDGE || rect.right - ev.clientX <= RESIZE_EDGE;
      ev.currentTarget.style.cursor = nearEdge ? "ew-resize" : "";
    } else {
      ev.currentTarget.style.cursor = "";
    }
  };

  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    ev.stopPropagation();
    const rect = ev.currentTarget.getBoundingClientRect();
    const relLeft = ev.clientX - rect.left;
    const relRight = rect.right - ev.clientX;
    const nearEdge = relLeft <= RESIZE_EDGE || relRight <= RESIZE_EDGE;
    if (onResize && cmdHeld && !isExpanded && nearEdge) {
      const edge = relLeft <= RESIZE_EDGE ? "left" : "right";
      ev.currentTarget.setPointerCapture(ev.pointerId);
      dragState.current = { mode: "resize", startX: ev.clientX, startW: a.shrunkWidth, startDx: a.placement.dx, edge };
      setIsResizing(true);
    } else if (onMove) {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      dragState.current = { mode: "move", startX: ev.clientX, startY: ev.clientY, baseDx: a.placement.dx, baseDy: a.placement.dy, moved: false };
    }
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    if (d.mode === "move") {
      const ddx = ev.clientX - d.startX;
      const ddy = ev.clientY - d.startY;
      if (!d.moved && Math.abs(ddx) < 3 && Math.abs(ddy) < 3) return;
      if (!d.moved) setIsDragging(true);
      d.moved = true;
      onMove?.(a.id, d.baseDx + ddx, d.baseDy + ddy);
    } else {
      const delta = ev.clientX - d.startX;
      const rawW = d.edge === "right" ? d.startW + delta : d.startW - delta;
      const newW = Math.max(ANNOT_MIN_WIDTH, Math.min(ANNOT_MAX_WIDTH, rawW));
      const newDx = d.edge === "left" ? d.startDx + (d.startW - newW) : d.startDx;
      onResize?.(a.id, newW, newDx);
    }
  };

  const onPointerUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    dragState.current = null;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
    if (d?.mode === "resize") setIsResizing(false);
    if (d?.mode === "move") {
      setIsDragging(false);
      if (!d.moved && onEdit) onEdit(a.id);
    }
  };

  const title = readOnly ? a.text : onResize ? "Drag to move · click to edit · cmd+drag edge to resize" : "Drag to move · click to edit";

  return (
    <div
      className={`${styles.card} ${readOnly ? "" : styles.editable} ${active ? styles.cardActive : ""} ${isResizing ? styles.resizing : ""} ${isDragging ? styles.dragging : ""} ${cmdHeld ? styles.cmdHeld : ""}`}
      style={{ left: x, top: y, width: a.shrunkWidth, ["--annot-shrunk-width" as string]: `${a.shrunkWidth}px` } as React.CSSProperties}
      onMouseMove={readOnly ? undefined : onMouseMove}
      onPointerDown={readOnly ? undefined : onPointerDown}
      onPointerMove={readOnly ? undefined : onPointerMove}
      onPointerUp={readOnly ? undefined : onPointerUp}
      onMouseEnter={() => { setIsHovered(true); onHover?.(a.id); }}
      onMouseLeave={(ev) => { setIsHovered(false); onHover?.(null); ev.currentTarget.style.cursor = ""; }}
      title={title}
    >
      {a.text}
      {!readOnly && (onEdit || onDelete) && (
        <div className={styles.cardActions} onClick={(ev) => ev.stopPropagation()}>
          {onEdit && (
            <button className={styles.cardBtn} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onEdit(a.id)}>
              Edit
            </button>
          )}
          {onDelete && (
            <button className={`${styles.cardBtn} ${styles.cardDelete}`} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onDelete(a.id)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
