import { test } from "@playwright/test";

test("probe: co zwraca /api/inquiries", async ({ page }) => {
  page.on("response", async (res) => {
    if (res.url().includes("/api/inquiries")) {
      console.log("API status:", res.status());
      console.log("API body:", await res.text().catch(() => "<brak>"));
    }
  });
  page.on("console", (m) => console.log("BROWSER:", m.type(), m.text()));

  await page.goto("/kontakt");
  await page.getByRole("radio", { name: "Firma" }).check();
  await page.getByLabel("Nazwa firmy").fill("[TEST] Firma Probe");
  await page.getByLabel("Imię i nazwisko").fill("[TEST] Jan Probe");
  await page.getByLabel("Adres e-mail").fill("probe-1@example.invalid");
  await page.getByLabel("Telefon").fill("+48 600 100 200");
  await page.getByLabel("Interesujące szkolenie lub obszar").fill("[TEST] X");
  await page.getByLabel("Wiadomość").fill("Fikcyjna tresc probna E2E.");
  await page
    .getByRole("checkbox", {
      name: /Potwierdzam zapoznanie się z informacją RODO/,
    })
    .check();
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await page.waitForTimeout(3000);
  console.log("BODY TEXT:", (await page.locator("body").innerText()).slice(0, 400));
});
