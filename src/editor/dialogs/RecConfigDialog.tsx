import { useEffect, useState } from "react";
import type { Sheet } from "../../core/model/types";
import { QUANTIZE_GRIDS } from "../../core/quantize";
import { recordOptionsFromConfig, type RecordConfig, type RecordOptions } from "../hooks/useMidiRecording";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

export function RecConfigDialog({
  sheet,
  open,
  onClose,
  onStart,
  defaultPartId,
  config,
  onConfigChange,
}: {
  sheet: Sheet;
  open: boolean;
  onClose: () => void;
  onStart: (options: RecordOptions) => void;
  defaultPartId?: string | null;
  config: RecordConfig;
  onConfigChange: (config: RecordConfig) => void;
}) {
  const eligible = sheet.parts;
  const [partId, setPartId] = useState(eligible[0]?.id ?? "");
  const posSub = config.posQuantizeSub;
  const lenSub = config.lenQuantizeSub;
  const bpm = config.bpmText;
  const autoExpandRange = config.autoExpandRange;
  const autoAppendBar = config.autoAppendBar;
  const playBacking = config.playBacking;
  const patch = (p: Partial<RecordConfig>) => onConfigChange({ ...config, ...p });

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
        <select value={posSub} onChange={(e) => patch({ posQuantizeSub: Number(e.target.value) })}>
          {QUANTIZE_GRIDS.map((g) => (
            <option key={g.label} value={g.sub}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <label>Quantize length</label>
        <select value={lenSub} onChange={(e) => patch({ lenQuantizeSub: Number(e.target.value) })}>
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
          onChange={(e) => patch({ bpmText: e.target.value })}
        />
      </div>
      <div className={styles.row}>
        <label>Play backing track</label>
        <input type="checkbox" checked={playBacking} onChange={(e) => patch({ playBacking: e.target.checked })} />
      </div>
      <div className={styles.row}>
        <label>Auto-expand pitch range</label>
        <input type="checkbox" checked={autoExpandRange} onChange={(e) => patch({ autoExpandRange: e.target.checked })} />
      </div>
      <div className={styles.row}>
        <label>Append bars while recording</label>
        <input type="checkbox" checked={autoAppendBar} onChange={(e) => patch({ autoAppendBar: e.target.checked })} />
      </div>
      <div className={styles.row} style={{ justifyContent: "flex-end" }}>
        <button className={styles.toggle} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`${styles.toggle} ${styles.on}`}
          disabled={!partId}
          onClick={() => {
            onStart({ partId, ...recordOptionsFromConfig(config) });
            onClose();
          }}
        >
          Start
        </button>
      </div>
    </Dialog>
  );
}
