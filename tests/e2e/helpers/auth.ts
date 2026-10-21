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
  // ISK-372: `login()` konczy sie `redirect("/panel")`, czyli MIEKKA nawigacja
  // routera wykonywana po odpowiedzi Server Action. Powloka panelu (a wiec
  // i asercja powyzej) jest widoczna, zanim router zatwierdzi przejscie —
  // kolejne `page.goto()` wpadalo wtedy w `net::ERR_ABORTED`, bo przerywalo
  // nawigacje w toku. Objaw czytal sie jak niedostepna strona, a byl wyscigiem
  // (ok. 1 na 2 przebiegi przy trzech workerach). Czekamy na zatwierdzony adres.
  await page.waitForURL(/\/panel(\?|$)/);
}
