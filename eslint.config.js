import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Architectural boundary: src/core, src/ui, src/audio must never import from
// src/editor. This is what keeps editor-only code (pointer/keyboard/MIDI/undo)
// out of the read-only embed bundle. The viewer imports only core/ui/audio.
const noEditorImports = {
  files: ["src/core/**", "src/ui/**", "src/audio/**", "src/viewer/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/editor/**", "**/editor"],
            message:
              "core/ui/audio/viewer must not import from editor (keeps editor code out of the embed bundle).",
          },
        ],
      },
    ],
  },
};

// core must additionally stay free of React and the rest of the app shell.
const coreIsPure = {
  files: ["src/core/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["react", "react-dom", "**/editor/**", "**/ui/**", "**/state/**", "**/audio/**"],
            message: "src/core must stay framework-agnostic and dependency-free.",
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ["dist", "index.html.legacy", "node_modules"] },
  noEditorImports,
  coreIsPure,
);
