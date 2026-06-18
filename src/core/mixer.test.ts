import { describe, expect, it } from "vitest";
import { effectiveMasterValue, effectivePartGain } from "./mixer";
import type { Mix } from "./model/types";

const mix = (over: Partial<Mix> = {}): Mix => ({
  master: { vol: 1, mute: false },
  parts: {
    a: { vol: 0.8, mute: false, solo: false },
    b: { vol: 0.5, mute: false, solo: false },
  },
  ...over,
});

describe("effectivePartGain", () => {
  it("returns the part volume when nothing mutes it", () => {
    expect(effectivePartGain(mix(), "a")).toBe(0.8);
  });
  it("returns 0 when master is muted", () => {
    expect(effectivePartGain(mix({ master: { vol: 1, mute: true } }), "a")).toBe(0);
  });
  it("returns 0 when the part is muted", () => {
    const m = mix();
    m.parts.a.mute = true;
    expect(effectivePartGain(m, "a")).toBe(0);
  });
  it("silences non-soloed parts when any part is soloed", () => {
    const m = mix();
    m.parts.b.solo = true;
    expect(effectivePartGain(m, "a")).toBe(0);
    expect(effectivePartGain(m, "b")).toBe(0.5);
  });
  it("defaults to full gain with no mix", () => {
    expect(effectivePartGain(null, "a")).toBe(1);
  });
});

describe("effectiveMasterValue", () => {
  it("is the master volume, or 0 when muted", () => {
    expect(effectiveMasterValue(mix({ master: { vol: 0.6, mute: false } }))).toBe(0.6);
    expect(effectiveMasterValue(mix({ master: { vol: 0.6, mute: true } }))).toBe(0);
  });
});
