import { useCallback, useEffect, useRef, useState } from "react";
import type { Mix, Sheet } from "../core/model/types";
import { STEPS_PER_BAR } from "../core/model/constants";
import type { AudioEngine } from "../audio/AudioEngine";

export type TransportState = "stopped" | "playing";

const BARS_PER_PAGE = 2;

/**
 * Returns a copy of the sheet containing only the notes in [startBar, startBar + barCount),
 * with step positions shifted so startBar becomes step 0.
 */
function trimSheetToBars(sheet: Sheet, mix: Mix, startBar: number, barCount: number): Sheet {
  const fromStep = startBar * STEPS_PER_BAR;
  const toStep = (startBar + barCount) * STEPS_PER_BAR;
  return {
    ...sheet,
    mix,
    barCount,
    annotations: [],
    parts: sheet.parts.map((part) => ({
      ...part,
      notes: part.notes
        .filter((n) => n.start >= fromStep && n.start < toStep)
        .map((n) => ({ ...n, start: n.start - fromStep })),
    })),
  };
}

/**
 * Drives the AudioEngine for the viewer.
 *
 * Two playback modes, chosen at play()-time by the current repeat setting:
 *
 *   Mode A (repeat off): plays the full sheet from pageBar; the rAF monitor in
 *   ViewerApp auto-advances the page as the playhead progresses.
 *
 *   Mode B (repeat on): plays a 2-bar trimmed sheet with engine repeat:true, so
 *   the engine schedules the next iteration at the precise endStepTime — no
 *   teardown between loops, no audible gap.
 *
 * isLoopingRef records which mode the engine is *actually* running right now
 * (set synchronously before each engine.play() call). Toggling the repeat button
 * only flips the UI flag; the ViewerApp rAF monitor reads both flags and
 * performs a mode switch at the next bar boundary.
 */
export function useViewerTransport(
  engine: AudioEngine,
  sheet: Sheet | null,
  mix: Mix | null,
  bpm: number,
  pageBar: number,
) {
  const [transport, setTransport] = useState<TransportState>("stopped");
  const [repeat, setRepeat] = useState(false);

  const ref = useRef({ sheet, mix, bpm, repeat, pageBar });
  ref.current = { sheet, mix, bpm, repeat, pageBar };

  // Tracks what the engine is actually doing right now (captured at play()-time).
  // Setting it synchronously before the await means the rAF monitor sees the new
  // mode immediately, preventing multiple play() calls before the async settles.
  const isLoopingRef = useRef(false);

  const play = useCallback(async (pageBarOverride?: number) => {
    const { sheet, mix, bpm, repeat, pageBar } = ref.current;
    if (!sheet || !mix) return;
    const effectivePage = pageBarOverride ?? pageBar;
    const looping = repeat;

    isLoopingRef.current = looping; // set before await so rAF sees it immediately

    const sheetToPlay = looping
      ? trimSheetToBars(sheet, mix, effectivePage, BARS_PER_PAGE)
      : { ...sheet, mix };

    await engine.play(sheetToPlay, {
      fromStep: looping ? 0 : effectivePage * STEPS_PER_BAR,
      bpmOverride: bpm,
      repeat: looping, // engine handles seamless looping in Mode B
      onEnd: () => {
        isLoopingRef.current = false;
        setTransport("stopped");
      },
    });
    setTransport("playing");
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
    isLoopingRef.current = false;
    setTransport("stopped");
  }, [engine]);

  // Push live mix changes to the running audio graph.
  useEffect(() => {
    if (engine.isPlaying && sheet && mix) engine.syncMix({ ...sheet, mix });
  }, [engine, mix, sheet]);

  // Stop engine when unmounting or when the sheet changes.
  useEffect(() => {
    return () => engine.stop();
  }, [engine, sheet]);

  // In Mode B the engine reports steps relative to the trimmed sheet [0, 2*SPB).
  // Offset by pageBar so the playhead renders at the correct full-sheet position.
  const getPlayheadStep = useCallback(() => {
    const step = engine.currentStep();
    if (step === null) return null;
    return isLoopingRef.current ? ref.current.pageBar * STEPS_PER_BAR + step : step;
  }, [engine]);

  return { transport, repeat, setRepeat, play, stop, getPlayheadStep, isLoopingRef };
}
