import { memo } from "react";
import type { Sheet } from "../core/model/types";
import { STEPS_PER_BAR } from "../core/model/constants";
import { Band, BAND_SIDE_W } from "./Band";
import { Ruler } from "./Ruler";
import type { GridProps, NoteRegion } from "./grid/Grid";
import type { Note } from "../core/model/types";
import type { CellSelection, SheetSelection } from "../state/types";

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
  onAnnotationEdit?: (id: string) => void;
  onAnnotationMove?: (id: string, dx: number, dy: number) => void;
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
  onNotePointerDown,
  onNoteContextMenu,
  onGridPointerDown,
  onPartClick,
  onPartRecord,
  recordingPartId,
  onToggleMute,
  onToggleSolo,
  onAnnotationEdit,
  onAnnotationMove,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {onSeek && (
        <Ruler
          barCount={sheet.barCount}
          cellW={cellW}
          sidebarWidth={BAND_SIDE_W}
          cursorStep={cursorStep}
          getPlayheadStep={getPlayheadStep}
          onSeek={onSeek}
        />
      )}
      {sheet.parts.map((part) => (
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
          onAnnotationEdit={onAnnotationEdit}
          onAnnotationMove={onAnnotationMove}
        />
      ))}
    </div>
  );
}

export const SheetView = memo(SheetViewImpl);
