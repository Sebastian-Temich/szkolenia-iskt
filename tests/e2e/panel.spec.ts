import { expect, test } from "@playwright/test";

import {
  grantAdmin,
  serviceClient,
  signedInClient,
} from "../integration/helpers/supabase";

const password = "Local-test-345!";
const adminEmail = "admin.e5@example.invalid";
const userEmail = "user.e5@example.invalid";
const trainingTitle = "Bezpieczna praca w praktyce";

/**
 * Serwer e2e działa w trybie dev, więc pierwsze wejście w trasę i każda Server
 * Action płacą za kompilację na żądanie. Domyślne 5 s `expect` jest na to za
 * krótkie — stąd jawny, hojny limit dla kroków po akcji serwerowej.
 */
const actionTimeout = 60_000;

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/panel/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  // Logowanie kończy się przekierowaniem — czekamy, aż opuścimy formularz,
  // zamiast zakładać, że akcja zdążyła się wykonać.
  await page.waitForURL((url) => !url.pathname.includes("/logowanie"), {
    timeout: actionTimeout,
  });
}

// Scenariusze są wieloetapowe i każdy krok może trafić na kompilację trasy w
// trybie dev, więc domyślne 30 s na test jest zbyt ciasne.
test.describe.configure({ mode: "serial", timeout: 180_000 });

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
  // Pierwsze wejście kompiluje proxy i trasę logowania — stąd dłuższy limit.
  await page.waitForURL(/\/panel\/logowanie/, { timeout: actionTimeout });
  // ISK-402: H1 ekranu logowania to „Panel administratora" (wzorzec i karta).
  // Wczesniej bylo tu „Zaloguj sie" z nadrzednym nadpisem „Panel
  // administratora" — czyli dokladnie odwrotnie. „Zaloguj sie" zostaje nazwa
  // PRZYCISKU wysylajacego formularz i tego pilnuje `panel-dostep.spec.ts`.
  await expect(
    page.getByRole("heading", { name: "Panel administratora" }),
  ).toBeVisible({
    timeout: actionTimeout,
  });
  await page.screenshot({
    path: "artifacts/isk-345/01-logowanie.png",
    fullPage: true,
  });
});

test("zalogowany użytkownik bez admin_users widzi czytelną odmowę", async ({
  page,
}) => {
  await login(page, userEmail);
  await expect(page).toHaveURL(/\/panel\/brak-dostepu/);
  await expect(
    page.getByRole("heading", { name: "To konto nie ma dostępu do panelu" }),
  ).toBeVisible();
});

test("administrator zarządza katalogiem i widzi zgłoszenia", async ({
  page,
}) => {
  await login(page, adminEmail);
  // ISK-402: H1 startu panelu to „Zarzadzanie oferta" (wzorzec i karta).
  // „Panel administratora" przeniosl sie na ekran logowania i jest tu
  // nadpisem (`panel-eyebrow`), a nie naglowkiem.
  await expect(
    page.getByRole("heading", { name: "Zarządzanie ofertą" }),
  ).toBeVisible({ timeout: actionTimeout });

  await page.goto("/panel/szkolenia");
  await expect(page.getByText(trainingTitle)).toBeVisible({
    timeout: actionTimeout,
  });
  await page.screenshot({
    path: "artifacts/isk-345/02-lista-szkolen.png",
    fullPage: true,
  });
  // Selektor musi byc zakotwiczony we WLASNYM wierszu. `.first()` bral
  // pierwszy wiersz tabeli, a inne pliki testowe (fullyParallel) wstawiaja
  // i usuwaja swoje szkolenia — klikniecie trafialo wtedy w obcy, czasem juz
  // usuniety rekord. Test przechodzil w izolacji i padal w pelnym przebiegu.
  await page
    .getByRole("row")
    .filter({ hasText: trainingTitle })
    .getByRole("link", { name: "Edytuj" })
    .click();
  await expect(page.getByRole("heading", { name: trainingTitle })).toBeVisible({
    timeout: actionTimeout,
  });
  await page.screenshot({
    path: "artifacts/isk-345/03-edycja-szkolenia.png",
    fullPage: true,
  });

  await page.goto("/panel/zgloszenia");
  await expect(page.getByText("Jan Testowy").first()).toBeVisible({
    timeout: actionTimeout,
  });
  await page.screenshot({
    path: "artifacts/isk-345/04-lista-zgloszen.png",
    fullPage: true,
  });
  // Tak samo dla zgloszen: wchodzimy w szczegol wiersza nalezacego do tego
  // testu, a nie w pierwszy wiersz listy.
  await page
    .getByRole("row")
    .filter({ hasText: "Jan Testowy" })
    .first()
    .getByRole("link", { name: "Zobacz szczegóły" })
    .click();
  await expect(page.getByText("Treść jest niezmienna")).toBeVisible({
    timeout: actionTimeout,
  });
  await expect(page.getByText("Oczekuje na wysyłkę")).toBeVisible();
  await page.screenshot({
    path: "artifacts/isk-345/05-szczegol-zgloszenia.png",
    fullPage: true,
  });
});

