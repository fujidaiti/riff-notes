import { useMemo } from "react";
import type { Project } from "../core/model/types";
import { makeSheet } from "../core/model/factory";
import { SheetView } from "../ui/SheetView";
import { useCellSize } from "../ui/useCellSize";
import { hydrateProject } from "./hydrate";

// A small built-in project so opening embed.html with no data still renders
// something meaningful (and serves as a visual reference for the read-only
// grid). Real embeds supply a project via window.__RIFF_PROJECT__ or ?p=.
function demoProject(): Project {
  const sheet = makeSheet("Demo");
  const part = sheet.parts[0];
  const add = (pitch: number, start: number, length = 1) =>
    part.notes.push({ id: `d${pitch}-${start}`, partId: part.id, pitch, start, length, vel: 2, subOffset: 0, subLength: 0 });
  // a C-major arpeggio
  [60, 64, 67, 72].forEach((p, i) => add(p, i * 2, 2));
  return { name: "Demo", sheets: [sheet] };
}

export function EmbedApp() {
  const { cellW, cellH } = useCellSize();
  const project = useMemo(() => hydrateProject() ?? demoProject(), []);

  return (
    <div style={{ padding: 16 }}>
      {project.sheets.map((sheet) => (
        <section key={sheet.id} style={{ marginBottom: 20 }}>
          <h2 style={{ font: "600 15px system-ui", margin: "0 0 8px" }}>{sheet.title}</h2>
          <SheetView sheet={sheet} cellW={cellW} cellH={cellH} readOnly />
        </section>
      ))}
    </div>
  );
}
