import { memo, useEffect, useRef, useState } from "react";
import type { Part, Sheet } from "../core/model/types";

/** Width of the part label sidebar — must match the .side CSS width in Band.module.css. */
export const BAND_SIDE_W = 60;
import { Grid, type GridProps } from "./grid/Grid";
import styles from "./Band.module.css";

import type { GridLayout } from "../core/grid-layout";

type BandGridProps = Omit<GridProps, "part" | "sheetSteps" | "scale" | "layout" | "cellH">;

export interface BandProps extends BandGridProps {
  sheet: Sheet;
  part: Part;
  sheetSteps: number;
  layout: GridLayout;
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
  /** Editor-only: delete this part. */
  onPartDelete?: (partId: string) => void;
  /** Editor-only: rename this part inline. */
  onPartNameChange?: (partId: string, name: string) => void;
}


function PartMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (ev: PointerEvent) => {
      if (rootRef.current?.contains(ev.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  return (
    <div ref={rootRef} className={styles.menu}>
      <button
        className={styles.menuBtn}
        title="Part menu"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className={styles.menuPanel}>
          {onEdit && <button onClick={() => { onEdit(); setOpen(false); }}>Edit</button>}
          {onDelete && <button className={styles.menuDelete} onClick={() => { onDelete(); setOpen(false); }}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function BandImpl({ sheet, part, sheetSteps, layout, cellH, onPartClick, onPartRecord, isRecording, onToggleMute, onToggleSolo, onPartDelete, onPartNameChange, ...gridProps }: BandProps) {
  const mix = sheet.mix.parts[part.id];
  const muted = mix?.mute ?? false;
  const soloed = mix?.solo ?? false;
  return (
    <div className={styles.band}>
      <div className={styles.side}>
        <div className={styles.sideBtns}>
          <div className={styles.sideTop}>
            {(onPartClick || onPartDelete) && (
              <PartMenu
                onEdit={onPartClick ? () => onPartClick(part.id) : undefined}
                onDelete={onPartDelete ? () => onPartDelete(part.id) : undefined}
              />
            )}
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
        {onPartNameChange ? (
          <input
            className={styles.nameInput}
            type="text"
            value={part.name}
            title="Part name"
            onClick={(ev) => ev.stopPropagation()}
            onChange={(ev) => onPartNameChange(part.id, ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === "Escape") ev.currentTarget.blur(); }}
          />
        ) : (
          <span className={styles.name}>{part.name}</span>
        )}
      </div>
      <div className={styles.scroll}>
        <Grid part={part} sheetSteps={sheetSteps} scale={sheet.scale} layout={layout} cellH={cellH} {...gridProps} />
      </div>
    </div>
  );
}

export const Band = memo(BandImpl);
