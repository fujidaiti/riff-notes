import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mix, Sheet } from "../core/model/types";
import { STEPS_PER_BAR } from "../core/model/constants";
import { AudioEngine } from "../audio/AudioEngine";
import { useCellSize } from "../ui/useCellSize";
import { useCellHover } from "../ui/useCellHover";
import { BAND_SIDE_W } from "../ui/Band";
import { Grid } from "../ui/grid/Grid";
import { AnnotationCard } from "../ui/Annotations";
import { noteFracStart } from "../core/timing";
import { loadProject } from "./loadProject";
import { useViewerTransport } from "./useViewerTransport";
import { ViewerMixerDialog } from "./ViewerMixerDialog";
import styles from "./ViewerApp.module.css";

const BARS_PER_PAGE = 2;

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
  const [hoveredAnnotId, setHoveredAnnotId] = useState<string | null>(null);

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

  const barW = cellW * STEPS_PER_BAR;
  const paddedBarCount = sheet ? sheet.barCount : 0;
  // `page` is the 0-indexed start bar of the visible window, not a page index.
  const pageBar = page;

  const { transport, repeat, setRepeat, play, stop, getPlayheadStep, isLoopingRef } =
    useViewerTransport(engine, sheet, mix, bpm, pageBar);

  // Hover tooltip + cell highlight. Pass !loading so the enabled flag flips
  // from false→true after the gridArea mounts, triggering the effect to run
  // with a non-null ref.
  useCellHover(gridRef, cellW, cellH, !loading);

  // Refs so the rAF callback always reads the latest values without stale closures.
  const pageRef = useRef(page);
  pageRef.current = page;
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;

  // Playhead monitor: runs every frame while a sheet is loaded.
  //
  // Mode A (isLoopingRef = false): engine plays the full sheet. The monitor
  // either auto-advances the page or switches to Mode B at the next bar boundary.
  //
  // Mode B (isLoopingRef = true): engine loops the trimmed 2-bar sheet
  // seamlessly via its own internal scheduling. The monitor does nothing unless
  // repeat is turned off, in which case it switches back to Mode A.
  //
  // Toggling repeat only flips repeatRef — no immediate engine call. The mode
  // switch happens at the next rAF tick (Mode B→A) or the next bar boundary
  // (Mode A→B), so the engine is never interrupted mid-measure by a toggle.
  useEffect(() => {
    if (!sheet) return;
    const totalPages = paddedBarCount;
    let rafId: number;
    const tick = () => {
      const cur = pageRef.current;
      if (isLoopingRef.current) {
        // Mode B: engine is looping seamlessly. Only act if repeat was turned off.
        if (!repeatRef.current) {
          void play(cur); // switch to Mode A from current page
          // isLoopingRef.current becomes false synchronously inside play()
        }
      } else {
        // Mode A: full-sheet playback — watch for boundary crossings.
        const step = getPlayheadStep();
        if (step !== null) {
          const playheadBar = Math.floor(step / STEPS_PER_BAR);
          if (playheadBar >= cur + BARS_PER_PAGE) {
            if (repeatRef.current) {
              void play(cur); // switch to Mode B (seamless loop from page start)
              // isLoopingRef.current becomes true synchronously inside play()
            } else {
              const next = Math.min(playheadBar, totalPages - BARS_PER_PAGE);
              if (next !== cur) {
                pageRef.current = next;
                setPage(next);
              }
            }
          } else if (playheadBar < cur) {
            // Backward jump (e.g. engine restarted from page change).
            const next = Math.max(0, Math.min(playheadBar, totalPages - BARS_PER_PAGE));
            if (next !== cur) {
              pageRef.current = next;
              setPage(next);
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [getPlayheadStep, isLoopingRef, sheet, paddedBarCount, play]);

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
      void play(newPage);
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

  const sheetSteps = paddedBarCount * STEPS_PER_BAR;
  const visibleW = Math.min(BARS_PER_PAGE, paddedBarCount) * barW;
  const translateX = -(pageBar * barW);

  // Bar numbers shown in the pager for the current page.
  const firstBar = pageBar + 1;
  const lastBar = Math.min(pageBar + BARS_PER_PAGE, paddedBarCount);

  return (
    <div className={styles.app}>
      {/* Grid area: part rows */}
      <div ref={gridRef} className={styles.gridArea}>
        {/* Part rows */}
        {sheet.parts.map((part) => {
          const numRows = part.hi - part.lo + 1;
          const partAnnotations = annotationsByPart.get(part.id);
          const noteById = new Map(part.notes.map((n) => [n.id, n]));
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
                    annotations={partAnnotations}
                    renderAnnotationCards={false}
                    getPlayheadStep={getPlayheadStep}
                    hoveredAnnotationId={hoveredAnnotId}
                    onAnnotationHover={setHoveredAnnotId}
                  />
                </div>
              </div>
              {/* Annotation cards rendered outside the clipping viewport */}
              {partAnnotations && partAnnotations.length > 0 && (
                <div className={styles.annotCardOverlay} style={{ left: BAND_SIDE_W }}>
                  {partAnnotations.map((a) => {
                    const anchor = noteById.get(a.placement.anchorNoteId);
                    if (!anchor) return null;
                    const anchorStep = noteFracStart(anchor);
                    if (anchorStep < pageBar * STEPS_PER_BAR || anchorStep >= (pageBar + BARS_PER_PAGE) * STEPS_PER_BAR) return null;
                    const x = anchorStep * cellW + a.placement.dx + translateX;
                    const y = (part.hi - anchor.pitch) * cellH + a.placement.dy;
                    return (
                      <AnnotationCard
                        key={a.id}
                        annotation={a}
                        x={x}
                        y={y}
                        active={hoveredAnnotId === a.id}
                        readOnly
                        onHover={setHoveredAnnotId}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarInner} style={{ width: BAND_SIDE_W + visibleW }}>
        <button
          data-testid="play-stop-btn"
          className={styles.toolBtn}
          onClick={transport === "playing" ? stop : () => void play()}
        >
          {transport === "playing" ? "Stop" : "Play"}
        </button>
        <button
          data-testid="repeat-btn"
          className={`${styles.toolBtn} ${repeat ? styles.active : ""}`}
          onClick={() => setRepeat((r) => !r)}
        >
          Repeat
        </button>
        <button data-testid="mix-btn" className={styles.toolBtn} onClick={() => setMixerOpen(true)}>
          Mix
        </button>
        <label className={styles.bpmLabel}>
          BPM
          <input
            data-testid="bpm-input"
            className={styles.bpmInput}
            type="number"
            min={20}
            max={300}
            value={bpmRaw}
            onChange={handleBpmChange}
            onBlur={handleBpmBlur}
          />
        </label>

        {paddedBarCount > BARS_PER_PAGE && (
          <>
            <div className={styles.toolbarSpacer} />
            <button
              data-testid="pager-prev"
              className={styles.pagerArrow}
              onClick={() => handlePageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Previous bars"
            >
              ‹
            </button>
            <span data-testid="pager-bars" className={styles.pagerBars}>
              {firstBar === lastBar ? firstBar : `${firstBar} ${lastBar}`}
            </span>
            <button
              data-testid="pager-next"
              className={styles.pagerArrow}
              onClick={() => handlePageChange(Math.min(page + 1, paddedBarCount - BARS_PER_PAGE))}
              disabled={page >= paddedBarCount - BARS_PER_PAGE}
              aria-label="Next bars"
            >
              ›
            </button>
          </>
        )}
        </div>
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
