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
          notes: [],
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
  await page.locator('[data-part-id="p1"]').waitFor();
});

test("BPM input starts at the persisted value", async ({ page }) => {
  await expect(page.getByTestId("bpm-input")).toHaveValue("120");
});

test("typing a new BPM and blurring commits the value", async ({ page }) => {
  const input = page.getByTestId("bpm-input");
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await input.pressSequentially("150");
  await expect(input).toHaveValue("150");
  await input.blur();
  await expect(input).toHaveValue("150");

  // Verify it persisted to the store (saveProject is debounced 300ms).
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("riff-notes:project");
        return raw ? (JSON.parse(raw).sheets[0].bpm as number) : null;
      }),
    )
    .toBe(150);
});

test("typing intermediate values below the minimum is not clobbered", async ({ page }) => {
  // The bug: each keystroke was clamped to >=20, so typing "1" became "20"
  // and the user could never type "100" or "150".
  const input = page.getByTestId("bpm-input");
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await input.pressSequentially("1");
  await expect(input).toHaveValue("1");
  await input.pressSequentially("0");
  await expect(input).toHaveValue("10");
  await input.pressSequentially("0");
  await expect(input).toHaveValue("100");
  await input.blur();
  await expect(input).toHaveValue("100");
});

test("committing an out-of-range value clamps to the allowed range", async ({ page }) => {
  const input = page.getByTestId("bpm-input");
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await input.pressSequentially("999");
  await input.blur();
  await expect(input).toHaveValue("300");
});

test("pressing Enter commits the value", async ({ page }) => {
  const input = page.getByTestId("bpm-input");
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await input.pressSequentially("90");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("90");
});
