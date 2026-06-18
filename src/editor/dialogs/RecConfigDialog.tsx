import { useEffect, useState } from "react";
import type { Sheet } from "../../core/model/types";
import { QUANTIZE_GRIDS } from "../../core/quantize";
import type { RecordOptions } from "../hooks/useMidiRecording";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

export function RecConfigDialog({
  sheet,
  open,
  onClose,
  onStart,
  defaultPartId,
}: {
  sheet: Sheet;
  open: boolean;
  onClose: () => void;
  onStart: (options: RecordOptions) => void;
  defaultPartId?: string | null;
}) {
  const eligible = sheet.parts;
  const [partId, setPartId] = useState(eligible[0]?.id ?? "");
  const [posSub, setPosSub] = useState(0);
  const [bpm, setBpm] = useState<string>("");
  const [autoExpandRange, setAutoExpandRange] = useState(false);
  const [autoAppendBar, setAutoAppendBar] = useState(false);
  const [playBacking, setPlayBacking] = useState(true);

  // When opened with a specific part (via per-part record button), pre-select it.
  useEffect(() => {
    if (!open) return;
    if (defaultPartId && eligible.some((p) => p.id === defaultPartId)) {
      setPartId(defaultPartId);
    } else if (!eligible.some((p) => p.id === partId)) {
      setPartId(eligible[0]?.id ?? "");
    }
  }, [open, defaultPartId, eligible, partId]);

  return (
    <Dialog open={open} onClose={onClose} title="Record">
      <div className={styles.row}>
        <label>Part</label>
        <select value={partId} onChange={(e) => setPartId(e.target.value)}>
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <label>Quantize start</label>
        <select value={posSub} onChange={(e) => setPosSub(Number(e.target.value))}>
          {QUANTIZE_GRIDS.map((g) => (
            <option key={g.label} value={g.sub}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <label>Tempo override (BPM)</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder={String(sheet.bpm)}
          style={{ width: 56 }}
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <label>Play backing track</label>
        <input type="checkbox" checked={playBacking} onChange={(e) => setPlayBacking(e.target.checked)} />
      </div>
      <div className={styles.row}>
        <label>Auto-expand pitch range</label>
        <input type="checkbox" checked={autoExpandRange} onChange={(e) => setAutoExpandRange(e.target.checked)} />
      </div>
      <div className={styles.row}>
        <label>Append bars while recording</label>
        <input type="checkbox" checked={autoAppendBar} onChange={(e) => setAutoAppendBar(e.target.checked)} />
      </div>
      <div className={styles.row} style={{ justifyContent: "flex-end" }}>
        <button className={styles.toggle} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`${styles.toggle} ${styles.on}`}
          disabled={!partId}
          onClick={() => {
            const parsed = parseInt(bpm, 10);
            const bpmOverride = Number.isFinite(parsed) && parsed >= 20 && parsed <= 300 ? parsed : 0;
            onStart({ partId, posQuantizeSub: posSub, bpmOverride, autoExpandRange, autoAppendBar, playBacking });
            onClose();
          }}
        >
          Start
        </button>
      </div>
    </Dialog>
  );
}
