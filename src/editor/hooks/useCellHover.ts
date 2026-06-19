import { useEffect } from "react";
import { RHYTHM_NAMES, SUB_PER_STEP, VEL_LABELS } from "../../core/model/constants";
import { getInstrument } from "../../core/model/constants";
import { pitchName } from "../../core/theory";

// Format a length in steps as "N", or "N+a/b" / "a/b" when fractional (the
// sub-step part reduced; e.g. 1.25 -> "1+1/4", 0.5 -> "1/2").
function formatLengthSteps(steps: number): string {
  const totalSub = Math.round(steps * SUB_PER_STEP);
  const whole = Math.floor(totalSub / SUB_PER_STEP);
  const sub = totalSub - whole * SUB_PER_STEP;
  if (sub === 0) return `${whole}`;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(sub, SUB_PER_STEP);
  const frac = `${sub / d}/${SUB_PER_STEP / d}`;
  return whole === 0 ? frac : `${whole}+${frac}`;
}

/**
 * Hover tooltip + cell-highlight box for the grids. Fully imperative (DOM nodes
 * appended to body, moved on pointermove) so cursor tracking never re-renders
 * React. Active only while `enabled` (suppressed during playback/recording).
 */
export function useCellHover(scrollRef: React.RefObject<HTMLElement | null>, cellW: number, cellH: number, enabled: boolean) {
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !enabled) return;

    let cmdHeld = false;
    const onKeyDown = (ev: KeyboardEvent) => { if (ev.key === "Meta" || ev.key === "Control") cmdHeld = true; };
    const onKeyUp   = (ev: KeyboardEvent) => { if (ev.key === "Meta" || ev.key === "Control") cmdHeld = false; };
    const onBlur = () => { cmdHeld = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    window.addEventListener("blur",    onBlur);

    const tip = document.createElement("div");
    tip.style.cssText =
      "position:fixed;pointer-events:none;background:var(--tooltip-bg);border:1px solid var(--line);border-radius:4px;box-shadow:0 2px 6px var(--shadow-soft);padding:3px 6px;font:11px/1.3 system-ui;color:var(--tooltip-ink);z-index:9999;white-space:nowrap;display:none;";
    const hover = document.createElement("div");
    hover.style.cssText =
      "position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid var(--note-sel-outline);border-radius:2px;z-index:1;display:none;";
    document.body.append(tip, hover);

    let lastNoteEl: HTMLElement | null = null;

    const clearNoteCursor = () => {
      if (lastNoteEl) { lastNoteEl.style.cursor = ""; lastNoteEl = null; }
    };

    const hide = () => {
      tip.style.display = "none";
      hover.style.display = "none";
      clearNoteCursor();
    };

    const onMove = (ev: PointerEvent) => {
      // Suppress tooltip and hover box while any pointer button is held (drag/resize).
      if (ev.buttons > 0) {
        tip.style.display = "none";
        hover.style.display = "none";
        clearNoteCursor();
        return;
      }

      const target = ev.target as HTMLElement | null;
      const wrap = target?.closest<HTMLElement>("[data-part-id]");
      if (!wrap) { clearNoteCursor(); return hide(); }
      const rect = wrap.getBoundingClientRect();
      const partHi = parseInt(wrap.dataset.partHi ?? "", 10);
      const partLo = parseInt(wrap.dataset.partLo ?? "", 10);
      const numRows = partHi - partLo + 1;
      const rowIdx = Math.floor((ev.clientY - rect.top) / cellH);
      if (rowIdx < 0 || rowIdx >= numRows) return hide();
      const pitch = partHi - rowIdx;
      const stepAbs = Math.floor((ev.clientX - rect.left) / cellW);
      const isRhythm = getInstrument(wrap.dataset.instrument ?? "").pitchMode === "fixed";

      // Tooltip text: pitch (+ velocity/length when hovering a note).
      const noteEl = target?.closest<HTMLElement>("[data-note-id]");

      // Update resize cursor when cmd/ctrl is held over a note.
      if (lastNoteEl && lastNoteEl !== noteEl) clearNoteCursor();
      if (noteEl && wrap.contains(noteEl)) {
        if (cmdHeld) {
          const noteRect = noteEl.getBoundingClientRect();
          noteEl.style.cursor = ev.clientX - noteRect.left < noteRect.width / 2 ? "w-resize" : "e-resize";
        } else {
          noteEl.style.cursor = "";
        }
        lastNoteEl = noteEl;
      }

      // Hide the cell highlight box when hovering a selected note (it already
      // has its own selection outline) to avoid double-border clutter.
      if (noteEl && noteEl.dataset.selected === "1") {
        hover.style.display = "none";
      } else {
        hover.style.display = "block";
        hover.style.left = `${rect.left + stepAbs * cellW}px`;
        hover.style.top = `${rect.top + rowIdx * cellH}px`;
        hover.style.width = `${cellW + 1}px`;
        hover.style.height = `${cellH}px`;
      }
      let velLabel = "";
      let lenLabel = "";
      if (noteEl && wrap.contains(noteEl)) {
        const v = parseInt(noteEl.dataset.vel ?? "", 10);
        if (Number.isFinite(v)) velLabel = VEL_LABELS[v];
        const l = parseFloat(noteEl.dataset.len ?? "");
        if (Number.isFinite(l) && !isRhythm) lenLabel = formatLengthSteps(l);
      }
      const pitchLabel = isRhythm ? RHYTHM_NAMES[partHi - pitch] ?? "" : pitchName(pitch);
      tip.textContent = pitchLabel + (velLabel ? `  ${velLabel}` : "") + (lenLabel ? `  ${lenLabel}` : "");

      tip.style.display = "block";
      const offX = 12;
      const offY = 14;
      let left = ev.clientX + offX;
      let top = ev.clientY + offY;
      if (left + tip.offsetWidth > window.innerWidth - 4) left = ev.clientX - tip.offsetWidth - offX;
      if (top + tip.offsetHeight > window.innerHeight - 4) top = ev.clientY - tip.offsetHeight - offY;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", hide);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", hide);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      window.removeEventListener("blur",    onBlur);
      tip.remove();
      hover.remove();
    };
  }, [scrollRef, cellW, cellH, enabled]);
}
