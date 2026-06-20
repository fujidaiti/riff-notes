import { test, expect, Page } from "@playwright/test";

const FIXTURE = {
  version: 1,
  name: "Test",
  sheets: [
    {
      id: "s1",
      title: "Sheet",
      notes: "",
      bpm: 120,
      scale: { root: 0, mode: "major" },
      barCount: 4,
      parts: [
        {
          id: "p1",
          name: "Part",
          lo: 60,
          hi: 72,
          instrument: "epiano",
          notes: [
            { id: "n1", partId: "p1", pitch: 66, start: 2, length: 2, vel: 2, subOffset: 0, subLength: 0 },
          ],
        },
      ],
      mix: {
        master: { vol: 1, mute: false },
        parts: { p1: { vol: 1, mute: false, solo: false } },
      },
      annotations: [],
    },
  ],
};

async function seed(page: Page) {
  await page.addInitScript((fixture) => {
    localStorage.setItem("riff-notes:project", JSON.stringify(fixture));
  }, FIXTURE);
}

test.beforeEach(async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.locator('div[data-note-id="n1"]').waitFor();
});

async function hoverNote(page: Page) {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test("hover tooltip shows while playing", async ({ page }) => {
  await page.getByRole("button", { name: /Play/ }).click();
  await expect(page.getByRole("button", { name: /Pause/ })).toBeVisible();

  await hoverNote(page);

  const tooltip = page.locator("[data-testid='cell-tooltip']");
  await expect(tooltip).not.toHaveCSS("display", "none");
  await expect(tooltip).toHaveText(/F#?4|Gb4/);

  await page.getByRole("button", { name: /Stop/ }).click();
});

test("hover tooltip shows while paused", async ({ page }) => {
  await page.getByRole("button", { name: /Play/ }).click();
  await page.getByRole("button", { name: /Pause/ }).click();
  await expect(page.getByRole("button", { name: /Resume/ })).toBeVisible();

  await hoverNote(page);

  const tooltip = page.locator("[data-testid='cell-tooltip']");
  await expect(tooltip).not.toHaveCSS("display", "none");

  await page.getByRole("button", { name: /Stop/ }).click();
});
