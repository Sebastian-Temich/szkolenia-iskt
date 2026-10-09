import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// E2E formularza (ADR-0004 §7). Uruchamiane na lokalnym stacku Supabase (CI job `e2e`).
// MAIL_TRANSPORT=log — bez realnej wysylki.

test.describe("formularz kontaktowy", () => {
  test("wysyła zgłoszenie osoby i pokazuje potwierdzenie", async ({ page }) => {
    await page.goto("/kontakt");

    await page.getByLabel("Imię i nazwisko").fill("Jan Kowalski");
    await page.getByLabel("Adres e-mail").fill("e2e-osoba@example.invalid");
    await page.getByLabel("Telefon").fill("+48 600 100 200");
    await page.getByLabel("Interesujące szkolenie lub obszar").fill("Szkolenia BHP");
    await page
      .getByLabel("Wiadomość")
      .fill("Proszę o kontakt w sprawie szkolenia dla zespołu.");
    await page.getByLabel(/Potwierdzam zapoznanie/).check();

    // Token czasowy odrzuca wypełnienia szybsze niż 3 s od renderu.
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    await expect(page.getByText("Dziękujemy za zgłoszenie")).toBeVisible();
  });

  test("blokuje wysłanie bez zgody RODO (walidacja po stronie klienta)", async ({ page }) => {
    await page.goto("/kontakt");

    await page.getByLabel("Imię i nazwisko").fill("Anna Nowak");
    await page.getByLabel("Adres e-mail").fill("e2e-anna@example.invalid");
    await page.getByLabel("Telefon").fill("600100200");
    await page.getByLabel("Interesujące szkolenie lub obszar").fill("Rozwój");
    await page.getByLabel("Wiadomość").fill("Chętnie dowiem się więcej o ofercie szkoleń.");

    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    await expect(
      page.getByText("Potwierdzenie zapoznania się z informacją RODO jest wymagane."),
    ).toBeVisible();
    await expect(page.getByText("Dziękujemy za zgłoszenie")).toHaveCount(0);
  });

  test("formularz nie ma krytycznych naruszeń dostępności (axe)", async ({ page }) => {
    await page.goto("/kontakt");
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((violation) => violation.impact === "critical");
    expect(critical).toEqual([]);
  });
});
