import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const views = [
  ["home", "/"],
  ["katalog", "/szkolenia"],
  ["szczegol", "/szkolenia/wprowadzenie-do-ai"],
  ["trenerzy", "/trenerzy"],
  ["kontakt", "/kontakt"],
] as const;

const evidenceDirectory = process.env.EVIDENCE_DIR;

for (const width of [360, 768, 1280]) {
  for (const [name, url] of views) {
    test(`${name} — dowód RWD ${width}px`, async ({ page }) => {
      test.skip(
        !evidenceDirectory,
        "Ustaw EVIDENCE_DIR, aby wygenerować dowody.",
      );
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await mkdir(evidenceDirectory!, { recursive: true });
      await page.screenshot({
        path: path.join(evidenceDirectory!, `${name}-${width}.png`),
        fullPage: true,
      });
    });
  }
}
