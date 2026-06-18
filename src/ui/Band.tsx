import { memo } from "react";
import type { Part, Sheet } from "../core/model/types";
import { pitchName } from "../core/theory";
import { isRhythmPart } from "../core/model/factory";
import { Grid, type GridProps } from "./grid/Grid";
import styles from "./Band.module.css";

type BandGridProps = Omit<GridProps, "part" | "sheetSteps" | "scale" | "cellW" | "cellH">;

export interface BandProps extends BandGridProps {
  sheet: Sheet;
  part: Part;
  sheetSteps: number;
  cellW: number;
  cellH: number;
}

function partRange(part: Part): string {
  if (isRhythmPart(part)) return "Drums";
  return `${pitchName(part.lo)}–${pitchName(part.hi)}`;
}

function BandImpl({ sheet, part, sheetSteps, cellW, cellH, ...gridProps }: BandProps) {
  return (
    <div className={styles.band}>
      <div className={styles.side}>
        <span className={styles.name}>{part.name}</span>
        <span className={styles.meta}>{partRange(part)}</span>
      </div>
      <div className={styles.scroll}>
        <Grid part={part} sheetSteps={sheetSteps} scale={sheet.scale} cellW={cellW} cellH={cellH} {...gridProps} />
      </div>
    </div>
  );
}

export const Band = memo(BandImpl);
