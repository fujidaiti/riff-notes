import { useCallback, useEffect, useRef, useState } from "react";
import type { Sheet } from "../../core/model/types";
import type { AudioEngine } from "../../audio/AudioEngine";

export type TransportState = "stopped" | "playing" | "paused";

/**
 * Drives the AudioEngine transport and exposes a stable getPlayheadStep() the
 * grids poll from their own rAF. Transport *state* (a low-frequency value) goes
 * through React; the playhead *position* does not.
 */
export function useTransport(engine: AudioEngine, sheet: Sheet) {
  const [transport, setTransport] = useState<TransportState>("stopped");
  const [repeat, setRepeat] = useState(false);
  // Unified cursor: where playback starts from (also updated on pause/seek).
  const cursorStep = useRef(0);
  // Exposed as React state so the ruler re-renders on seek/pause/stop.
  const [displayCursor, setDisplayCursor] = useState(0);
  // Keep the latest sheet/repeat/transport for callbacks (avoids stale closures).
  const ref = useRef({ sheet, repeat, transport: "stopped" as TransportState });
  ref.current = { sheet, repeat, transport };

  const play = useCallback(() => {
    const fromStep = cursorStep.current;
    engine.play(ref.current.sheet, {
      fromStep,
      repeat: ref.current.repeat,
      onEnd: () => {
        cursorStep.current = 0;
        setDisplayCursor(0);
        setTransport("stopped");
      },
    });
    setTransport("playing");
  }, [engine]);

  const pause = useCallback(() => {
    const step = engine.pause();
    cursorStep.current = step;
    setDisplayCursor(step);
    setTransport("paused");
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
    cursorStep.current = 0;
    setDisplayCursor(0);
    setTransport("stopped");
  }, [engine]);

  const seekTo = useCallback((step: number) => {
    cursorStep.current = step;
    setDisplayCursor(step);
    if (ref.current.transport === "playing") {
      engine.play(ref.current.sheet, {
        fromStep: step,
        repeat: ref.current.repeat,
        onEnd: () => {
          cursorStep.current = 0;
          setDisplayCursor(0);
          setTransport("stopped");
        },
      });
    }
  }, [engine]);

  // Stop audio when unmounting or switching sheets.
  useEffect(() => {
    return () => engine.stop();
  }, [engine]);

  // Space toggles play/pause; not when typing in a field.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== "Space") return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      ev.preventDefault();
      if (engine.isPlaying) pause();
      else play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, play, pause]);

  const getPlayheadStep = useCallback(() => engine.currentStep(), [engine]);

  return { transport, repeat, setRepeat, play, pause, stop, seekTo, displayCursor, getPlayheadStep };
}
