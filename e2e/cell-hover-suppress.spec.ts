import { test, expect, Page } from "@playwright/test";

// One sheet, one part, two notes, one annotation.
// n1 is at step 2 to leave empty cells at steps 0-1 for the "empty cell" test.
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
            { id: "n2", partId: "p1", pitch: 64, start: 10, length: 2, vel: 2, subOffset: 0, subLength: 0 },
          ],
        },
      ],
      mix: {
        master: { vol: 1, mute: false },
        parts: { p1: { vol: 1, mute: false, solo: false } },
      },
      annotations: [
        {
          id: "a1",
          text: "Hover test annotation",
          noteIds: ["n1", "n2"],
          shrunkWidth: 80,
          placement: { anchorNoteId: "n1", dx: 0, dy: -40 },
        },
      ],
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

test("hovering an empty cell shows the highlight box", async ({ page }) => {
  const wrap = page.locator("[data-part-id]").first();
  const box = await wrap.boundingBox();
  if (!box) throw new Error("grid wrap not found");

  // Move to step 0, which has no note or card.
  await page.mouse.move(box.x + 4, box.y + box.height / 2);

  const hoverBox = page.locator("[data-testid='cell-hover']");
  await expect(hoverBox).not.toHaveCSS("display", "none");
});

test("hovering a selected note hides the highlight box", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const noteBox = await note.boundingBox();
  if (!noteBox) throw new Error("note not found");

  // Click to select the note.
  await page.mouse.click(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);

  // Re-hover (click moves, then hover confirms).
  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);

  const hoverBox = page.locator("[data-testid='cell-hover']");
  await expect(hoverBox).toHaveCSS("display", "none");
});

test("hovering an unselected note hides the highlight box", async ({ page }) => {
  // n1 has length 2, so its div spans two cells. Hover the right half (second
  // cell) to confirm the box is suppressed across the full note body.
  const note = page.locator('div[data-note-id="n1"]');
  const noteBox = await note.boundingBox();
  if (!noteBox) throw new Error("note not found");

  await page.mouse.move(noteBox.x + noteBox.width * 0.75, noteBox.y + noteBox.height / 2);

  const hoverBox = page.locator("[data-testid='cell-hover']");
  await expect(hoverBox).toHaveCSS("display", "none");
});

test("hovering an annotation card hides the highlight box", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  await card.hover();

  const hoverBox = page.locator("[data-testid='cell-hover']");
  await expect(hoverBox).toHaveCSS("display", "none");
});

test("hovering an annotation card hides the pitch tooltip", async ({ page }) => {
  // First move over an empty cell to confirm the tooltip appears normally.
  const wrap = page.locator("[data-part-id]").first();
  const box = await wrap.boundingBox();
  if (!box) throw new Error("grid wrap not found");
  await page.mouse.move(box.x + 4, box.y + box.height / 2);

  const tooltip = page.locator("[data-testid='cell-tooltip']");
  await expect(tooltip).not.toHaveCSS("display", "none");

  // Now move over the annotation card — tooltip must disappear.
  const card = page.getByTitle(/Drag to move/);
  await card.hover();
  await expect(tooltip).toHaveCSS("display", "none");
});
