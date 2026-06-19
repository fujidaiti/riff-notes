import { memo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Annotation, Note, Part, Scale } from "../../core/model/types";
import { RHYTHM_KEYS, VEL_OPACITY } from "../../core/model/constants";
import { isRhythmPart } from "../../core/model/factory";
import { inScaleSet, noteScaleClass } from "../../core/theory";
import { noteFracLength, noteFracStart, noteWidthPx } from "../../core/timing";
import { computeLabelPlacements } from "../../core/labels";
import type { CellSelection } from "../../state/types";
import { Annotations } from "../Annotations";
import { PlayheadLine } from "./PlayheadLine";
import styles from "./Grid.module.css";

export type NoteRegion = "body" | "resize-l" | "resize-r";

export interface GridProps {
  part: Part;
  /** barCount * STEPS_PER_BAR. */
  sheetSteps: number;
  scale: Scale;
  cellW: number;
  cellH: number;
  selectedNoteIds?: ReadonlySet<string>;
  selectedCell?: CellSelection | null;
  showLabels?: boolean;
  playheadStep?: number | null;
  /** Live playhead polled via rAF (out-of-band; never re-renders notes). */
  getPlayheadStep?: () => number | null;
  /** Annotations whose anchor note belongs to this part. */
  annotations?: Annotation[];
  annotationsVisible?: boolean;
  /** When false, annotation connector lines are drawn but cards are suppressed (viewer renders them in a separate overlay). */
  renderAnnotationCards?: boolean;
  /** When true (the embed case), no interaction handlers are attached. */
  readOnly?: boolean;
  onNotePointerDown?: (note: Note, ev: ReactPointerEvent, region: NoteRegion) => void;
  onNoteContextMenu?: (note: Note, ev: ReactMouseEvent) => void;
  onGridPointerDown?: (ev: ReactPointerEvent) => void;
  onAnnotationEdit?: (id: string) => void;
  onAnnotationMove?: (id: string, dx: number, dy: number) => void;
  onAnnotationResize?: (id: string, shrunkWidth: number, dx: number) => void;
  onAnnotationDelete?: (id: string) => void;
}

function drumClass(part: Part, pitch: number): string {
  const key = RHYTHM_KEYS[part.hi - pitch];
  if (key === "hihat") return styles.drumHihat;
  if (key === "snare") return styles.drumSnare;
  if (key === "kick") return styles.drumKick;
  return "";
}

