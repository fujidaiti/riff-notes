import { beforeEach, describe, expect, it } from "vitest";
import { LEGACY_SCHEMA_VERSION, SCHEMA_VERSION, deserializeProject, serializeProject } from "./serialize";
import { makeSheet } from "./model/factory";
import { resetUidCounter } from "./model/uid";
import type { Project } from "./model/types";

const sampleProject = (): Project => {
  const sheet = makeSheet("S1");
  const part = sheet.parts[0];
  part.notes.push({ id: "n1", partId: part.id, pitch: 60, start: 0, length: 2, vel: 3, subOffset: 1, subLength: 2 });
  sheet.annotations.push({
    id: "a1",
    text: "hi",
    noteIds: ["n1"],
    shrunkWidth: 140,
    placement: { anchorNoteId: "n1", dx: 5, dy: -3 },
  });
  return { name: "Proj", sheets: [sheet] };
};

beforeEach(() => resetUidCounter());

describe("serialize/deserialize round-trip", () => {
  it("preserves the project through a JSON round-trip", () => {
    const p = sampleProject();
    const restored = deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))));
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe("Proj");
    expect(restored!.sheets[0].title).toBe("S1");
    const note = restored!.sheets[0].parts[0].notes[0];
    expect(note).toMatchObject({ pitch: 60, start: 0, length: 2, vel: 3, subOffset: 1, subLength: 2 });
    expect(restored!.sheets[0].annotations[0]).toMatchObject({ text: "hi", noteIds: ["n1"] });
  });

  it("tags the document with the current schema version", () => {
    expect(serializeProject(sampleProject()).version).toBe(SCHEMA_VERSION);
  });
});

describe("deserialize validation", () => {
  it("rejects an unknown schema version", () => {
    const doc = serializeProject(sampleProject());
    expect(deserializeProject({ ...doc, version: 999 })).toBeNull();
  });

  it("accepts the legacy schema version " + LEGACY_SCHEMA_VERSION, () => {
    const doc = serializeProject(sampleProject());
    const result = deserializeProject({ ...doc, version: LEGACY_SCHEMA_VERSION });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Proj");
  });
  it("rejects malformed input", () => {
    expect(deserializeProject(null)).toBeNull();
    expect(deserializeProject({ version: SCHEMA_VERSION, sheets: [] })).toBeNull();
    expect(deserializeProject({ version: SCHEMA_VERSION })).toBeNull();
  });

  it("coerces drum-part note lengths to 1", () => {
    const doc = serializeProject(sampleProject()) as unknown as Record<string, unknown>;
    const sheets = doc.sheets as Record<string, unknown>[];
    const parts = sheets[0].parts as Record<string, unknown>[];
    parts[0].instrument = "drum";
    (parts[0].notes as Record<string, unknown>[])[0].length = 4;
    const restored = deserializeProject(doc)!;
    expect(restored.sheets[0].parts[0].notes[0].length).toBe(1);
  });

  it("clamps sub-step fields into range", () => {
    const doc = serializeProject(sampleProject()) as unknown as Record<string, unknown>;
    const note = ((((doc.sheets as Record<string, unknown>[])[0].parts as Record<string, unknown>[])[0]
      .notes as Record<string, unknown>[])[0]);
    note.subOffset = 99;
    note.subLength = -5;
    const out = deserializeProject(doc)!.sheets[0].parts[0].notes[0];
    expect(out.subOffset).toBe(3);
    expect(out.subLength).toBe(0);
  });

  it("drops annotations with an invalid placement", () => {
    const doc = serializeProject(sampleProject()) as unknown as Record<string, unknown>;
    const ann = ((doc.sheets as Record<string, unknown>[])[0].annotations as Record<string, unknown>[])[0];
    (ann.placement as Record<string, unknown>).anchorNoteId = "missing";
    expect(deserializeProject(doc)!.sheets[0].annotations).toHaveLength(0);
  });
});
