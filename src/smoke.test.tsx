import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { AppProvider } from "./state/context";
import { App } from "./editor/App";

// A server-render smoke test: catches import/runtime wiring errors across the
// editor tree without needing a browser or jsdom. It asserts the tree mounts
// and produces output, not specific DOM (component DOM is left untested per
// the testing strategy).
describe("render smoke", () => {
  it("renders the editor without throwing", () => {
    const html = renderToString(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    expect(html).toContain("Project name");
  });
});
