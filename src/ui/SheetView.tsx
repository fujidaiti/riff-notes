import { memo } from "react";
import type { Sheet } from "../core/model/types";
import { STEPS_PER_BAR } from "../core/model/constants";
import { Band } from "./Band";
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
  playheadStep?: number | null;
  readOnly?: boolean;
  onNotePointerDown?: (note: Note, ev: React.PointerEvent, region: NoteRegion) => void;
  onNoteContextMenu?: (note: Note, ev: React.MouseEvent) => void;
  onGridPointerDown?: GridProps["onGridPointerDown"];
}

/** Stack of part lanes for one sheet. Shared by the editor and the viewer. */
function SheetViewImpl({
  sheet,
  cellW,
  cellH,
  selection,
  showLabels,
  playheadStep = null,
  readOnly = false,
  onNotePointerDown,
  onNoteContextMenu,
  onGridPointerDown,
}: SheetViewProps) {
  const sheetSteps = sheet.barCount * STEPS_PER_BAR;
  const cell: CellSelection | null = selection?.cell ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
          readOnly={readOnly}
          onNotePointerDown={onNotePointerDown}
          onNoteContextMenu={onNoteContextMenu}
          onGridPointerDown={onGridPointerDown}
        />
      ))}
    </div>
  );
}

export const SheetView = memo(SheetViewImpl);
