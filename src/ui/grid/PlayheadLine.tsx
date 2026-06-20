import { useEffect, useRef } from "react";
import type { GridLayout } from "../../core/grid-layout";
import { stepToX } from "../../core/grid-layout";
import styles from "./Grid.module.css";

export interface PlayheadLineProps {
  /** Returns the current playhead step, or null when stopped. Polled via rAF. */
  getStep: () => number | null;
  layout: GridLayout;
}

/**
 * A playhead line that updates its own position from a rAF loop, mutating its
 * element's style directly. It never re-renders after mount, so the 60fps
 * playhead motion never reconciles the (memoized) note tree around it.
 */
export function PlayheadLine({ getStep, layout }: PlayheadLineProps) {
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
          el.style.left = `${stepToX(step, layout)}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getStep, layout]);

  return <div ref={ref} className={styles.playhead} style={{ display: "none" }} />;
}
