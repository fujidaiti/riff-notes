import { memo } from "react";
import type { GridLayout } from "../../core/grid-layout";
import { STEPS_PER_BAR } from "../../core/model/constants";
import styles from "./SeparatorLayer.module.css";

interface Props {
  totalSteps: number;
  layout: GridLayout;
}

/**
 * Renders a horizontal strip of bar/beat/step separator divs interleaved with
 * cell spacers. Positioned absolute, inset 0, pointer-events none — sits behind
 * notes and other absolute-positioned children of the grid wrap.
 */
function SeparatorLayerImpl({ totalSteps, layout }: Props) {
  const items: React.ReactNode[] = [];
  let step = 0;

  while (step <= totalSteps) {
    items.push(
      <div key={`bs-${step}`} className={styles.barSep} style={{ width: layout.barSepW }} />,
    );
    if (step === totalSteps) break;

    for (let beat = 0; beat < 4 && step < totalSteps; beat++) {
      if (beat > 0) {
        items.push(
          <div key={`bts-${step}`} className={styles.beatSep} style={{ width: layout.beatSepW }} />,
        );
      }
      for (let s = 0; s < STEPS_PER_BAR / 4 && step < totalSteps; s++) {
        if (s > 0) {
          items.push(
            <div key={`ss-${step}`} className={styles.stepSep} style={{ width: layout.stepSepW }} />,
          );
        }
        items.push(
          <div key={`c-${step}`} className={styles.cell} style={{ width: layout.cellW }} />,
        );
        step++;
      }
    }
  }

  return <div className={styles.layer}>{items}</div>;
}

export const SeparatorLayer = memo(SeparatorLayerImpl);
