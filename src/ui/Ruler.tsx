import { useEffect, useRef } from "react";
import { STEPS_PER_BAR } from "../core/model/constants";
import styles from "./Ruler.module.css";

/** Animated playhead tick inside the ruler — rAF-driven, no React re-renders. */
function RulerPlayhead({ getStep, cellW }: { getStep: () => number | null; cellW: number }) {
  const lineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const step = getStep();
      const el = lineRef.current;
      if (el) {
        if (step == null) {
          el.style.display = "none";
        } else {
          el.style.display = "block";
          el.style.left = `${step * cellW}px`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [getStep, cellW]);
  return <div ref={lineRef} className={styles.playhead} style={{ display: "none" }} />;
}

export interface RulerProps {
  barCount: number;
  cellW: number;
  /** Must match the Band sidebar width so bar numbers align with grid columns. */
  sidebarWidth: number;
  /** Step the cursor is at when stopped or paused (shown as a start marker). */
  cursorStep?: number;
  /** Live playhead during playback — polled via rAF, never causes re-render. */
  getPlayheadStep?: () => number | null;
  onSeek?: (step: number) => void;
  /** Add one bar to the sheet. */
  onAddBar?: () => void;
  /** Remove the last bar from the sheet. */
  onRemoveBar?: () => void;
}

export function Ruler({ barCount, cellW, sidebarWidth, cursorStep, getPlayheadStep, onSeek, onAddBar, onRemoveBar }: RulerProps) {
  const barW = cellW * STEPS_PER_BAR;
  const totalW = barCount * barW;

  const handleClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const step = Math.floor((ev.clientX - rect.left) / cellW);
    onSeek(Math.max(0, Math.min(step, barCount * STEPS_PER_BAR - 1)));
  };

  return (
    <div className={styles.ruler}>
      <div className={styles.spacer} style={{ width: sidebarWidth }} />
      <div
        className={styles.track}
        style={{ width: totalW }}
        onClick={handleClick}
      >
        {Array.from({ length: barCount }, (_, i) => (
          <div key={i} className={styles.barLabel} style={{ left: i * barW, width: barW }}>
            {i + 1}
          </div>
        ))}
        {cursorStep != null && (
          <div className={styles.cursor} style={{ left: cursorStep * cellW }} />
        )}
        {getPlayheadStep && <RulerPlayhead getStep={getPlayheadStep} cellW={cellW} />}
      </div>
      {(onAddBar || onRemoveBar) && (
        <div className={styles.barActions}>
          {onRemoveBar && (
            <button
              className={styles.barBtn}
              title="Remove last bar"
              onClick={(ev) => { ev.stopPropagation(); onRemoveBar(); }}
              disabled={barCount <= 1}
            >
              −
            </button>
          )}
          {onAddBar && (
            <button
              className={styles.barBtn}
              title="Add bar"
              onClick={(ev) => { ev.stopPropagation(); onAddBar(); }}
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
}
