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
  const pausedStep = useRef(0);
  // Keep the latest sheet/repeat for the onEnd callback and Space handler.
  const ref = useRef({ sheet, repeat });
  ref.current = { sheet, repeat };

  const play = useCallback(() => {
    const fromStep = transport === "paused" ? pausedStep.current : 0;
    engine.play(ref.current.sheet, {
      fromStep,
      repeat: ref.current.repeat,
      onEnd: () => setTransport("stopped"),
    });
    setTransport("playing");
  }, [engine, transport]);

  const pause = useCallback(() => {
    pausedStep.current = engine.pause();
    setTransport("paused");
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
    pausedStep.current = 0;
    setTransport("stopped");
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

  return { transport, repeat, setRepeat, play, pause, stop, getPlayheadStep };
}
