import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Editor bootstrap. The editor App shell is built in a later migration phase;
// for now this mounts a placeholder so the Vite editor entry builds and runs.
const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <main style={{ font: "14px system-ui", padding: 24 }}>
      <h1>Riff Notes</h1>
      <p>Editor migration in progress.</p>
    </main>
  </StrictMode>,
);
