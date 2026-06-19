import { test, expect, Page, Locator } from "@playwright/test";

// A minimal serialized project with one part, two notes, and one annotation.
// shrunkWidth=80 so that CSS hover expansion grows it to min-width=140px (measurable).
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
      barCount: 2,
      parts: [
        {
          id: "p1",
          name: "Part",
          lo: 60,
          hi: 72,
          instrument: "epiano",
          notes: [
            { id: "n1", partId: "p1", pitch: 66, start: 0, length: 2, vel: 2, subOffset: 0, subLength: 0 },
            { id: "n2", partId: "p1", pitch: 66, start: 4, length: 2, vel: 2, subOffset: 0, subLength: 0 },
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
          text: "Test annotation for resize",
          noteIds: ["n1", "n2"],
          shrunkWidth: 80,
          placement: { anchorNoteId: "n1", dx: 0, dy: -40 },
        },
      ],
    },
  ],
};

const STORAGE_KEY = "riff-notes:project";

async function seed(page: Page) {
  await page.addInitScript((fixture) => {
    localStorage.setItem("riff-notes:project", JSON.stringify(fixture));
  }, FIXTURE);
}

// Read the annotation from persisted state. Wait for the 300ms debounce to flush.
async function getAnnotation(page: Page) {
  await page.waitForTimeout(500);
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const doc = JSON.parse(raw!);
  return doc.sheets[0].annotations[0] as { shrunkWidth: number; placement: { dx: number; dy: number } };
}

// Move cursor to a position relative to the card's bounding box.
async function moveRelative(page: Page, card: Locator, relX: number, relY: number) {
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  await page.mouse.move(box.x + relX, box.y + relY);
}

test.beforeEach(async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.getByTitle(/Drag to move/).waitFor();
});

// ---------------------------------------------------------------------------
// Basic use cases
// ---------------------------------------------------------------------------

test("hover without cmd — card expands", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  // Hover the card — CSS min-width: max(140px, 80px) = 140px takes effect.
  await card.hover();
  const width = await card.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(80);
});

test("hover near edge without cmd — no resize cursor", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  // Move to right edge zone without pressing cmd.
  await moveRelative(page, card, 80 - 7, 10);
  const cursor = await card.evaluate((el: HTMLElement) => el.style.cursor);
  expect(cursor).not.toBe("ew-resize");
});

test("hold cmd, hover minimized card — card does not expand", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  await page.keyboard.down("Meta");
  await card.hover();
  const width = await card.evaluate((el) => el.getBoundingClientRect().width);
  await page.keyboard.up("Meta");
  expect(width).toBe(80);
});

test("hold cmd, hover near edge — resize cursor shown", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  await page.keyboard.down("Meta");
  await moveRelative(page, card, 7, 10);
  const cursorLeft = await card.evaluate((el: HTMLElement) => el.style.cursor);
  await moveRelative(page, card, 80 - 7, 10);
  const cursorRight = await card.evaluate((el: HTMLElement) => el.style.cursor);
  await page.keyboard.up("Meta");
  expect(cursorLeft).toBe("ew-resize");
  expect(cursorRight).toBe("ew-resize");
});

test("hold cmd, drag right edge — card widens", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  await page.keyboard.down("Meta");
  const rightEdgeX = box.x + box.width - 7;
  const midY = box.y + box.height / 2;
  await page.mouse.move(rightEdgeX, midY);
  await page.mouse.down();
  await page.mouse.move(rightEdgeX + 50, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const ann = await getAnnotation(page);
  expect(ann.shrunkWidth).toBeGreaterThan(80);
  expect(ann.placement.dx).toBe(0);
});

test("hold cmd, drag left edge — card widens and dx adjusts", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  await page.keyboard.down("Meta");
  const leftEdgeX = box.x + 7;
  const midY = box.y + box.height / 2;
  await page.mouse.move(leftEdgeX, midY);
  await page.mouse.down();
  await page.mouse.move(leftEdgeX - 50, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const ann = await getAnnotation(page);
  expect(ann.shrunkWidth).toBeGreaterThan(80);
  // Left-edge resize: dx shrinks by the same amount as the width increase.
  const widthIncrease = ann.shrunkWidth - 80;
  expect(ann.placement.dx).toBeCloseTo(-widthIncrease, 0);
});

test("drag card without cmd — card moves", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  // Drag from center — well away from the edges.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 20);
  await page.mouse.up();
  const ann = await getAnnotation(page);
  // Fixture starts with dx=0, dy=-40; drag adds +40 and +20 respectively.
  expect(ann.placement.dx).toBeCloseTo(40, 0);
  expect(ann.placement.dy).toBeCloseTo(-20, 0);
});

test("click card without cmd — edit dialog opens", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  // Click center of card.
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("hover-expand then press cmd — card collapses", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  // Hover to expand (min-width takes effect, card grows to 140px).
  await card.hover();
  const expandedWidth = await card.evaluate((el) => el.getBoundingClientRect().width);
  expect(expandedWidth).toBeGreaterThan(80);
  // Press cmd — .cmdHeld class removes the hover expansion rule.
  await page.keyboard.down("Meta");
  const collapsedWidth = await card.evaluate((el) => el.getBoundingClientRect().width);
  await page.keyboard.up("Meta");
  expect(collapsedWidth).toBe(80);
});

test("cmd released mid-hover — card expands again", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  await page.keyboard.down("Meta");
  await card.hover();
  // Verify still minimized while cmd is held.
  const minWidth = await card.evaluate((el) => el.getBoundingClientRect().width);
  expect(minWidth).toBe(80);
  // Release cmd — hover expansion resumes.
  await page.keyboard.up("Meta");
  const expandedWidth = await card.evaluate((el) => el.getBoundingClientRect().width);
  expect(expandedWidth).toBeGreaterThan(80);
});

test("drag near edge without cmd — moves card, not resize", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  // Drag from within the edge zone but WITHOUT cmd — should move, not resize.
  const rightEdgeX = box.x + box.width - 7;
  const midY = box.y + box.height / 2;
  await page.mouse.move(rightEdgeX, midY);
  await page.mouse.down();
  await page.mouse.move(rightEdgeX + 40, midY);
  await page.mouse.up();
  const ann = await getAnnotation(page);
  expect(ann.shrunkWidth).toBe(80);
  expect(ann.placement.dx).toBeCloseTo(40, 0);
});

test("resize clamps at max width", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  await page.keyboard.down("Meta");
  const rightEdgeX = box.x + box.width - 7;
  const midY = box.y + box.height / 2;
  await page.mouse.move(rightEdgeX, midY);
  await page.mouse.down();
  await page.mouse.move(rightEdgeX + 9999, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const ann = await getAnnotation(page);
  expect(ann.shrunkWidth).toBeLessThanOrEqual(320);
  expect(ann.shrunkWidth).toBeGreaterThan(80);
});

test("resize clamps at min width", async ({ page }) => {
  const card = page.getByTitle(/Drag to move/);
  const box = await card.boundingBox();
  if (!box) throw new Error("card not found");
  await page.keyboard.down("Meta");
  const leftEdgeX = box.x + 7;
  const midY = box.y + box.height / 2;
  await page.mouse.move(leftEdgeX, midY);
  await page.mouse.down();
  // Drag far to the right to shrink from the left.
  await page.mouse.move(leftEdgeX + 9999, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const ann = await getAnnotation(page);
  expect(ann.shrunkWidth).toBeGreaterThanOrEqual(24);
  expect(ann.shrunkWidth).toBeLessThan(80);
});
