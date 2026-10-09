import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the local MVP foundation without detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Kompetencje, które zmieniają wiedzę w działanie.",
    }),
  ).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
