// ADR-0005 D5, sciezki 3, 4 i 5 — formularz zgloszen.
// Poczta dziala w trybie `log` (ADR-0005 D7), wiec zaden mail nie opuszcza maszyny.
import { expect, test } from "@playwright/test";

import { clearThrottle, sfx } from "./helpers/data";
import { awaitFormTokenMaturity } from "./helpers/form";
import { serviceClient } from "./helpers/stack";

// Limit czestosci to 3 przyjete zgloszenia / 10 min na klienta. Kazdy test
// zaczyna od czystego licznika, zeby przebieg byl powtarzalny.
test.beforeEach(async () => {
  await clearThrottle();
});

// UWAGA dla czytajacego te testy.
//
// Warstwy antyspamowe (ADR-0004 §3) odrzucaja zgloszenie, zwracajac HTTP 200
// z komunikatem sukcesu — bot nie ma sie dowiedziec, ze go wykryto. Skutek dla
// testow: *ekran potwierdzenia nie dowodzi niczego*. Pojawia sie identycznie
// przy zapisie i przy cichym odrzuceniu (honeypot, zly/za szybki token).
// Dlatego kazda sciezka "wyslanie sie udalo" MUSI dodatkowo potwierdzic wiersz
// w bazie — asercja na samym `role="status"` jest pusta.

async function fillCommonFields(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.getByLabel("Imię i nazwisko").fill("[TEST] Jan Zglaszajacy");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Telefon").fill("+48 600 100 200");
  await page
    .getByLabel("Interesujące szkolenie lub obszar")
    .fill("[TEST] Obszar zainteresowania");
  await page
    .getByLabel("Wiadomość")
    .fill("Fikcyjna tresc zapytania na potrzeby testow E2E.");
}

test.describe("D5.3 — zgloszenie jako osoba indywidualna", () => {
  test("po wyslaniu widac ekran potwierdzenia, a zgloszenie trafia do bazy", async ({
    page,
  }) => {
    const email = `osoba-${sfx()}@example.invalid`;
    await page.goto("/kontakt");

    await page.getByRole("radio", { name: "Osoba indywidualna" }).check();
    await fillCommonFields(page, email);
    await page
      .getByRole("checkbox", {
        name: /Potwierdzam zapoznanie się z informacją RODO/,
      })
      .check();
    await awaitFormTokenMaturity(page);
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Dziękujemy za zgłoszenie",
    );

    const { data } = await serviceClient()
      .from("inquiries")
      .select("kind,status,company_name")
      .eq("email", email)
      .single();
    expect(data?.kind).toBe("osoba");
    expect(data?.status).toBe("nowe");
    expect(data?.company_name).toBeNull();
  });
});

test.describe("D5.4 — zgloszenie jako firma", () => {
  test("po wyslaniu widac potwierdzenie, a nazwa firmy jest zapisana", async ({
    page,
  }) => {
    const email = `firma-${sfx()}@example.invalid`;
    await page.goto("/kontakt");

    await page.getByRole("radio", { name: "Firma" }).check();
    // Pole nazwy firmy pojawia sie warunkowo dla rodzaju "firma".
    const companyField = page.getByLabel("Nazwa firmy");
    await expect(companyField).toBeVisible();
    await companyField.fill("[TEST] Firma Przykladowa sp. z o.o.");
    await fillCommonFields(page, email);
    await page
      .getByRole("checkbox", {
        name: /Potwierdzam zapoznanie się z informacją RODO/,
      })
      .check();
    await awaitFormTokenMaturity(page);
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Dziękujemy za zgłoszenie",
    );

    const { data } = await serviceClient()
      .from("inquiries")
      .select("kind,company_name")
      .eq("email", email)
      .single();
    expect(data?.kind).toBe("firma");
    expect(data?.company_name).toBe("[TEST] Firma Przykladowa sp. z o.o.");
  });
});

test.describe("D5.5 — brak zgody RODO", () => {
  test("formularz nie wysyla sie i pokazuje czytelny blad powiazany z polem", async ({
    page,
  }) => {
    const email = `bez-rodo-${sfx()}@example.invalid`;
    await page.goto("/kontakt");

    await fillCommonFields(page, email);
    // Swiadomie NIE zaznaczamy zgody RODO.
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    // Brak ekranu potwierdzenia.
    await expect(page.getByRole("status")).toHaveCount(0);

    // Komunikat bledu jest widoczny i programowo powiazany z polem zgody
    // (aria-describedby -> #rodoAck-error) — wymog WCAG 3.3.1/3.3.2.
    const consent = page.getByRole("checkbox", {
      name: /Potwierdzam zapoznanie się z informacją RODO/,
    });
    await expect(consent).toHaveAttribute("aria-invalid", "true");
    await expect(consent).toHaveAttribute("aria-describedby", "rodoAck-error");
    const fieldError = page.locator("#rodoAck-error");
    await expect(fieldError).toBeVisible();
    await expect(fieldError).not.toBeEmpty();

    // Nic nie zostalo zapisane.
    const { data } = await serviceClient()
      .from("inquiries")
      .select("id")
      .eq("email", email);
    expect(data ?? []).toHaveLength(0);
  });
});
