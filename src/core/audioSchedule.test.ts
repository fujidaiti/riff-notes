import { describe, expect, it } from "vitest";
import { dueEvents, type ScheduledEvent } from "./audioSchedule";

const ev = (atSample: number, over: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  atSample,
  kind: "on",
  channel: 0,
  key: 60,
  value: 100,
  ...over,
});

const BLOCK = 128;

describe("dueEvents", () => {
  it("fires events whose sample falls within the block", () => {
    const queue = [ev(0), ev(50), ev(127)];
    const { fired, remaining } = dueEvents(queue, 0, BLOCK);
    expect(fired.map((e) => e.atSample)).toEqual([0, 50, 127]);
    expect(remaining).toEqual([]);
  });

  it("defers events at or beyond the block end (exclusive boundary)", () => {
    const queue = [ev(127), ev(128), ev(200)];
    const { fired, remaining } = dueEvents(queue, 0, BLOCK);
    expect(fired.map((e) => e.atSample)).toEqual([127]);
    expect(remaining.map((e) => e.atSample)).toEqual([128, 200]);
  });

  it("does not fire future events early", () => {
    const queue = [ev(500), ev(640)];
    const { fired, remaining } = dueEvents(queue, 0, BLOCK);
    expect(fired).toEqual([]);
    expect(remaining.map((e) => e.atSample)).toEqual([500, 640]);
  });

  it("fires past-due events (sample before the block start)", () => {
    // A block from 256..384; an event scheduled at 100 was missed and must
    // still fire rather than be dropped.
    const queue = [ev(100), ev(300)];
    const { fired, remaining } = dueEvents(queue, 256, 384);
    expect(fired.map((e) => e.atSample)).toEqual([100, 300]);
    expect(remaining).toEqual([]);
  });

  it("preserves enqueue order for same-sample events", () => {
    // note-off enqueued before the re-trigger note-on at the same sample must
    // stay ordered so the channel retriggers cleanly.
    const off = ev(64, { kind: "off", value: undefined });
    const on = ev(64, { kind: "on" });
    const { fired } = dueEvents([off, on], 0, BLOCK);
    expect(fired).toEqual([off, on]);
  });

  it("is a no-op on an empty queue", () => {
    const { fired, remaining } = dueEvents([], 0, BLOCK);
    expect(fired).toEqual([]);
    expect(remaining).toEqual([]);
  });
});
