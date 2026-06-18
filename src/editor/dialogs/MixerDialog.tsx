import type { Sheet } from "../../core/model/types";
import { defaultPartMix } from "../../core/model/factory";
import { useDispatch } from "../../state/context";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

export function MixerDialog({ sheet, open, onClose }: { sheet: Sheet; open: boolean; onClose: () => void }) {
  const dispatch = useDispatch();
  return (
    <Dialog open={open} onClose={onClose} title="Mixer">
      <div className={styles.row}>
        <label>Master</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sheet.mix.master.vol}
          onChange={(e) => dispatch({ type: "SET_MASTER_MIX", sheetId: sheet.id, patch: { vol: Number(e.target.value) } })}
        />
        <button
          className={`${styles.toggle} ${sheet.mix.master.mute ? styles.on : ""}`}
          onClick={() => dispatch({ type: "SET_MASTER_MIX", sheetId: sheet.id, patch: { mute: !sheet.mix.master.mute } })}
        >
          Mute
        </button>
      </div>
      {sheet.parts.map((p) => {
        const pm = sheet.mix.parts[p.id] ?? defaultPartMix();
        return (
          <div key={p.id} className={styles.row}>
            <label>{p.name}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={pm.vol}
              onChange={(e) => dispatch({ type: "SET_PART_MIX", sheetId: sheet.id, partId: p.id, patch: { vol: Number(e.target.value) } })}
            />
            <button
              className={`${styles.toggle} ${pm.mute ? styles.on : ""}`}
              onClick={() => dispatch({ type: "SET_PART_MIX", sheetId: sheet.id, partId: p.id, patch: { mute: !pm.mute } })}
            >
              M
            </button>
            <button
              className={`${styles.toggle} ${pm.solo ? styles.on : ""}`}
              onClick={() => dispatch({ type: "SET_PART_MIX", sheetId: sheet.id, partId: p.id, patch: { solo: !pm.solo } })}
            >
              S
            </button>
          </div>
        );
      })}
    </Dialog>
  );
}
