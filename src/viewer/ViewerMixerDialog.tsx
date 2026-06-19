import { useEffect, useRef } from "react";
import type { Mix, Sheet } from "../core/model/types";
import { defaultPartMix } from "../core/model/factory";
import styles from "./ViewerMixerDialog.module.css";

export function ViewerMixerDialog({
  sheet,
  mix,
  open,
  onClose,
  onMixChange,
}: {
  sheet: Sheet;
  mix: Mix;
  open: boolean;
  onClose: () => void;
  onMixChange: (mix: Mix) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const patchMaster = (patch: Partial<Mix["master"]>) =>
    onMixChange({ ...mix, master: { ...mix.master, ...patch } });

  const patchPart = (partId: string, patch: Partial<typeof mix.parts[string]>) => {
    const pm = mix.parts[partId] ?? defaultPartMix();
    onMixChange({ ...mix, parts: { ...mix.parts, [partId]: { ...pm, ...patch } } });
  };

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} onCancel={onClose}>
      <div className={styles.header}>
        <strong>Mixer</strong>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.row}>
          <label>Master</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={mix.master.vol}
            onChange={(e) => patchMaster({ vol: Number(e.target.value) })}
          />
          <button
            className={`${styles.toggle} ${mix.master.mute ? styles.on : ""}`}
            onClick={() => patchMaster({ mute: !mix.master.mute })}
          >
            Mute
          </button>
        </div>
        {sheet.parts.map((p) => {
          const pm = mix.parts[p.id] ?? defaultPartMix();
          return (
            <div key={p.id} className={styles.row}>
              <label>{p.name}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={pm.vol}
                onChange={(e) => patchPart(p.id, { vol: Number(e.target.value) })}
              />
              <button
                className={`${styles.toggle} ${pm.mute ? styles.on : ""}`}
                onClick={() => patchPart(p.id, { mute: !pm.mute })}
              >
                M
              </button>
              <button
                className={`${styles.toggle} ${pm.solo ? styles.on : ""}`}
                onClick={() => patchPart(p.id, { solo: !pm.solo })}
              >
                S
              </button>
            </div>
          );
        })}
      </div>
    </dialog>
  );
}
