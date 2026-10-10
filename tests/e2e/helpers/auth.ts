// Logowanie przez prawdziwy formularz panelu — swiadomie nie wstrzykujemy sesji,
// bo sciezka D5.6 obejmuje takze samo logowanie.
import { expect, type Page } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./stack";

export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/panel/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(
    page.getByRole("navigation", { name: "Nawigacja panelu" }),
  ).toBeVisible();
}
