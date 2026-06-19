import { useCallback, useEffect, useRef, useState } from "react";
import type { Mix, Sheet } from "../core/model/types";
import type { AudioEngine } from "../audio/AudioEngine";

export type TransportState = "stopped" | "playing";

/**
 * Drives the AudioEngine for the viewer. Mirrors editor/hooks/useTransport but
 * has no Redux dependency and supports a BPM override and a separate Mix that
 * lives in local viewer state (not persisted).
 */
export function useViewerTransport(
  engine: AudioEngine,
  sheet: Sheet | null,
  mix: Mix | null,
  bpm: number,
) {
  const [transport, setTransport] = useState<TransportState>("stopped");
  const [repeat, setRepeat] = useState(false);

  // Keep latest values available to stable callbacks without re-creating them.
  const ref = useRef({ sheet, mix, bpm, repeat });
  ref.current = { sheet, mix, bpm, repeat };

  const merged = (): Sheet => ({ ...ref.current.sheet!, mix: ref.current.mix! });

  const play = useCallback(async () => {
    if (!ref.current.sheet || !ref.current.mix) return;
    await engine.play(merged(), {
      bpmOverride: ref.current.bpm,
      repeat: ref.current.repeat,
      onEnd: () => setTransport("stopped"),
    });
    setTransport("playing");
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
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

  const getPlayheadStep = useCallback(() => engine.currentStep(), [engine]);

  return { transport, repeat, setRepeat, play, stop, getPlayheadStep };
}
