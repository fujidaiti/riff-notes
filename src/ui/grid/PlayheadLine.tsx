import { useEffect, useRef } from "react";
import styles from "./Grid.module.css";

export interface PlayheadLineProps {
  /** Returns the current playhead step, or null when stopped. Polled via rAF. */
  getStep: () => number | null;
  cellW: number;
}

/**
 * A playhead line that updates its own position from a rAF loop, mutating its
 * element's style directly. It never re-renders after mount, so the 60fps
 * playhead motion never reconciles the (memoized) note tree around it.
 */
export function PlayheadLine({ getStep, cellW }: PlayheadLineProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const step = getStep();
        if (step == null) {
          el.style.display = "none";
        } else {
          el.style.display = "block";
          el.style.left = `${step * cellW}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getStep, cellW]);

  return <div ref={ref} className={styles.playhead} style={{ display: "none" }} />;
}
