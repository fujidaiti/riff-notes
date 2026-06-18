import type { Project } from "../core/model/types";
import { STORAGE_KEY, deserializeProject, serializeProject } from "../core/serialize";

// Thin localStorage wrapper around the (tested) serialize boundary. Kept I/O
// only — the interesting logic is in core/serialize, which the tests cover.
const LEGACY_KEY = "midi-editor:state";
const SAVED_AT_KEY = "riff-notes:saved-at";

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Project | null = null;

function write(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject(project)));
    localStorage.setItem(SAVED_AT_KEY, String(Date.now()));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

/** Load the persisted project, or null if absent/incompatible. */
export function loadProject(): Project | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    // Clean break from the legacy format: discard any old data so it doesn't
    // linger. deserializeProject would reject it anyway (different schema).
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    return deserializeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the project, debounced (300ms) to coalesce rapid edits. */
export function saveProject(project: Project): void {
  pending = project;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (pending) write(pending);
    pending = null;
  }, 300);
}

/** Force any pending debounced save to flush now (e.g. on pagehide). */
export function flushSave(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  if (pending) write(pending);
  pending = null;
}
