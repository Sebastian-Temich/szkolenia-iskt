// ADR-0005 D5, sciezka 7 — pelny cykl zycia pozycji katalogu widziany oczami
// administratora: TWORZY szkolenie -> publikuje -> pozycja jest publicznie
// widoczna -> wycofuje -> pozycja znika.
//
// Dlaczego osobny plik, mimo ze `panel.spek.ts` (E5) testuje publikacje:
// tamten scenariusz zaklada szkolenie kluczem `service_role` i sprawdza tylko
// przelacznik publikacji. Opis sciezki D5.7 zaczyna sie od "Administrator
// tworzy szkolenie", a tworzenie przez formularz panelu to inna warstwa niz
// INSERT do bazy — walidacja Zod, Server Action, slug, powiazania trenerow.
import { expect, test } from "@playwright/test";

import { publishedCategory, sfx } from "./helpers/data";
import { loginAsAdmin } from "./helpers/auth";
import { serviceClient } from "./helpers/stack";

const actionTimeout = 60_000;

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("D5.7 — administrator tworzy, publikuje i wycofuje szkolenie", () => {
  const slug = `test-panel-cykl-${sfx()}`;
  const title = `[TEST] Panel cykl ${slug}`;
  let categoryName: string;

  test.beforeAll(async () => {
    categoryName = (await publishedCategory()).name;
  });

  // Czyscimy po sobie takze wtedy, gdy test padnie w polowie.
  test.afterAll(async () => {
    await serviceClient().from("trainings").delete().eq("slug", slug);
  });

  test("cykl tworzenie -> publikacja -> widocznosc -> wycofanie", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // --- Tworzenie przez formularz panelu ---
    await page.goto("/panel/szkolenia/nowe");
    await expect(
      page.getByRole("heading", { name: "Dodaj szkolenie" }),
    ).toBeVisible({ timeout: actionTimeout });

    await page.getByLabel("Tytuł").fill(title);
    await page.getByLabel("Slug", { exact: true }).fill(slug);
    await page
      .getByLabel("Podsumowanie")
      .fill("Fikcyjne szkolenie na potrzeby sciezki D5.7 (tworzenie w panelu).");
    await page
      .getByLabel("Opis")
      .fill("Opis fikcyjnego szkolenia utworzonego przez panel administratora.");
    await page.getByLabel("Kategoria").selectOption({ label: categoryName });
    await page.getByLabel("Czas (godz.)").fill("6");
    await page.getByLabel("Cena netto PLN").fill("900");
    await page.getByRole("button", { name: "Zapisz szkolenie" }).click();

    // Po zapisie wracamy na liste, a nowa pozycja jest na niej jako szkic.
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: actionTimeout });
    await expect(row.getByText("Szkic")).toBeVisible();

    // Swiezo utworzone szkolenie NIE moze byc publicznie widoczne.
    expect((await page.goto(`/szkolenia/${slug}`))?.status()).toBe(404);

    // --- Publikacja ---
    await page.goto("/panel/szkolenia");
    await row.getByRole("button", { name: "Publikuj" }).click();
    await expect(row.getByText("Opublikowane")).toBeVisible({
      timeout: actionTimeout,
    });

    // Pozycja jest widoczna publicznie — i na liscie, i pod wlasnym URL-em.
    // Bez recznego czyszczenia cache: inwalidacja z Server Action musi wystarczyc.
    const published = await page.goto(`/szkolenia/${slug}`);
    expect(published?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);

    await page.goto("/szkolenia");
    await expect(
      page.getByRole("link", { name: title }).first(),
    ).toBeVisible({ timeout: actionTimeout });

    // --- Wycofanie ---
    await page.goto("/panel/szkolenia");
    await row.getByRole("button", { name: "Wycofaj" }).click();
    await expect(row.getByText("Szkic")).toBeVisible({
      timeout: actionTimeout,
    });

    // Pozycja znika z katalogu i znow zwraca 404.
    await page.goto("/szkolenia");
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
    expect((await page.goto(`/szkolenia/${slug}`))?.status()).toBe(404);
  });
});
