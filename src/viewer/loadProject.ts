import type { Project, Sheet } from "../core/model/types";
import { deserializeProject } from "../core/serialize";

export interface LoadedProject {
  project: Project;
  sheet: Sheet;
}

/**
 * Loads a project for the viewer from the URL.
 *
 * URL format: view.html?src=<path-to-file.json>&sheet=<sheet-id>
 *
 * If the page pathname ends in ".json" (SPA deployment where the server routes
 * all *.json requests to view.html), the pathname is used as the source instead
 * of the ?src= param. The ?sheet= param selects which sheet to display; if
 * omitted the first sheet is shown.
 */
export async function loadProject(): Promise<LoadedProject> {
  const params = new URLSearchParams(window.location.search);

  let src = params.get("src");
  if (!src) {
    const path = window.location.pathname;
    if (path.endsWith(".json")) src = path;
  }
  if (!src) {
    throw new Error("No project specified — add ?src=file.json to the URL.");
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not load "${src}" (HTTP ${res.status}).`);

  const raw: unknown = await res.json();
  const project = deserializeProject(raw);
  if (!project) throw new Error("The file is not a valid Riff Notes project.");

  const sheetId = params.get("sheet");
  const sheet =
    (sheetId ? project.sheets.find((s) => s.id === sheetId) : null) ??
    project.sheets[0];
  if (!sheet) throw new Error("No sheet found in the project.");

  return { project, sheet };
}

/**
 * Reads the `?bars=` query param. Returns a positive integer, or 1 if the
 * param is missing, non-numeric, non-integer, or less than 1.
 */
export function readBarsPerPage(): number {
  const raw = new URLSearchParams(window.location.search).get("bars");
  if (raw === null) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Reads the `?scale=` query param. Returns a float clamped to [0.5, 1.0],
 * or 1 if the param is missing or invalid.
 */
export function readScale(): number {
  const raw = new URLSearchParams(window.location.search).get("scale");
  if (raw === null) return 1;
  const n = Number(raw);
  if (isNaN(n)) return 1;
  return Math.min(1, Math.max(0.5, n));
}
