import { useState } from "react";
import { QUANTIZE_GRIDS } from "../../core/quantize";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

export interface QuantizeDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (posSub: number, lenSub: number) => void;
}

export function QuantizeDialog({ open, onClose, onApply }: QuantizeDialogProps) {
  const [posSub, setPosSub] = useState(0);
  const [lenSub, setLenSub] = useState(0);

  return (
    <Dialog open={open} onClose={onClose} title="Quantize">
      <div className={styles.row}>
        <label>Start to</label>
        <select value={posSub} onChange={(e) => setPosSub(Number(e.target.value))}>
          {QUANTIZE_GRIDS.map((g) => (
            <option key={g.label} value={g.sub}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <label>Length to</label>
        <select value={lenSub} onChange={(e) => setLenSub(Number(e.target.value))}>
          {QUANTIZE_GRIDS.map((g) => (
            <option key={g.label} value={g.sub}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row} style={{ justifyContent: "flex-end" }}>
        <button className={styles.toggle} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`${styles.toggle} ${styles.on}`}
          onClick={() => {
            onApply(posSub, lenSub);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </Dialog>
  );
}
