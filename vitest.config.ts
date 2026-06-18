import { defineConfig } from "vitest/config";

// Core/state logic is framework- and DOM-free, so the default node environment
// is enough and keeps the suite fast. It also proves src/core never reaches for
// the DOM. Tests are co-located next to the modules they cover.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