test("publikacja pokazuje szkolenie publicznie, a wycofanie je ukrywa", async ({
  page,
}) => {
  // Stan wyjściowy: szkolenie jest szkicem, więc RLS nie wpuszcza roli anon.
  const service = serviceClient();
  await service
    .from("trainings")
    .update({ is_published: false, published_at: null })
    .eq("slug", "e5-bezpieczna-praca");

  await page.goto("/szkolenia");
  await expect(page.getByText(trainingTitle)).toBeHidden({
    timeout: actionTimeout,
  });

  await login(page, adminEmail);
  await page.goto("/panel/szkolenia");
  const row = page.getByRole("row").filter({ hasText: trainingTitle });
  await expect(row).toBeVisible({ timeout: actionTimeout });
  await row.getByRole("button", { name: "Publikuj" }).click();
  await expect(row.getByText("Opublikowane")).toBeVisible({
    timeout: actionTimeout,
  });

  // Bez ręcznego odświeżania cache: inwalidacja z Server Action musi wystarczyć.
  await page.goto("/szkolenia");
  await expect(page.getByText(trainingTitle)).toBeVisible({
    timeout: actionTimeout,
  });

  await page.goto("/panel/szkolenia");
  await row.getByRole("button", { name: "Wycofaj" }).click();
  await expect(row.getByText("Szkic")).toBeVisible({
    timeout: actionTimeout,
  });

  await page.goto("/szkolenia");
  await expect(page.getByText(trainingTitle)).toBeHidden({
    timeout: actionTimeout,
  });

  /**
   * ISK-374 BL-A: publikacja i wycofanie są operacjami administracyjnymi, które ADR-0003
   * wymaga zapisać w dzienniku. Wcześniej panel nie pisał do `admin_audit_log` ani jednego
   * wiersza. Czytamy dziennik kluczem service_role, bo z sesji panelu jest on tylko do
   * odczytu, a zapis idzie wyłącznie przez funkcję `log_admin_action()`.
   */
  const { data: trainingRow } = await service
    .from("trainings")
    .select("id")
    .eq("slug", "e5-bezpieczna-praca")
    .single();
  const { data: auditRows } = await service
    .from("admin_audit_log")
    .select("action, entity, actor_id")
    .eq("entity_id", trainingRow!.id);
  expect(new Set(auditRows?.map((row) => row.action))).toEqual(
    new Set(["training.publish", "training.unpublish"]),
  );
  for (const row of auditRows ?? []) {
    expect(row.entity).toBe("training");
    // Autora wpisu wymusza baza z sesji administratora, nie warstwa aplikacji.
    expect(row.actor_id).not.toBeNull();
  }
});

