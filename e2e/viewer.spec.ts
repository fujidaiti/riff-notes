import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const BASE = "/riff-notes";

function fixtureJson(name: string) {
  return readFileSync(resolve(import.meta.dirname, "fixtures", name), "utf-8");
}

async function routeFixture(page: Page, name: string) {
  const body = fixtureJson(name);
  await page.route(
    (url) => url.pathname.endsWith(`/${name}`),
    (route) => route.fulfill({ contentType: "application/json", body }),
  );
}

/** Navigate to the viewer and wait until at least one note is rendered. */
async function loadViewer(page: Page) {
  await routeFixture(page, "viewer-test.json");
  await page.goto(`${BASE}/view.html?src=${BASE}/viewer-test.json`);
  await page.locator("[data-note-id]").first().waitFor();
}

// ── Loading ──────────────────────────────────────────────────────────────────

test("shows error when ?src= is missing", async ({ page }) => {
  await page.goto(`${BASE}/view.html`);
  await expect(page.getByText("No project specified")).toBeVisible();
});

test("renders the grid after loading a valid project", async ({ page }) => {
  await loadViewer(page);
  await expect(page.locator("[data-note-id]").first()).toBeVisible();
});

// ── Pager ────────────────────────────────────────────────────────────────────

test("shows pager for a 4-bar sheet", async ({ page }) => {
  await loadViewer(page);
  await expect(page.getByTestId("pager-prev")).toBeVisible();
  await expect(page.getByTestId("pager-next")).toBeVisible();
});

test("initial pager label is '1 2'", async ({ page }) => {
  await loadViewer(page);
  await expect(page.getByTestId("pager-bars")).toHaveText("1 2");
});

test("next advances to bars 2 3", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");
});

test("next is disabled on the last page", async ({ page }) => {
  await loadViewer(page);
  // 6-bar fixture: 1-2 → 2-3 → … → 5-6 (last page, 4 clicks)
  for (let i = 0; i < 4; i++) await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-next")).toBeDisabled();
});

test("prev returns to bars 1 2", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("pager-next").click();
  await page.getByTestId("pager-prev").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("1 2");
});

test("prev is disabled on the first page", async ({ page }) => {
  await loadViewer(page);
  await expect(page.getByTestId("pager-prev")).toBeDisabled();
});

// ── BPM input ────────────────────────────────────────────────────────────────

test("BPM input shows the project BPM (120)", async ({ page }) => {
  await loadViewer(page);
  await expect(page.getByTestId("bpm-input")).toHaveValue("120");
});

test("BPM input accepts free typing mid-entry", async ({ page }) => {
  await loadViewer(page);
  const input = page.getByTestId("bpm-input");
  await input.fill("50");
  await expect(input).toHaveValue("50");
});

test("BPM clamps to 20 on blur when value is too low", async ({ page }) => {
  await loadViewer(page);
  const input = page.getByTestId("bpm-input");
  await input.fill("5");
  await input.blur();
  await expect(input).toHaveValue("20");
});

test("BPM clamps to 300 on blur when value is too high", async ({ page }) => {
  await loadViewer(page);
  const input = page.getByTestId("bpm-input");
  await input.fill("999");
  await input.blur();
  await expect(input).toHaveValue("300");
});

test("BPM accepts a valid value on blur", async ({ page }) => {
  await loadViewer(page);
  const input = page.getByTestId("bpm-input");
  await input.fill("140");
  await input.blur();
  await expect(input).toHaveValue("140");
});

// ── Repeat button ────────────────────────────────────────────────────────────

test("repeat button is initially inactive", async ({ page }) => {
  await loadViewer(page);
  const btn = page.getByTestId("repeat-btn");
  await expect(btn).not.toHaveClass(/active/);
});

test("repeat button toggles active on first click", async ({ page }) => {
  await loadViewer(page);
  const btn = page.getByTestId("repeat-btn");
  await btn.click();
  await expect(btn).toHaveClass(/active/);
});

test("repeat button toggles inactive on second click", async ({ page }) => {
  await loadViewer(page);
  const btn = page.getByTestId("repeat-btn");
  await btn.click();
  await btn.click();
  await expect(btn).not.toHaveClass(/active/);
});

test("clicking repeat while playing does not interrupt playback", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");

  await page.getByTestId("repeat-btn").click();

  // Playback must still be running
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  // Repeat is now active
  await expect(page.getByTestId("repeat-btn")).toHaveClass(/active/);

  await page.getByTestId("play-stop-btn").click(); // clean up
});

// ── Play / Stop button ───────────────────────────────────────────────────────

test("play/stop button initially shows 'Play'", async ({ page }) => {
  await loadViewer(page);
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Play");
});

test("clicking Play changes label to 'Stop'", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  await page.getByTestId("play-stop-btn").click(); // clean up
});

test("clicking Stop returns label to 'Play'", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("play-stop-btn").click();
  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Play");
});

test("clicking Play again after stopping restarts playback", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("play-stop-btn").click();
  await page.getByTestId("play-stop-btn").click();
  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  await page.getByTestId("play-stop-btn").click(); // clean up
});

// ── Repeat + play interaction ────────────────────────────────────────────────

