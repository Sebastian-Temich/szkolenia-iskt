// ADR-0005 D5, sciezki 6 i 9 — kontrola dostepu do panelu.
import { expect, test } from "@playwright/test";

import { loginAsAdmin, loginViaUi } from "./helpers/auth";
import { USER_EMAIL, USER_PASSWORD } from "./helpers/stack";

test.describe("D5.6 — logowanie administratora i ochrona /panel", () => {
  test("wejscie na /panel bez sesji przekierowuje na logowanie", async ({
    page,
  }) => {
    await page.goto("/panel");
    // Aplikacja zachowuje sciezke powrotu w ?powrot= — stad dopasowanie z prefiksem.
    await expect(page).toHaveURL(/\/panel\/logowanie(\?|$)/);
    await expect(
      page.getByRole("button", { name: "Zaloguj się" }),
    ).toBeVisible();
  });

  test("logowanie administratora prowadzi do panelu", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/panel$/);
    // Panel udostepnia nawigacje do trzech obszarow zarzadzania.
    const nav = page.getByRole("navigation", { name: "Nawigacja panelu" });
    await expect(nav.getByRole("link", { name: "Szkolenia" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Zgłoszenia" })).toBeVisible();
  });

  test("bledne haslo nie wpuszcza do panelu i pokazuje komunikat", async ({
    page,
  }) => {
    await loginViaUi(page, "admin@example.invalid", "zle-haslo-123");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/panel\/logowanie/);
  });
});

test.describe("D5.9 — uzytkownik bez uprawnien administratora", () => {
  test("zalogowany bez wiersza w admin_users nie wchodzi do panelu", async ({
    page,
  }) => {
    await loginViaUi(page, USER_EMAIL, USER_PASSWORD);
    await expect(page).toHaveURL(/\/panel\/brak-dostepu$/);

    // Nie dostaje tresci panelu ani przy probie bezposredniego wejscia.
    await page.goto("/panel/zgloszenia");
    await expect(page).toHaveURL(/\/panel\/brak-dostepu$/);
    await expect(
      page.getByRole("navigation", { name: "Nawigacja panelu" }),
    ).toHaveCount(0);
  });
});
