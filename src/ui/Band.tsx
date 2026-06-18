import { memo } from "react";
import type { Part, Sheet } from "../core/model/types";

/** Width of the part label sidebar — must match the .side CSS width in Band.module.css. */
export const BAND_SIDE_W = 110;
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
  /** Editor-only: open this part's settings. Omitted in the read-only viewer. */
  onPartClick?: (partId: string) => void;
  /** Editor-only: start/stop recording for this part. */
  onPartRecord?: (partId: string) => void;
  /** True when this part is actively being recorded. */
  isRecording?: boolean;
  /** Editor-only: toggle mute for this part. */
  onToggleMute?: (partId: string) => void;
  /** Editor-only: toggle solo for this part. */
  onToggleSolo?: (partId: string) => void;
}

function partRange(part: Part): string {
  if (isRhythmPart(part)) return "Drums";
  return `${pitchName(part.lo)}–${pitchName(part.hi)}`;
}

function BandImpl({ sheet, part, sheetSteps, cellW, cellH, onPartClick, onPartRecord, isRecording, onToggleMute, onToggleSolo, ...gridProps }: BandProps) {
  const mix = sheet.mix.parts[part.id];
  const muted = mix?.mute ?? false;
  const soloed = mix?.solo ?? false;
  return (
    <div className={styles.band}>
      <div
        className={styles.side}
        style={onPartClick ? { cursor: "pointer" } : undefined}
        onClick={onPartClick ? () => onPartClick(part.id) : undefined}
        title={onPartClick ? "Part settings" : undefined}
      >
        <div className={styles.sideTop}>
          <span className={styles.name}>{part.name}</span>
          {onPartRecord && (
            <button
              className={`${styles.recBtn} ${isRecording ? styles.recActive : ""}`}
              title={isRecording ? "Recording…" : "Record into this part"}
              onClick={(ev) => {
                ev.stopPropagation();
                onPartRecord(part.id);
              }}
            >
              ●
            </button>
          )}
        </div>
        <div className={styles.sideMeta}>
          <span className={styles.meta}>{partRange(part)}</span>
          {(onToggleMute || onToggleSolo) && (
            <div className={styles.mixBtns}>
              {onToggleMute && (
                <button
                  className={`${styles.mixBtn} ${muted ? styles.mixActive : ""}`}
                  title={muted ? "Unmute" : "Mute"}
                  onClick={(ev) => { ev.stopPropagation(); onToggleMute(part.id); }}
                >
                  M
                </button>
              )}
              {onToggleSolo && (
                <button
                  className={`${styles.mixBtn} ${soloed ? styles.mixActive : ""}`}
                  title={soloed ? "Unsolo" : "Solo"}
                  onClick={(ev) => { ev.stopPropagation(); onToggleSolo(part.id); }}
                >
                  S
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.scroll}>
        <Grid part={part} sheetSteps={sheetSteps} scale={sheet.scale} cellW={cellW} cellH={cellH} {...gridProps} />
      </div>
    </div>
  );
}

export const Band = memo(BandImpl);
