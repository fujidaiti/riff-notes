import { useEffect, useRef } from "react";
import { useAppState, useDispatch } from "../state/context";
import { activeSheet } from "../state/reducer";
import { PITCH_NAMES, SCALE_OPTIONS } from "../core/model/constants";
import { AudioEngine } from "../audio/AudioEngine";
import { SheetView } from "../ui/SheetView";
import { useCellSize } from "../ui/useCellSize";
import { useGridInteraction } from "./hooks/useGridInteraction";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTransport } from "./hooks/useTransport";
import styles from "./App.module.css";

export function App() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { cellW, cellH } = useCellSize();
  const sheet = activeSheet(state);
  const selection = state.ui.selection[sheet.id] ?? { noteIds: new Set<string>(), cell: null };

  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  useKeyboardShortcuts(state, dispatch);
  const { transport, repeat, setRepeat, play, pause, stop, getPlayheadStep } = useTransport(engine, sheet);
  const { displaySheet, onNotePointerDown, onGridPointerDown } = useGridInteraction(sheet, selection, dispatch, cellW, cellH, engine);

  // Push live mixer changes to the audio graph while playing.
  useEffect(() => {
    engine.syncMix(sheet);
  }, [engine, sheet]);

  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;

  return (
    <div className={styles.app}>
      <div className={styles.toolbar}>
        <strong>Riff Notes</strong>
        <button className={styles.btn} onClick={transport === "playing" ? pause : play}>
          {transport === "playing" ? "⏸ Pause" : transport === "paused" ? "▶ Resume" : "▶ Play"}
        </button>
        <button className={styles.btn} disabled={transport === "stopped"} onClick={stop}>
          ⏹ Stop
        </button>
        <button className={`${styles.btn} ${repeat ? styles.active : ""}`} onClick={() => setRepeat((r) => !r)} title="Loop">
          ↻ Repeat
        </button>
        <span style={{ width: 12 }} />
        <button className={styles.btn} disabled={!canUndo} onClick={() => dispatch({ type: "UNDO" })}>
          Undo
        </button>
        <button className={styles.btn} disabled={!canRedo} onClick={() => dispatch({ type: "REDO" })}>
          Redo
        </button>
        <span className={styles.spacer} />
        <span className={styles.hint}>⌘/Ctrl-click empty cell to add · drag to move · edges to resize · Delete to remove · Space to play</span>
      </div>

      <div className={styles.tabstrip}>
        {state.project.sheets.map((s) => (
          <span
            key={s.id}
            className={`${styles.tab} ${s.id === state.ui.activeSheetId ? styles.active : ""}`}
            onClick={() => dispatch({ type: "SET_ACTIVE_SHEET", sheetId: s.id })}
          >
            {s.title}
            {state.project.sheets.length > 1 && (
              <button
                className={styles.tabClose}
                onClick={(ev) => {
                  ev.stopPropagation();
                  dispatch({ type: "DELETE_SHEET", sheetId: s.id });
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button className={styles.btn} onClick={() => dispatch({ type: "ADD_SHEET" })}>
          +
        </button>
      </div>

      <div className={styles.meta}>
        <label className={styles.field}>
          Title
          <input
            type="text"
            value={sheet.title}
            onChange={(e) => dispatch({ type: "SET_SHEET_FIELDS", sheetId: sheet.id, fields: { title: e.target.value } })}
          />
        </label>
        <label className={styles.field}>
          BPM
          <input
            type="text"
            inputMode="numeric"
            style={{ width: 48 }}
            value={sheet.bpm}
            onChange={(e) => {
              const bpm = Math.max(20, Math.min(300, parseInt(e.target.value, 10) || sheet.bpm));
              dispatch({ type: "SET_SHEET_FIELDS", sheetId: sheet.id, fields: { bpm } });
            }}
          />
        </label>
        <label className={styles.field}>
          Bars
          <input
            type="text"
            inputMode="numeric"
            style={{ width: 40 }}
            value={sheet.barCount}
            onChange={(e) => {
              const barCount = Math.max(1, parseInt(e.target.value, 10) || 1);
              dispatch({ type: "SET_SHEET_FIELDS", sheetId: sheet.id, fields: { barCount } });
            }}
          />
        </label>
        <label className={styles.field}>
          Key
          <select
            value={sheet.scale.root}
            onChange={(e) => dispatch({ type: "SET_SCALE", sheetId: sheet.id, scale: { ...sheet.scale, root: Number(e.target.value) } })}
          >
            {PITCH_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={sheet.scale.mode}
            onChange={(e) => dispatch({ type: "SET_SCALE", sheetId: sheet.id, scale: { ...sheet.scale, mode: e.target.value } })}
          >
            {SCALE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.sheet}>
        <SheetView
          sheet={displaySheet}
          cellW={cellW}
          cellH={cellH}
          selection={selection}
          showLabels={state.ui.annotationsVisible}
          getPlayheadStep={transport === "stopped" ? undefined : getPlayheadStep}
          onNotePointerDown={onNotePointerDown}
          onGridPointerDown={onGridPointerDown}
        />
      </div>
    </div>
  );
}
