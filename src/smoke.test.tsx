import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { AppProvider } from "./state/context";
import { App } from "./editor/App";
import { EmbedApp } from "./viewer/EmbedApp";

// A server-render smoke test: catches import/runtime wiring errors across the
// editor and embed trees without needing a browser or jsdom. It asserts the
// trees mount and produce output, not specific DOM (component DOM is left
// untested per the testing strategy).
describe("render smoke", () => {
  it("renders the editor without throwing", () => {
    const html = renderToString(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    expect(html).toContain("Project name");
  });

  it("renders the read-only embed viewer without throwing", () => {
    const html = renderToString(<EmbedApp />);
    expect(html).toContain("Demo");
  });
});
