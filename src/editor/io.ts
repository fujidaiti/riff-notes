import type { Project } from "../core/model/types";
import { deserializeProject, serializeProject } from "../core/serialize";

/** Download the project as a JSON file. */
export function downloadProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(serializeProject(project), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name || "riff-notes"}.json`;
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
