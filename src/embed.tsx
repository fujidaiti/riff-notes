import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Read-only viewer bootstrap (iframe target). Must only ever import from
// core/ui/audio — never from src/editor — so the embed bundle stays free of
// editor-only code. The EmbedApp is built in a later migration phase.
const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <main style={{ font: "14px system-ui", padding: 24 }}>
      <h1>Riff Notes — Embed</h1>
      <p>Read-only viewer migration in progress.</p>
    </main>
  </StrictMode>,
);