async function createStatusInquiry(label: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("inquiries")
    .insert({
      kind: "firma",
      full_name: `${label} ${Date.now()}`,
      email: "status.cykl@example.invalid",
      phone: "+48 500 000 001",
      company_name: "Przykładowa Firma",
      interest_area: "Szkolenie BHP",
      message: "Zgłoszenie kontrolne cyklu statusów.",
      rodo_ack: true,
      rodo_clause_version: "test-e5",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

/**
 * ISK-374 BL-B: panel dopuszczał tylko `nowe → w_toku → zamkniete`, a ADR-0003 (D7),
 * `model-danych.md` §3.6 i trigger w bazie dopuszczają cztery przejścia — w tym
 * zamknięcie od razu i ponowne otwarcie. Poprzednia wersja tego testu asertowała, że
 * „zamknięte nie ma żadnego przejścia”, czyli utrwalała odstępstwo zamiast je wyłapać.
 */
test("status zgłoszenia przechodzi cykl nowe → w toku → zamknięte i da się otworzyć ponownie", async ({
  page,
}) => {
  const inquiryId = await createStatusInquiry("Status Cykl");

  await login(page, adminEmail);
  await page.goto(`/panel/zgloszenia/${inquiryId}`);
  const status = page.locator(".panel-status.is-large");
  await expect(status).toHaveText("Nowe", { timeout: actionTimeout });

  // Z „nowe” są dwie drogi: obsługa albo zamknięcie od razu (np. spam).
  await expect(
    page.getByRole("button", { name: "Ustaw: W toku" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ustaw: Zamknięte" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Ustaw: Nowe" })).toBeHidden();

  await page.getByRole("button", { name: "Ustaw: W toku" }).click();
  await expect(status).toHaveText("W toku", { timeout: actionTimeout });

  await expect(page.getByRole("button", { name: "Ustaw: Nowe" })).toBeHidden();
  await page.getByRole("button", { name: "Ustaw: Zamknięte" }).click();
  await expect(status).toHaveText("Zamknięte", { timeout: actionTimeout });

  // Zamknięte zgłoszenie można otworzyć ponownie — i tylko do „w toku”.
  await expect(page.getByText("Zgłoszenie jest zamknięte.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ustaw: Nowe" })).toBeHidden();
  await page.getByRole("button", { name: "Ustaw: W toku" }).click();
  await expect(status).toHaveText("W toku", { timeout: actionTimeout });
});

test("zgłoszenie można zamknąć od razu, bez przechodzenia przez „w toku”", async ({
  page,
}) => {
  const inquiryId = await createStatusInquiry("Status Spam");

  await login(page, adminEmail);
  await page.goto(`/panel/zgloszenia/${inquiryId}`);
  const status = page.locator(".panel-status.is-large");
  await expect(status).toHaveText("Nowe", { timeout: actionTimeout });

  await page.getByRole("button", { name: "Ustaw: Zamknięte" }).click();
  await expect(status).toHaveText("Zamknięte", { timeout: actionTimeout });

  // Przejście przeszło także przez trigger bazy, a nie tylko przez mapę w kodzie.
  const { data } = await serviceClient()
    .from("inquiries")
    .select("status, closed_at")
    .eq("id", inquiryId)
    .single();
  expect(data?.status).toBe("zamkniete");
  expect(data?.closed_at).not.toBeNull();

  // ISK-374 BL-A: zmiana statusu zostawia ślad w dzienniku audytu — bez danych osobowych.
  const audit = await serviceClient()
    .from("admin_audit_log")
    .select("action, entity, actor_id, details")
    .eq("entity_id", inquiryId);
  expect(audit.data).toHaveLength(1);
  expect(audit.data?.[0]).toMatchObject({
    action: "inquiry.status_change",
    entity: "inquiry",
    // ISK-374 U3: `details` ma TYLKO status docelowy. Wcześniejsza wersja zapisywała też
    // `from`, odczytane przed UPDATE-em — przy dwóch równoległych zmianach byłby to stan
    // z momentu odczytu, a nie faktyczny poprzedni. Jedyne źródło prawdy dla przejścia to
    // `inquiry_status_history`, która dostaje `from`/`to` z `OLD.status` w triggerze.
    details: { to: "zamkniete" },
  });
  expect(audit.data?.[0]?.details).not.toHaveProperty("from");
  expect(audit.data?.[0]?.actor_id).not.toBeNull();

  // Przejście jest też zapisane w historii — i to ona zna prawdziwy stan poprzedni.
  const history = await serviceClient()
    .from("inquiry_status_history")
    .select("from_status, to_status")
    .eq("inquiry_id", inquiryId);
  expect(history.data).toMatchObject([
    { from_status: "nowe", to_status: "zamkniete" },
  ]);
});
