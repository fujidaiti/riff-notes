import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/theme.css";
import { AppProvider } from "./state/context";
import { App } from "./editor/App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
