import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mix, Sheet } from "../core/model/types";
import { STEPS_PER_BAR } from "../core/model/constants";
import { AudioEngine } from "../audio/AudioEngine";
import { useCellSize } from "../ui/useCellSize";
import { useCellHover } from "../ui/useCellHover";
import { BAND_SIDE_W } from "../ui/Band";
import { Grid } from "../ui/grid/Grid";
import { loadProject } from "./loadProject";
import { useViewerTransport } from "./useViewerTransport";
import { ViewerMixerDialog } from "./ViewerMixerDialog";
import styles from "./ViewerApp.module.css";

const BARS_PER_PAGE = 2;

/** rAF-driven playhead line for the ruler — never causes a React re-render. */
function RulerPlayhead({
  getStep,
  cellW,
}: {
  getStep: () => number | null;
  cellW: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: number;
    const tick = () => {
      const step = getStep();
      const el = ref.current;
      if (el) {
        if (step == null) {
          el.style.display = "none";
        } else {
          el.style.display = "block";
          el.style.left = `${step * cellW}px`;
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [getStep, cellW]);
  return <div ref={ref} className={styles.rulerPlayhead} style={{ display: "none" }} />;
}

export function ViewerApp() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mix, setMix] = useState<Mix | null>(null);
  const [bpm, setBpm] = useState(120);
  // String buffer so the user can type freely; clamped only on blur.
  const [bpmRaw, setBpmRaw] = useState("120");
  const [page, setPage] = useState(0);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [engine] = useState(() => new AudioEngine());
  const { cellW, cellH } = useCellSize();

  // Ref attached to the grid area so useCellHover can track pointer events.
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProject()
      .then(({ sheet }) => {
        setSheet(sheet);
        setMix({ ...sheet.mix });
        setBpm(sheet.bpm);
        setBpmRaw(String(sheet.bpm));
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load project.");
      })
      .finally(() => setLoading(false));
  }, []);

  const { transport, repeat, setRepeat, play, stop, getPlayheadStep } =
    useViewerTransport(engine, sheet, mix, bpm);

  // Hover tooltip + cell highlight (always enabled — viewer is always read-only).
  useCellHover(gridRef, cellW, cellH, true);

  // Keep a ref so the rAF callback always sees the latest page without a stale closure.
  const pageRef = useRef(page);
  pageRef.current = page;

  // Auto-advance the page when the playhead exits the visible 2-bar window.
  useEffect(() => {
    if (!sheet) return;
    const barCount = sheet.barCount;
    let rafId: number;
    const tick = () => {
      const step = getPlayheadStep();
      if (step !== null) {
        const playheadBar = Math.floor(step / STEPS_PER_BAR);
        const cur = pageRef.current;
        if (playheadBar < cur || playheadBar >= cur + BARS_PER_PAGE) {
          const next = Math.max(0, Math.min(playheadBar, barCount - BARS_PER_PAGE));
          if (next !== cur) {
            pageRef.current = next;
            setPage(next);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [getPlayheadStep, sheet]);

  const barW = cellW * STEPS_PER_BAR;
  // `page` is the 0-indexed start bar of the visible window, not a page index.
  const pageBar = page;

  // Annotations grouped by part (same logic as SheetView).
  const annotationsByPart = useMemo(() => {
    if (!sheet) return new Map<string, Sheet["annotations"]>();
    const partIdOfNote = new Map<string, string>();
    for (const p of sheet.parts) for (const n of p.notes) partIdOfNote.set(n.id, p.id);
    const map = new Map<string, typeof sheet.annotations>();
    for (const a of sheet.annotations) {
      const partId = partIdOfNote.get(a.placement.anchorNoteId);
      if (!partId) continue;
      const list = map.get(partId) ?? [];
      list.push(a);
      map.set(partId, list);
    }
    return map;
  }, [sheet]);

  // Manual page change: update page immediately and restart playback if active.
  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage;
    setPage(newPage);
    if (transport === "playing") {
      void play(newPage * STEPS_PER_BAR);
    }
  }, [transport, play]);

  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBpmRaw(e.target.value);
  }, []);

  const handleBpmBlur = useCallback(() => {
    const v = parseInt(bpmRaw, 10);
    if (!isNaN(v)) {
      const clamped = Math.max(20, Math.min(300, v));
      setBpm(clamped);
      setBpmRaw(String(clamped));
    } else {
      setBpmRaw(String(bpm));
    }
  }, [bpm, bpmRaw]);

  if (loading) {
    return <div className={styles.message}>Loading…</div>;
  }
  if (error) {
    return <div className={styles.message}>{error}</div>;
  }
  if (!sheet || !mix) return null;

  const sheetSteps = sheet.barCount * STEPS_PER_BAR;
  const totalW = sheet.barCount * barW;
  const visibleW = Math.min(BARS_PER_PAGE, sheet.barCount) * barW;
  const translateX = -(pageBar * barW);

  // Bar numbers shown in the pager for the current page.
  const firstBar = pageBar + 1;
  const lastBar = Math.min(pageBar + BARS_PER_PAGE, sheet.barCount);

  return (
    <div className={styles.app}>
      {/* Grid area: ruler + part rows */}
      <div ref={gridRef} className={styles.gridArea}>
        {/* Ruler row */}
        <div className={styles.row}>
          <div className={styles.sidebarSpacer} style={{ width: BAND_SIDE_W }} />
          <div className={styles.viewport} style={{ width: visibleW }}>
            <div
              className={styles.slider}
              style={{ transform: `translateX(${translateX}px)`, width: totalW }}
            >
              <div className={styles.ruler}>
                {Array.from({ length: sheet.barCount }, (_, i) => (
                  <div
                    key={i}
                    className={styles.barLabel}
                    style={{ left: i * barW, width: barW }}
                  >
                    {i + 1}
                  </div>
                ))}
                <RulerPlayhead getStep={getPlayheadStep} cellW={cellW} />
              </div>
            </div>
          </div>
        </div>

        {/* Part rows */}
        {sheet.parts.map((part) => {
          const numRows = part.hi - part.lo + 1;
          return (
            <div key={part.id} className={styles.row}>
              <div
                className={styles.sidebar}
                style={{ width: BAND_SIDE_W, height: numRows * cellH }}
              >
                <span className={styles.partName}>{part.name}</span>
              </div>
              <div
                className={styles.viewport}
                style={{ width: visibleW, height: numRows * cellH }}
              >
                <div
                  className={styles.slider}
                  style={{ transform: `translateX(${translateX}px)` }}
                >
                  <Grid
                    part={part}
                    sheetSteps={sheetSteps}
                    scale={sheet.scale}
                    cellW={cellW}
                    cellH={cellH}
                    readOnly
                    annotations={annotationsByPart.get(part.id)}
                    getPlayheadStep={getPlayheadStep}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky toolbar */}
      <div className={styles.toolbar}>
        <button
          className={styles.toolBtn}
          onClick={() => void play(pageBar * STEPS_PER_BAR)}
          disabled={transport === "playing"}
        >
          Play
        </button>
        <button
          className={styles.toolBtn}
          onClick={stop}
          disabled={transport === "stopped"}
        >
          Stop
        </button>
        <button
          className={`${styles.toolBtn} ${repeat ? styles.active : ""}`}
          onClick={() => setRepeat((r) => !r)}
        >
          Repeat
        </button>
        <button className={styles.toolBtn} onClick={() => setMixerOpen(true)}>
          Mix
        </button>
        <label className={styles.bpmLabel}>
          BPM
          <input
            className={styles.bpmInput}
            type="number"
            min={20}
            max={300}
            value={bpmRaw}
            onChange={handleBpmChange}
            onBlur={handleBpmBlur}
          />
        </label>

        {sheet.barCount > BARS_PER_PAGE && (
          <>
            <div className={styles.toolbarSpacer} />
            <button
              className={styles.pagerArrow}
              onClick={() => handlePageChange(Math.max(0, page - BARS_PER_PAGE))}
              disabled={page === 0}
              aria-label="Previous bars"
            >
              ‹
            </button>
            <span className={styles.pagerBars}>
              {firstBar === lastBar ? firstBar : `${firstBar} ${lastBar}`}
            </span>
            <button
              className={styles.pagerArrow}
              onClick={() => handlePageChange(Math.min(page + BARS_PER_PAGE, sheet.barCount - BARS_PER_PAGE))}
              disabled={page >= sheet.barCount - BARS_PER_PAGE}
              aria-label="Next bars"
            >
              ›
            </button>
          </>
        )}
      </div>

      <ViewerMixerDialog
        sheet={sheet}
        mix={mix}
        open={mixerOpen}
        onClose={() => setMixerOpen(false)}
        onMixChange={setMix}
      />
    </div>
  );
}
