/**
 * Pure scheduling logic shared (in spirit) with the TSF AudioWorklet.
 *
 * The worklet holds a queue of synth events each tagged with an absolute sample
 * index (`atSample`). On every render block it must decide which queued events
 * have come due. That selection is the one piece of timing logic worth testing
 * in isolation, so it lives here as a dependency-free function on the `core`
 * test surface. The worklet (plain JS in public/, which cannot import from src/)
 * duplicates this tiny algorithm inline; this version is the source of truth.
 */

/** A synth event to apply at an absolute sample position. */
export interface ScheduledEvent {
  /** Absolute sample index (relative to the worklet's sample clock). */
  atSample: number;
  kind: "on" | "off" | "cc";
  channel: number;
  /** Note key for on/off, or controller number for cc. */
  key: number;
  /** Velocity (on) or controller value (cc); unused for off. */
  value?: number;
}

export interface DrainResult {
  /** Events due in [, blockEnd) — i.e. atSample < blockEnd. */
  fired: ScheduledEvent[];
  /** Events still pending (atSample >= blockEnd), order preserved. */
  remaining: ScheduledEvent[];
}

/**
 * Partition `queue` into events due before `blockEnd` and those still pending.
 *
 * An event fires when `atSample < blockEnd` (block-granular timing: anything
 * whose time falls within the current render block is applied at block start).
 * The boundary is exclusive, so an event exactly at `blockEnd` defers to the
 * next block. Input order is preserved within each partition, so same-sample
 * events keep their enqueue order (e.g. note-off before a re-trigger note-on).
 *
 * `blockStart` is accepted for symmetry/readability at the call site; due-ness
 * depends only on `blockEnd` because past-due events (atSample < blockStart)
 * must still fire rather than be dropped.
 */
export function dueEvents(
  queue: readonly ScheduledEvent[],
  blockStart: number,
  blockEnd: number,
): DrainResult {
  void blockStart;
  const fired: ScheduledEvent[] = [];
  const remaining: ScheduledEvent[] = [];
  for (const ev of queue) {
    if (ev.atSample < blockEnd) fired.push(ev);
    else remaining.push(ev);
  }
  return { fired, remaining };
}
