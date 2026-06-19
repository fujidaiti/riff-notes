import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/theme.css";
import { ViewerApp } from "./viewer/ViewerApp";

// Read-only viewer entry (iframe target for blog embeds). Only imports from
// core / ui / audio / viewer — never from editor — so editor code is tree-shaken
// out of this bundle.
const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <ViewerApp />
  </StrictMode>,
);
