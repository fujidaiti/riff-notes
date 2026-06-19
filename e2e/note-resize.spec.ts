import { test, expect, Page } from "@playwright/test";

// One sheet, one part, two notes. n1 is 4 steps wide (start=2) so left/right
// halves are clearly distinct. n2 exists only to satisfy the annotation
// polyline invariant (two notes) if needed; resize tests only touch n1.
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
            { id: "n1", partId: "p1", pitch: 66, start: 2, length: 4, vel: 2, subOffset: 0, subLength: 0 },
            { id: "n2", partId: "p1", pitch: 64, start: 10, length: 2, vel: 2, subOffset: 0, subLength: 0 },
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

const STORAGE_KEY = "riff-notes:project";

async function seed(page: Page) {
  await page.addInitScript((fixture) => {
    localStorage.setItem("riff-notes:project", JSON.stringify(fixture));
  }, FIXTURE);
}

// Read n1 from persisted state. Wait for the 300ms debounce to flush.
async function getNote(page: Page) {
  await page.waitForTimeout(500);
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const doc = JSON.parse(raw!);
  return doc.sheets[0].parts[0].notes[0] as {
    start: number;
    length: number;
    pitch: number;
    vel: number;
    subOffset: number;
    subLength: number;
  };
}

test.beforeEach(async ({ page }) => {
  await seed(page);
  await page.goto("/");
  // Wait until n1 is rendered.
  await page.locator('div[data-note-id="n1"]').waitFor();
});

// ---------------------------------------------------------------------------
// Basic use cases
// ---------------------------------------------------------------------------

test("hover note without cmd — no resize cursor", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  // Move through left edge, center, right edge.
  for (const relX of [2, box.width / 2, box.width - 2]) {
    await page.mouse.move(box.x + relX, box.y + box.height / 2);
    const cursor = await note.evaluate((el: HTMLElement) => el.style.cursor);
    expect(cursor).not.toMatch(/resize/);
  }
});

test("hold cmd, hover left half — w-resize cursor", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  const cursor = await note.evaluate((el: HTMLElement) => el.style.cursor);
  await page.keyboard.up("Meta");
  expect(cursor).toBe("w-resize");
});

test("hold cmd, hover right half — e-resize cursor", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  const cursor = await note.evaluate((el: HTMLElement) => el.style.cursor);
  await page.keyboard.up("Meta");
  expect(cursor).toBe("e-resize");
});

test("hold cmd, drag right half rightward — length increases, start unchanged", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  const startX = box.x + box.width * 0.75;
  const midY = box.y + box.height / 2;
  await page.mouse.move(startX, midY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const n = await getNote(page);
  expect(n.start).toBe(2);
  expect(n.length).toBeGreaterThan(4);
});

test("hold cmd, drag left half leftward — length increases, start decreases", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  const startX = box.x + box.width * 0.25;
  const midY = box.y + box.height / 2;
  await page.mouse.move(startX, midY);
  await page.mouse.down();
  await page.mouse.move(startX - 60, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const n = await getNote(page);
  expect(n.start).toBeLessThan(2);
  expect(n.length).toBeGreaterThan(4);
});

test("hold cmd and drag — note does not move (start and pitch unchanged)", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 20);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const n = await getNote(page);
  // start must stay at 2; pitch must stay at 66.
  expect(n.start).toBe(2);
  expect(n.pitch).toBe(66);
});

test("drag note without cmd — note moves", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy);
  await page.mouse.up();
  const n = await getNote(page);
  expect(n.start).toBeGreaterThan(2);
  expect(n.length).toBe(4);
});

test("cmd+click (no drag) — velocity cycles", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  const before = await getNote(page);
  await page.keyboard.down("Meta");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const after = await getNote(page);
  expect(after.vel).not.toBe(before.vel);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("drag from left edge without cmd — note moves, length unchanged", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  // Drag from the very left edge without cmd — should move, not resize.
  const edgeX = box.x + 2;
  const midY = box.y + box.height / 2;
  await page.mouse.move(edgeX, midY);
  await page.mouse.down();
  await page.mouse.move(edgeX + 60, midY);
  await page.mouse.up();
  const n = await getNote(page);
  expect(n.length).toBe(4);
  expect(n.start).toBeGreaterThan(2);
});

test("resize-r clamps at max sheet length", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  const startX = box.x + box.width * 0.75;
  const midY = box.y + box.height / 2;
  await page.mouse.move(startX, midY);
  await page.mouse.down();
  await page.mouse.move(startX + 9999, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const n = await getNote(page);
  // barCount=4, STEPS_PER_BAR=16 → 64 total steps; start+length must not exceed that.
  expect(n.start + n.length).toBeLessThanOrEqual(64);
  expect(n.length).toBeGreaterThan(4);
});

test("resize-l clamps at min length 1", async ({ page }) => {
  const note = page.locator('div[data-note-id="n1"]');
  const box = await note.boundingBox();
  if (!box) throw new Error("note not found");
  await page.keyboard.down("Meta");
  // Drag left half far to the right to shrink from the left.
  const startX = box.x + box.width * 0.25;
  const midY = box.y + box.height / 2;
  await page.mouse.move(startX, midY);
  await page.mouse.down();
  await page.mouse.move(startX + 9999, midY);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const n = await getNote(page);
  // Minimum is 1 sub-step (SUB_PER_STEP=4), so total subs >= 1.
  const totalSubs = n.length * 4 + n.subLength;
  expect(totalSubs).toBeGreaterThanOrEqual(1);
  expect(totalSubs).toBeLessThan(4 * 4);
});
