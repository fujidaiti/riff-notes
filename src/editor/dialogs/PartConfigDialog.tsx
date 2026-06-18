import type { InstrumentId, Part, Sheet } from "../../core/model/types";
import { getInstrument, INSTRUMENT_OPTIONS, PIANO_MAX, PIANO_MIN } from "../../core/model/constants";
import { isRhythmPart } from "../../core/model/factory";
import { pitchName } from "../../core/theory";
import { useDispatch } from "../../state/context";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

export function PartConfigDialog({ sheet, part, open, onClose }: { sheet: Sheet; part: Part | null; open: boolean; onClose: () => void }) {
  const dispatch = useDispatch();
  if (!part) return null;
  const rhythm = isRhythmPart(part);
  const pitches = Array.from({ length: PIANO_MAX - PIANO_MIN + 1 }, (_, i) => PIANO_MIN + i);

  return (
    <Dialog open={open} onClose={onClose} title="Part settings">
      <div className={styles.row}>
        <label>Name</label>
        <input
          type="text"
          value={part.name}
          onChange={(e) => dispatch({ type: "UPDATE_PART", sheetId: sheet.id, partId: part.id, fields: { name: e.target.value } })}
        />
      </div>
      <div className={styles.row}>
        <label>Instrument</label>
        <select
          value={part.instrument}
          onChange={(e) => {
            const newId = e.target.value as InstrumentId;
            if (newId === part.instrument) return;
            const prev = getInstrument(part.instrument);
            const next = getInstrument(newId);
            if (prev.pitchMode !== next.pitchMode) {
              const msg = part.notes.length > 0
                ? `Switching instrument will delete ${part.notes.length} note(s). Continue?`
                : `Switching instrument will reset the pitch range. Continue?`;
              if (!window.confirm(msg)) return;
            }
            dispatch({ type: "UPDATE_PART", sheetId: sheet.id, partId: part.id, fields: { instrument: newId } });
          }}
        >
          {INSTRUMENT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!rhythm && (
        <>
          <div className={styles.row}>
            <label>Low</label>
            <select
              value={part.lo}
              onChange={(e) => dispatch({ type: "UPDATE_PART", sheetId: sheet.id, partId: part.id, fields: { lo: Number(e.target.value) } })}
            >
              {pitches.map((p) => (
                <option key={p} value={p}>
                  {pitchName(p)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.row}>
            <label>High</label>
            <select
              value={part.hi}
              onChange={(e) => dispatch({ type: "UPDATE_PART", sheetId: sheet.id, partId: part.id, fields: { hi: Number(e.target.value) } })}
            >
              {pitches.map((p) => (
                <option key={p} value={p}>
                  {pitchName(p)}
                </option>
              ))}
            </select>
            <button
              className={styles.toggle}
              title="Fit range to existing notes in this part"
              disabled={part.notes.length === 0}
              onClick={() => {
                let lo = Infinity, hi = -Infinity;
                for (const n of part.notes) {
                  if (n.pitch < lo) lo = n.pitch;
                  if (n.pitch > hi) hi = n.pitch;
                }
                if (lo === part.lo && hi === part.hi) return;
                dispatch({ type: "UPDATE_PART", sheetId: sheet.id, partId: part.id, fields: { lo, hi } });
              }}
            >
              Fit
            </button>
          </div>
        </>
      )}
      {sheet.parts.length > 1 && (
        <div className={styles.row}>
          <button
            className={styles.toggle}
            onClick={() => {
              dispatch({ type: "DELETE_PART", sheetId: sheet.id, partId: part.id });
              onClose();
            }}
          >
            Delete part
          </button>
        </div>
      )}
    </Dialog>
  );
}
