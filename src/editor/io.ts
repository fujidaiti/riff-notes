import type { Project, Sheet } from "../core/model/types";
import { deserializeProject, serializeProject } from "../core/serialize";
import { buildSheetMidi } from "../core/midi";

/** Save the project as a JSON file, using the Save As picker on Chromium. */
export async function downloadProjectJson(project: Project): Promise<void> {
  const json = JSON.stringify(serializeProject(project), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const filename = `${project.name || "riff-notes"}.json`;

  const picker = (window as Window & { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: "JSON file", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: unknown) {
      // User cancelled (AbortError) — fall through to nothing. Any other error: alert.
      if ((err as { name?: string }).name === "AbortError") return;
      alert(`Failed to save JSON: ${(err as Error).message}`);
      return;
    }
  }

  // Fallback for Firefox / Safari: trigger a plain download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download the active sheet as a Standard MIDI File (.mid). */
export function downloadSheetMidi(sheet: Sheet): void {
  const bytes = buildSheetMidi(sheet);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (sheet.title || "sheet").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "sheet";
  a.download = `${safe}.mid`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Prompt for a JSON file and parse it into a Project (null if invalid). */
export function pickProjectJson(): Promise<Project | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(deserializeProject(JSON.parse(String(reader.result))));
        } catch {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
