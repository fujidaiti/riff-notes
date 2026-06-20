import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, useDispatch } from "../state/context";
import { activeSheet } from "../state/reducer";
import { PITCH_NAMES, SCALE_OPTIONS } from "../core/model/constants";
import { AudioEngine } from "../audio/AudioEngine";
import { SheetView } from "../ui/SheetView";
import { useCellSize } from "../ui/useCellSize";
import { useGridInteraction } from "./hooks/useGridInteraction";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTransport } from "./hooks/useTransport";
import { useMidiRecording } from "./hooks/useMidiRecording";
import { useCellHover } from "./hooks/useCellHover";
import { RecConfigDialog } from "./dialogs/RecConfigDialog";
import { MixerDialog } from "./dialogs/MixerDialog";
import { PartConfigDialog } from "./dialogs/PartConfigDialog";
import { QuantizeDialog } from "./dialogs/QuantizeDialog";
import { HelpDialog } from "./dialogs/HelpDialog";
import { AnnotationDialog } from "./dialogs/AnnotationDialog";
import { downloadProjectJson, downloadSheetMidi, pickProjectJson } from "./io";
import { useTheme } from "./useTheme";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import styles from "./App.module.css";

export function App() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { cellH, layout } = useCellSize();
  const sheet = activeSheet(state);
  const selection = state.ui.selection[sheet.id] ?? { noteIds: new Set<string>(), cell: null };

  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const recording = useMidiRecording(engine, sheet, dispatch);
  const { transport, repeat, setRepeat, play, pause, stop, seekTo, displayCursor, getPlayheadStep } = useTransport(engine, sheet, recording);
  useKeyboardShortcuts(state, dispatch, {
    openQuantize: () => setQuantizeOpen(true),
    openHelp: () => setHelpOpen(true),
    onSave: () => void downloadProjectJson(state.project),
    onRewind: () => seekTo(0),
    onRecord: () => {
      if (recording.recording) { recording.stop(); return; }
      // Infer the target part from the current selection (cell or first selected note).
      let partId: string | null = selection.cell?.partId ?? null;
      if (!partId && selection.noteIds.size > 0) {
        const firstId = [...selection.noteIds][0];
        partId = sheet.parts.find((p) => p.notes.some((n) => n.id === firstId))?.id ?? null;
      }
      if (partId) {
        void recording.start({ partId });
      } else {
        setRecConfigOpen(true);
      }
    },
  });
  const { displaySheet, onNotePointerDown, onGridPointerDown, onSheetPointerDown } = useGridInteraction(sheet, selection, dispatch, layout, cellH, engine);

  const sheetRef = useRef<HTMLDivElement>(null);
  useCellHover(sheetRef, layout, cellH, transport === "stopped" && !recording.recording);

  const [recConfigOpen, setRecConfigOpen] = useState(false);
  const [recConfigPartId, setRecConfigPartId] = useState<string | null>(null);

  // Push live mixer changes to the audio graph while playing.
  useEffect(() => {
    engine.syncMix(sheet);
  }, [engine, sheet]);

  const [mixerOpen, setMixerOpen] = useState(false);
  const [quantizeOpen, setQuantizeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [partConfigId, setPartConfigId] = useState<string | null>(null);
  const partConfig = partConfigId ? (sheet.parts.find((p) => p.id === partConfigId) ?? null) : null;
  const [editAnnId, setEditAnnId] = useState<string | null>(null);
  const editAnn = editAnnId ? (sheet.annotations.find((a) => a.id === editAnnId) ?? null) : null;

  const [noteCtxMenu, setNoteCtxMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  const onNoteContextMenu = useCallback((note: import("../core/model/types").Note, ev: React.MouseEvent) => {
    const sh = sheet;
    // If the right-clicked note isn't already selected, make it the sole selection.
    if (!selection.noteIds.has(note.id)) {
      dispatch({ type: "SET_SELECTION", sheetId: sh.id, noteIds: new Set([note.id]) });
    }
    const existing = sh.annotations.filter((a) => a.noteIds.includes(note.id));
    const items: ContextMenuEntry[] = [];
    for (const a of existing) {
      const preview = a.text.replace(/\s+/g, " ").slice(0, 20);
      items.push({ label: `Edit "${preview}${a.text.length > 20 ? "…" : ""}"`, onClick: () => setEditAnnId(a.id) });
    }
    if (existing.length > 0) items.push({ sep: true });
    items.push({
      label: "Annotate",
      onClick: () => {
        const sel = selection.noteIds.has(note.id) ? selection.noteIds : new Set([note.id]);
        dispatch({ type: "ADD_ANNOTATION", sheetId: sh.id, noteIds: [...sel] });
        // Open the new annotation for editing right away.
      },
    });
    items.push({ label: "Quantize…", onClick: () => setQuantizeOpen(true) });
    setNoteCtxMenu({ x: ev.clientX, y: ev.clientY, items });
  }, [sheet, selection, dispatch]);

  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;

  const { label: themeLabel, cycle: cycleTheme } = useTheme();

  const loadFromFile = async () => {
    const project = await pickProjectJson();
    if (project) dispatch({ type: "LOAD_PROJECT", project });
  };

  const [overflowMenuAnchor, setOverflowMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const overflowItems: ContextMenuEntry[] = [
    { label: "Save JSON", onClick: () => void downloadProjectJson(state.project) },
    { label: "Load JSON", onClick: () => void loadFromFile() },
    { sep: true },
    { label: "Export sheet as MIDI", onClick: () => downloadSheetMidi(sheet) },
    { sep: true },
    { label: `Theme: ${themeLabel}`, onClick: cycleTheme },
    { sep: true },
    { label: "Keyboard shortcuts", onClick: () => setHelpOpen(true) },
  ];

  return (
    <div className={styles.app} onContextMenu={(e) => e.preventDefault()}>
      <div className={styles.toolbar}>
        <button className={styles.btn} style={{ minWidth: 96 }} onClick={transport === "playing" ? pause : play}>
          {transport === "playing" ? "⏸ Pause" : transport === "paused" ? "▶ Resume" : "▶ Play"}
        </button>
        <button className={styles.btn} disabled={transport === "stopped"} onClick={stop}>
          ⏹ Stop
        </button>
        <button className={`${styles.btn} ${repeat ? styles.active : ""}`} onClick={() => setRepeat((r) => !r)} title="Loop">
          ↻ Repeat
        </button>
        <button
          className={`${styles.btn} ${recording.recording ? styles.active : ""}`}
          style={{ minWidth: 110 }}
          onClick={recording.recording ? recording.stop : () => setRecConfigOpen(true)}
          title="Record from a MIDI device"
        >
          {recording.phase === "count-in" ? "● Count-in…" : recording.recording ? "● Recording" : "● Record"}
        </button>
        <span style={{ width: 12 }} />
        <button className={styles.btn} onClick={() => setMixerOpen(true)}>
          Mixer
        </button>
        <span style={{ width: 12 }} />
        <button className={styles.btn} disabled={!canUndo} onClick={() => dispatch({ type: "UNDO" })} title="Undo (Cmd+Z)">
          Undo
        </button>
        <button className={styles.btn} disabled={!canRedo} onClick={() => dispatch({ type: "REDO" })} title="Redo (Cmd+Shift+Z)">
          Redo
        </button>
        <span className={styles.spacer} />
        <button
          className={styles.btn}
          title="More actions"
          onClick={(ev) => {
            const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
            setOverflowMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          ⋯
        </button>
      </div>

      <div className={styles.sheet} ref={sheetRef} onPointerDown={onSheetPointerDown}>
        <SheetView
          sheet={displaySheet}
          layout={layout}
          cellH={cellH}
          selection={selection}
          annotationsVisible={state.ui.annotationsVisible}
          getPlayheadStep={recording.recording ? recording.getRecordStep : transport === "stopped" ? undefined : getPlayheadStep}
          cursorStep={transport !== "playing" ? displayCursor : undefined}
          onSeek={seekTo}
          onAddBar={() => dispatch({ type: "SET_SHEET_FIELDS", sheetId: sheet.id, fields: { barCount: sheet.barCount + 1 } })}
          onRemoveBar={() => dispatch({ type: "SET_SHEET_FIELDS", sheetId: sheet.id, fields: { barCount: Math.max(1, sheet.barCount - 1) } })}
          onNotePointerDown={onNotePointerDown}
          onNoteContextMenu={onNoteContextMenu}
          onGridPointerDown={onGridPointerDown}
          onPartClick={setPartConfigId}
          onPartRecord={(partId) => {
            if (recording.recording) {
              // If already recording this part, stop; otherwise stop and restart for the new part.
              recording.stop();
              if (recording.recordingPartId !== partId) void recording.start({ partId });
            } else {
              void recording.start({ partId });
            }
          }}
          recordingPartId={recording.recordingPartId}
          onToggleMute={(partId) => {
            const mix = sheet.mix.parts[partId];
            dispatch({ type: "SET_PART_MIX", sheetId: sheet.id, partId, patch: { mute: !mix?.mute } });
          }}
          onToggleSolo={(partId) => {
            const mix = sheet.mix.parts[partId];
            dispatch({ type: "SET_PART_MIX", sheetId: sheet.id, partId, patch: { solo: !mix?.solo } });
          }}
          onPartDelete={(partId) => dispatch({ type: "DELETE_PART", sheetId: sheet.id, partId })}
          onPartNameChange={(partId, name) => dispatch({ type: "UPDATE_PART", sheetId: sheet.id, partId, fields: { name } })}
          onInsertPart={(atIndex) => dispatch({ type: "ADD_PART", sheetId: sheet.id, instrument: "epiano", insertAt: atIndex })}
          onAnnotationEdit={setEditAnnId}
          onAnnotationMove={(id, dx, dy) => dispatch({ type: "MOVE_ANNOTATION", sheetId: sheet.id, id, dx, dy })}
          onAnnotationResize={(id, shrunkWidth, dx) => dispatch({ type: "RESIZE_ANNOTATION", sheetId: sheet.id, id, shrunkWidth, dx })}
          onAnnotationDelete={(id) => dispatch({ type: "DELETE_ANNOTATION", sheetId: sheet.id, id })}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.tabstrip}>
          {state.project.sheets.map((s) => (
            <span
              key={s.id}
              className={`${styles.tab} ${s.id === state.ui.activeSheetId ? styles.active : ""}`}
              onClick={() => dispatch({ type: "SET_ACTIVE_SHEET", sheetId: s.id })}
            >
              {s.id === state.ui.activeSheetId && transport !== "stopped" && (
                <span className={styles.tabPlaying}>{transport === "playing" ? "▶" : "⏸"}</span>
              )}
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
          <input
            className={styles.projectName}
            type="text"
            placeholder="Project name"
            value={state.project.name}
            onChange={(e) => dispatch({ type: "SET_PROJECT_NAME", name: e.target.value })}
          />
          <span className={styles.metaSep}>—</span>
          <input
            className={styles.sheetTitle}
            type="text"
            placeholder={`Sheet ${state.project.sheets.indexOf(sheet) + 1}`}
            value={sheet.title}
            onChange={(e) => dispatch({ type: "SET_SHEET_FIELDS", sheetId: sheet.id, fields: { title: e.target.value } })}
          />
          <span className={styles.spacer} />
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
      </div>

      <MixerDialog sheet={sheet} open={mixerOpen} onClose={() => setMixerOpen(false)} />
      <PartConfigDialog sheet={sheet} part={partConfig} open={partConfig !== null} onClose={() => setPartConfigId(null)} />
      <QuantizeDialog
        open={quantizeOpen}
        onClose={() => setQuantizeOpen(false)}
        onApply={(posSub, lenSub) =>
          dispatch({ type: "QUANTIZE_SELECTION", sheetId: sheet.id, noteIds: selection.noteIds, posSub, lenSub })
        }
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AnnotationDialog sheetId={sheet.id} annotation={editAnn} open={editAnn !== null} onClose={() => setEditAnnId(null)} />
      <RecConfigDialog sheet={sheet} open={recConfigOpen} onClose={() => { setRecConfigOpen(false); setRecConfigPartId(null); }} onStart={(o) => void recording.start(o)} defaultPartId={recConfigPartId} />
      {noteCtxMenu && (
        <ContextMenu
          x={noteCtxMenu.x}
          y={noteCtxMenu.y}
          items={noteCtxMenu.items}
          onClose={() => setNoteCtxMenu(null)}
        />
      )}
      {overflowMenuAnchor && (
        <ContextMenu
          x={overflowMenuAnchor.x}
          y={overflowMenuAnchor.y}
          items={overflowItems}
          onClose={() => setOverflowMenuAnchor(null)}
        />
      )}
    </div>
  );
}