test("toggling repeat while playing does not restart playback", async ({ page }) => {
  await loadViewer(page);

  // Navigate to a mid-sheet page so any accidental restart to bar 1 is detectable.
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");

  // Toggle repeat on — transport must stay playing, page must not change.
  await page.getByTestId("repeat-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  // Toggle repeat off — transport must stay playing, page must not change.
  await page.getByTestId("repeat-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  await page.getByTestId("play-stop-btn").click(); // clean up
});


test("enabling repeat while playing keeps visible bars and transport", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");

  await page.getByTestId("repeat-btn").click();
  await expect(page.getByTestId("repeat-btn")).toHaveClass(/active/);
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  await page.getByTestId("play-stop-btn").click(); // clean up
});

test("disabling repeat while playing keeps visible bars and transport", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  await page.getByTestId("repeat-btn").click();
  await page.getByTestId("play-stop-btn").click();
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");

  await page.getByTestId("repeat-btn").click();
  await expect(page.getByTestId("repeat-btn")).not.toHaveClass(/active/);
  await expect(page.getByTestId("play-stop-btn")).toHaveText("Stop");
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");

  await page.getByTestId("play-stop-btn").click(); // clean up
});

// ── Hover tooltip ────────────────────────────────────────────────────────────

test("hovering a note shows pitch, velocity, and length", async ({ page }) => {
  await loadViewer(page);
  // n1: pitch 60 (C4), vel 2 (mf), length 2 steps
  const note = page.locator('div[data-note-id="n1"]');
  const noteBox = await note.boundingBox();
  if (!noteBox) throw new Error("note n1 not found");

  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);

  const tooltip = page.locator("[data-testid='cell-tooltip']");
  await expect(tooltip).not.toHaveCSS("display", "none");
  await expect(tooltip).toHaveText("C4  mf  2");
});

test("hovering an empty cell shows pitch only", async ({ page }) => {
  await loadViewer(page);
  // part1: hi=72 (C5). Top row has no notes — hover near top-left of the grid.
  const wrap = page.locator('[data-part-id="part1"]');
  const box = await wrap.boundingBox();
  if (!box) throw new Error("part1 grid not found");

  await page.mouse.move(box.x + 4, box.y + 4);

  const tooltip = page.locator("[data-testid='cell-tooltip']");
  await expect(tooltip).not.toHaveCSS("display", "none");
  await expect(tooltip).toHaveText("C5");
});

test("hover cell-highlight box appears on empty cell", async ({ page }) => {
  await loadViewer(page);
  const wrap = page.locator('[data-part-id="part1"]');
  const box = await wrap.boundingBox();
  if (!box) throw new Error("part1 grid not found");

  await page.mouse.move(box.x + 4, box.y + 4);

  await expect(page.locator("[data-testid='cell-hover']")).not.toHaveCSS("display", "none");
});

test("hover cell-highlight box hides when hovering a note", async ({ page }) => {
  await loadViewer(page);
  const note = page.locator('div[data-note-id="n1"]');
  const noteBox = await note.boundingBox();
  if (!noteBox) throw new Error("note n1 not found");

  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);

  await expect(page.locator("[data-testid='cell-hover']")).toHaveCSS("display", "none");
});

// ── Mixer dialog ─────────────────────────────────────────────────────────────

test("clicking Mix opens the mixer dialog", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("mix-btn").click();
  await expect(page.locator("dialog")).toBeVisible();
});

test("closing the mixer dialog hides it", async ({ page }) => {
  await loadViewer(page);
  await page.getByTestId("mix-btn").click();
  await page.locator("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
});

// ── Odd bar count: empty bar appended ────────────────────────────────────────

async function load5BarViewer(page: Page) {
  await routeFixture(page, "viewer-test-5bar.json");
  await page.goto(`${BASE}/view.html?src=${BASE}/viewer-test-5bar.json`);
  await page.locator("[data-note-id]").first().waitFor();
}

test("5-bar sheet: pager is shown", async ({ page }) => {
  await load5BarViewer(page);
  await expect(page.getByTestId("pager-prev")).toBeVisible();
  await expect(page.getByTestId("pager-next")).toBeVisible();
});

test("5-bar sheet: pages advance by 1 — last page label is '4 5'", async ({ page }) => {
  await load5BarViewer(page);
  await expect(page.getByTestId("pager-bars")).toHaveText("1 2");
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("2 3");
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("3 4");
  await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("4 5");
});

test("5-bar sheet: next is disabled on the last page", async ({ page }) => {
  await load5BarViewer(page);
  // 5-bar sheet: last page starts at bar 4 (0-indexed 3), 3 clicks needed
  for (let i = 0; i < 3; i++) await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-next")).toBeDisabled();
});

test("5-bar sheet: grid is 5 bars wide", async ({ page }) => {
  await load5BarViewer(page);

  // Read cell width and separator widths from the DOM to compute the expected total.
  const expectedGridW = await page.evaluate(() => {
    const cellW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-w")) || 22;
    const totalSteps = 5 * 16; // barCount=5
    const nBars  = Math.floor(totalSteps / 16);
    const nBeats = Math.floor(totalSteps / 4) - nBars;
    const nSteps = totalSteps - Math.floor(totalSteps / 4);
    return 7 + totalSteps * cellW + nBars * 7 + nBeats * 5 + nSteps * 1; // stepToX(totalSteps)
  });

  const gridW = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-part-id]");
    return el ? el.offsetWidth : null;
  });

  expect(gridW).toBe(expectedGridW);

  // Navigate to last page (bar 4–5) and confirm the grid width is unchanged.
  for (let i = 0; i < 3; i++) await page.getByTestId("pager-next").click();
  await expect(page.getByTestId("pager-bars")).toHaveText("4 5");

  const gridWLastPage = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-part-id]");
    return el ? el.offsetWidth : null;
  });

  expect(gridWLastPage).toBe(expectedGridW);
});
