import { memo, useState } from "react";
import type { Sheet } from "../core/model/types";
import { STEPS_PER_BAR } from "../core/model/constants";
import { Band, BAND_SIDE_W } from "./Band";
import { Ruler } from "./Ruler";
import type { GridProps, NoteRegion } from "./grid/Grid";
import type { Note } from "../core/model/types";
import type { CellSelection, SheetSelection } from "../state/types";

function PartGap({ onInsert }: { onInsert: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ height: 4, display: "flex", alignItems: "center" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        style={{
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          border: "1px dashed var(--sheet-border)",
          background: "var(--sheet-bg)",
          color: "var(--ink-soft)",
          borderRadius: 4,
          fontSize: 11,
          cursor: "pointer",
          padding: "1px 8px",
          lineHeight: 1,
        }}
        onClick={onInsert}
        title="Insert part here"
      >
        + Part
      </button>
    </div>
  );
}

export interface SheetViewProps {
  sheet: Sheet;
  cellW: number;
  cellH: number;
  /** Selection per part is derived from this; omit for a read-only render. */
  selection?: SheetSelection;
  showLabels?: boolean;
  annotationsVisible?: boolean;
  playheadStep?: number | null;
  getPlayheadStep?: () => number | null;
  readOnly?: boolean;
  /** Cursor step shown on the ruler when stopped/paused. Editor-only. */
  cursorStep?: number;
  /** When provided, a ruler is rendered above the grid. Editor-only. */
  onSeek?: (step: number) => void;
  onAddBar?: () => void;
  onRemoveBar?: () => void;
  onNotePointerDown?: (note: Note, ev: React.PointerEvent, region: NoteRegion) => void;
  onNoteContextMenu?: (note: Note, ev: React.MouseEvent) => void;
  onGridPointerDown?: GridProps["onGridPointerDown"];
  onPartClick?: (partId: string) => void;
  /** Editor-only: start recording for the given part. */
  onPartRecord?: (partId: string) => void;
  /** The part currently being recorded, for visual indication. */
  recordingPartId?: string | null;
  onToggleMute?: (partId: string) => void;
  onToggleSolo?: (partId: string) => void;
  onPartDelete?: (partId: string) => void;
  /** Editor-only: rename a part inline. */
  onPartNameChange?: (partId: string, name: string) => void;
  /** Editor-only: insert a new part before the given index. */
  onInsertPart?: (atIndex: number) => void;
  onAnnotationEdit?: (id: string) => void;
  onAnnotationMove?: (id: string, dx: number, dy: number) => void;
  onAnnotationDelete?: (id: string) => void;
}

/** Stack of part lanes for one sheet. Shared by the editor and the viewer. */
function SheetViewImpl({
  sheet,
  cellW,
  cellH,
  selection,
  showLabels,
  annotationsVisible = true,
  playheadStep = null,
  getPlayheadStep,
  readOnly = false,
  cursorStep,
  onSeek,
  onAddBar,
  onRemoveBar,
  onNotePointerDown,
  onNoteContextMenu,
  onGridPointerDown,
  onPartClick,
  onPartRecord,
  recordingPartId,
  onToggleMute,
  onToggleSolo,
  onPartDelete,
  onPartNameChange,
  onInsertPart,
  onAnnotationEdit,
  onAnnotationMove,
  onAnnotationDelete,
}: SheetViewProps) {
  const sheetSteps = sheet.barCount * STEPS_PER_BAR;
  const cell: CellSelection | null = selection?.cell ?? null;
  // Annotations bind to one part (single-part invariant), so group them by the
  // part their anchor note lives in.
  const partIdOfNote = new Map<string, string>();
  for (const p of sheet.parts) for (const n of p.notes) partIdOfNote.set(n.id, p.id);
  const annotationsByPart = new Map<string, typeof sheet.annotations>();
  for (const a of sheet.annotations) {
    const partId = partIdOfNote.get(a.placement.anchorNoteId);
    if (!partId) continue;
    const list = annotationsByPart.get(partId) ?? [];
    list.push(a);
    annotationsByPart.set(partId, list);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: "max-content" }}>
      {onSeek && (
        <Ruler
          barCount={sheet.barCount}
          cellW={cellW}
          sidebarWidth={BAND_SIDE_W}
          cursorStep={cursorStep}
          getPlayheadStep={getPlayheadStep}
          onSeek={onSeek}
          onAddBar={onAddBar}
          onRemoveBar={onRemoveBar}
        />
      )}
      {onInsertPart && <PartGap key="gap-pre" onInsert={() => onInsertPart(0)} />}
      {sheet.parts.flatMap((part, idx) => {
        const band = (
          <Band
            key={part.id}
            sheet={sheet}
            part={part}
            sheetSteps={sheetSteps}
            cellW={cellW}
            cellH={cellH}
            selectedNoteIds={selection?.noteIds}
            selectedCell={cell}
            showLabels={showLabels}
            playheadStep={playheadStep}
            getPlayheadStep={getPlayheadStep}
            annotations={annotationsByPart.get(part.id)}
            annotationsVisible={annotationsVisible}
            readOnly={readOnly}
            onNotePointerDown={onNotePointerDown}
            onNoteContextMenu={onNoteContextMenu}
            onGridPointerDown={onGridPointerDown}
            onPartClick={onPartClick}
            onPartRecord={onPartRecord}
            isRecording={recordingPartId === part.id}
            onToggleMute={onToggleMute}
            onToggleSolo={onToggleSolo}
            onPartDelete={onPartDelete}
            onPartNameChange={onPartNameChange}
            onAnnotationEdit={onAnnotationEdit}
            onAnnotationMove={onAnnotationMove}
            onAnnotationDelete={onAnnotationDelete}
          />
        );
        if (!onInsertPart) return [band];
        const gap = (
          <PartGap key={`gap-${idx}`} onInsert={() => onInsertPart(idx + 1)} />
        );
        return [band, gap];
      })}
    </div>
  );
}

export const SheetView = memo(SheetViewImpl);