function GridImpl({
  part,
  sheetSteps,
  scale,
  cellW,
  cellH,
  selectedNoteIds,
  selectedCell,
  showLabels = true,
  playheadStep = null,
  getPlayheadStep,
  annotations,
  annotationsVisible = true,
  renderAnnotationCards = true,
  readOnly = false,
  onNotePointerDown,
  onNoteContextMenu,
  onGridPointerDown,
  onAnnotationEdit,
  onAnnotationMove,
  onAnnotationResize,
  onAnnotationDelete,
}: GridProps) {
  const [hoveredAnnotId, setHoveredAnnotId] = useState<string | null>(null);

  const numRows = part.hi - part.lo + 1;
  const rhythm = isRhythmPart(part);
  const scaleSet = inScaleSet(scale);

  // Build a map from noteId → annotation ids for hover wiring.
  const noteAnnotIds = new Map<string, string[]>();
  if (annotations) {
    for (const a of annotations) {
      for (const nId of a.noteIds) {
        const arr = noteAnnotIds.get(nId) ?? [];
        arr.push(a.id);
        noteAnnotIds.set(nId, arr);
      }
    }
  }
  // Note ids that belong to the currently hovered annotation.
  const annotHighlightedNoteIds =
    hoveredAnnotId && annotations
      ? new Set(annotations.find((a) => a.id === hoveredAnnotId)?.noteIds ?? [])
      : null;

  const wrapStyle: CSSProperties = {
    width: cellW * sheetSteps,
    height: cellH * numRows,
  };

  const visibleNotes = part.notes.filter((n) => n.pitch >= part.lo && n.pitch <= part.hi);
  const labels = !rhythm && showLabels ? computeLabelPlacements(part, sheetSteps, cellW, cellH) : [];

  const regionAt = (ev: ReactPointerEvent): NoteRegion => {
    if (!ev.metaKey && !ev.ctrlKey) return "body";
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return ev.clientX - rect.left < rect.width / 2 ? "resize-l" : "resize-r";
  };

  return (
    <div
      className={styles.wrap}
      style={wrapStyle}
      data-part-id={part.id}
      data-part-hi={part.hi}
      data-part-lo={part.lo}
      data-instrument={part.instrument}
      onPointerDown={readOnly ? undefined : onGridPointerDown}
    >
      {Array.from({ length: numRows }, (_, i) => (
        <div key={i} className={styles.row} />
      ))}

      {visibleNotes.map((n) => {
        const annotIds = noteAnnotIds.get(n.id);
        const cls = [
          styles.note,
          !readOnly && styles.interactive,
          rhythm && drumClass(part, n.pitch),
          noteScaleClass(scaleSet, part, n.pitch) === "in-scale" && styles.inScale,
          selectedNoteIds?.has(n.id) && styles.selected,
          annotHighlightedNoteIds?.has(n.id) && styles.annotActive,
        ]
          .filter(Boolean)
          .join(" ");
        const style: CSSProperties = {
          left: noteFracStart(n) * cellW,
          top: (part.hi - n.pitch) * cellH,
          width: noteWidthPx(noteFracLength(n), cellW),
          ["--vel-opacity" as string]: VEL_OPACITY[n.vel],
        };
        return (
          <div
            key={n.id}
            className={cls}
            style={style}
            data-note-id={n.id}
            data-vel={n.vel}
            data-len={noteFracLength(n)}
            data-selected={selectedNoteIds?.has(n.id) ? "1" : undefined}
            onPointerDown={readOnly ? undefined : (ev) => onNotePointerDown?.(n, ev, regionAt(ev))}
            onContextMenu={
              readOnly
                ? undefined
                : (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onNoteContextMenu?.(n, ev);
                  }
            }
            onMouseEnter={annotIds ? () => setHoveredAnnotId(annotIds[0]) : undefined}
            onMouseLeave={annotIds ? () => setHoveredAnnotId(null) : undefined}
          />
        );
      })}

      {labels.map((l) => (
        <span
          key={l.noteId}
          className={styles.label}
          data-note-id={l.noteId}
          style={{ left: l.x, top: l.y, width: l.w, height: l.h }}
        >
          {l.text}
        </span>
      ))}

      {selectedCell &&
        selectedCell.partId === part.id &&
        selectedCell.pitch >= part.lo &&
        selectedCell.pitch <= part.hi &&
        selectedCell.step >= 0 &&
        selectedCell.step < sheetSteps && (
          <div
            className={styles.cellSelected}
            style={{
              left: selectedCell.step * cellW,
              top: (part.hi - selectedCell.pitch) * cellH,
              width: cellW + 1,
              height: cellH - 1,
            }}
          />
        )}

      {playheadStep != null && <div className={styles.playhead} style={{ left: playheadStep * cellW }} />}

      {getPlayheadStep && <PlayheadLine getStep={getPlayheadStep} cellW={cellW} />}

      {annotations && annotations.length > 0 && annotationsVisible && (
        <Annotations
          part={part}
          annotations={annotations}
          cellW={cellW}
          cellH={cellH}
          readOnly={readOnly}
          renderCards={renderAnnotationCards}
          hoveredAnnotationId={hoveredAnnotId}
          onAnnotationHover={setHoveredAnnotId}
          onEdit={onAnnotationEdit}
          onMove={onAnnotationMove}
          onResize={onAnnotationResize}
          onDelete={onAnnotationDelete}
        />
      )}
    </div>
  );
}

export const Grid = memo(GridImpl);
