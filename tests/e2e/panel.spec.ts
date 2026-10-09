import { expect, test } from "@playwright/test";

import {
  grantAdmin,
  serviceClient,
  signedInClient,
} from "../integration/helpers/supabase";

const password = "Local-test-345!";
const adminEmail = "admin.e5@example.invalid";
const userEmail = "user.e5@example.invalid";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/panel/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = await signedInClient(adminEmail, password);
  await grantAdmin(admin.userId, "Administrator E5");
  await signedInClient(userEmail, password);

  const service = serviceClient();
  const slug = "e5-bezpieczna-praca";
  const { data: category } = await service
    .from("categories")
    .upsert(
      {
        slug: "e5-bhp",
        name: "BHP",
        is_published: true,
        published_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  await service.from("trainings").upsert(
    {
      slug,
      title: "Bezpieczna praca w praktyce",
      summary: "Praktyczne szkolenie dla zespołów technicznych.",
      category_id: category!.id,
      level: "podstawowy",
      duration_hours: 8,
      price_net_pln: 1200,
    },
    { onConflict: "slug" },
  );
  await service.from("inquiries").insert({
    kind: "firma",
    full_name: "Jan Testowy",
    email: "jan.testowy@example.invalid",
    phone: "+48 500 000 000",
    company_name: "Przykładowa Firma",
    interest_area: "Szkolenie BHP",
    message: "Proszę o kontakt w sprawie terminu szkolenia dla zespołu.",
    rodo_ack: true,
    rodo_clause_version: "test-e5",
  });
});

test("brak sesji przekierowuje na logowanie", async ({ page }) => {
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/panel\/logowanie/);
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  await page.screenshot({ path: "artifacts/isk-345/01-logowanie.png", fullPage: true });
});

test("zalogowany użytkownik bez admin_users widzi czytelną odmowę", async ({ page }) => {
  await login(page, userEmail);
  await expect(page).toHaveURL(/\/panel\/brak-dostepu/);
  await expect(page.getByRole("heading", { name: "To konto nie ma dostępu do panelu" })).toBeVisible();
});

test("administrator zarządza katalogiem i widzi zgłoszenia", async ({ page }) => {
  await login(page, adminEmail);
  await expect(page.getByRole("heading", { name: "Panel administratora" })).toBeVisible();

  await page.goto("/panel/szkolenia");
  await expect(page.getByText("Bezpieczna praca w praktyce")).toBeVisible();
  await page.screenshot({ path: "artifacts/isk-345/02-lista-szkolen.png", fullPage: true });
  await page.getByRole("link", { name: "Edytuj" }).first().click();
  await expect(page.getByRole("heading", { name: "Bezpieczna praca w praktyce" })).toBeVisible();
  await page.screenshot({ path: "artifacts/isk-345/03-edycja-szkolenia.png", fullPage: true });

  await page.goto("/panel/zgloszenia");
  await expect(page.getByText("Jan Testowy")).toBeVisible();
  await page.screenshot({ path: "artifacts/isk-345/04-lista-zgloszen.png", fullPage: true });
  await page.getByRole("link", { name: "Zobacz szczegóły" }).first().click();
  await expect(page.getByText("Treść jest niezmienna")).toBeVisible();
  await expect(page.getByText("Oczekuje na wysyłkę")).toBeVisible();
  await page.screenshot({ path: "artifacts/isk-345/05-szczegol-zgloszenia.png", fullPage: true });
});
