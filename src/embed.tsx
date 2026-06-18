import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/theme.css";
import { EmbedApp } from "./viewer/EmbedApp";

// Read-only viewer bootstrap (iframe target). Imports only from core/ui/viewer
// — never src/editor — so the embed bundle stays free of editor-only code.
const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <EmbedApp />
  </StrictMode>,
);
