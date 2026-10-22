/**
 * ISK-403 / M4a — REGRESJA FUNKCJONALNA po restylizacji (zakres pkt 4 karty).
 *
 * Pytanie tego pliku nie jest „czy wyglada jak wzorzec", a „czy po przebudowie
 * warstwy wizualnej dotychczasowe przeplywy nadal dzialaja". Dlatego kazda
 * asercja celuje w SKUTEK (wiersz w bazie, zawezona lista, tresc szczegolu),
 * nie w obecnosc elementu.
 *
 * Pulapki tego repo, ktore sa tu obchodzone swiadomie:
 *  - Limit czestosci formularza: 3 PRZYJETE zgloszenia / 10 min na wiadro
 *    `127.0.0.1`. Po przekroczeniu route zwraca 200 + ekran „Dziekujemy"
 *    i NIC NIE ZAPISUJE, wiec awaria ujawnia sie dopiero jako brak wiersza.
 *    Kazdy test czyszczacy licznik (`clearThrottle`) i liczymy przyjete wysylki.
 *  - Token antybotowy wymaga >= 3 s od wydania; `awaitFormTokenMaturity`
 *    odczekuje stala, nie liczy `performance.now()` (to wiek dokumentu).
 *  - Ekran potwierdzenia pojawia sie IDENTYCZNIE przy zapisie i przy cichym
 *    odrzuceniu, wiec sam `role="status"` nie dowodzi niczego.
 */
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { clearThrottle, sfx } from "./helpers/data";
import { awaitFormTokenMaturity } from "./helpers/form";
import { serviceClient } from "./helpers/stack";

const ZNACZNIK = "ISK403-REG";

test.describe("katalog, filtrowanie i wyszukiwanie", () => {
  test("filtr obszaru zawezA liste i niesie aria-current", async ({ page }) => {
    await page.goto("/szkolenia");
    const wszystkie = await page.locator(".training-card").count();
    expect(wszystkie).toBeGreaterThan(1);

    await page.goto("/szkolenia?category=esg");
    const poFiltrze = page.locator(".training-card");
    const liczbaPoFiltrze = await poFiltrze.count();

    // Asercja NEGATYWNA: filtr musi faktycznie odciac pozycje, a nie tylko
    // podswietlic pigulke. Bez tego test przechodzi takze wtedy, gdy filtr
    // nie filtruje.
    expect(liczbaPoFiltrze).toBeGreaterThan(0);
    expect(liczbaPoFiltrze).toBeLessThan(wszystkie);
    await expect(poFiltrze.first()).toContainText(/ESG|Zrównoważony/i);

    // Stan filtra jest w adresie i oznaczony dla czytnika ekranu.
    await expect(
      page.locator('.catalog-pills [aria-current="page"]'),
    ).toHaveCount(1);
  });

  test("wyszukiwanie po frazie z polskimi diakrytykami zwraca wynik", async ({
    page,
  }) => {
    // `search_tsv` stoi na tekscie PO `unaccent`, wiec fraza musi przejsc te
    // sama normalizacje (`unaccentPl`). Brak normalizacji daje zero wynikow
    // PO CICHU — ekran „brak wynikow" wyglada wtedy jak poprawny stan pusty.
    await page.goto("/szkolenia?q=zr%C3%B3wnowa%C5%BCony");
    const karty = page.locator(".training-card");
    await expect(karty).toHaveCount(1);
    await expect(karty.first()).toContainText(/Zrównoważony/i);

    // Kontrola: ta sama fraza bez diakrytykow musi dac ten sam wynik.
    await page.goto("/szkolenia?q=zrownowazony");
    await expect(page.locator(".training-card")).toHaveCount(1);
  });

  test("fraza bez trafien daje jawny stan pusty, nie puste tlo", async ({
    page,
  }) => {
    await page.goto("/szkolenia?q=niczegotakiegoniema");
    await expect(page.locator(".training-card")).toHaveCount(0);
    // Stan pusty musi byc KOMUNIKATEM, nie brakiem tresci.
    await expect(page.locator("main")).toContainText(
      /Brak|Nie znaleziono|nie ma/i,
    );
  });

  test("szczegol szkolenia pokazuje program, efekty i cene katalogowa", async ({
    page,
  }) => {
    await page.goto("/szkolenia/wprowadzenie-do-ai");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("main")).toContainText("Czego się nauczysz");
    await expect(page.locator("main")).toContainText("Program szkolenia");

    // D1: cena katalogowa BEZ mnoznika 0.2. Baza ma 1990.00 netto.
    const { data } = await serviceClient()
      .from("trainings")
      .select("price_net_pln")
      .eq("slug", "wprowadzenie-do-ai")
      .single();
    const cena = Number(data?.price_net_pln);
    expect(cena).toBe(1990);
    const tekst = (await page.locator("main").innerText()).replace(/\s/g, "");
    // Cena katalogowa musi byc widoczna; wartosc po mnozniku 0.2 (398) nie moze.
    expect(tekst).toMatch(/1990|1 990/);
    expect(tekst).not.toMatch(/\b398\b/);
  });

  test("nieistniejace szkolenie zwraca 404, nie puste 200", async ({ page }) => {
    const odp = await page.goto("/szkolenia/nie-ma-takiego-szkolenia");
    // Asercja na STATUSIE, nie na tresci: strona 404 z kodem 200 jest defektem
    // SEO, ktorego asercja tekstowa nie widzi.
    expect(odp?.status()).toBe(404);
    await expect(page.locator("body")).toContainText(/nie znal|404|nie istnie/i);
  });

  test("lista trenerow pokazuje tylko opublikowanych", async ({ page }) => {
    await page.goto("/trenerzy");
    const tresc = await page.locator("main").innerText();
    expect(tresc).toContain("Jan");
    // `isk405-probe-unpub` jest nieopublikowany — nie moze wyciec na publiczna strone.
    expect(tresc).not.toMatch(/isk405|probe-unpub/i);
  });
});

test.describe("formularz zgloszenia — walidacja i bramka RODO", () => {
  test.beforeEach(async () => {
    await clearThrottle();
  });

  test("brak zgody RODO blokuje wysylke i nic nie zapisuje", async ({
    page,
  }) => {
    const email = `${ZNACZNIK}-rodo-${sfx()}@example.invalid`;
    await page.goto("/kontakt");
    await page.getByRole("radio", { name: "Osoba indywidualna" }).check();
    await page.getByLabel("Imię i nazwisko").fill(`${ZNACZNIK} Bez Zgody`);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Telefon").fill("+48 600 100 403");
    await page
      .getByLabel("Interesujące szkolenie lub obszar")
      .fill(`${ZNACZNIK} obszar`);
    await page.getByLabel("Wiadomość").fill("Tresc bez zgody RODO.");
    // Checkbox RODO celowo NIE zaznaczony.
    await awaitFormTokenMaturity(page);
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    // Blad walidacji musi byc OGLOSZONY, nie tylko pokolorowany.
    await expect(page.locator("main")).toContainText(
      /RODO|zgod|wymagan|Potwierdz/i,
    );

    // Dowodem jest BRAK wiersza. `undefined` = brak wiersza (ciche odrzucenie
    // albo zatrzymanie po stronie klienta), nie blad mapowania.
    const { data } = await serviceClient()
      .from("inquiries")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    expect(data ?? undefined).toBeUndefined();
  });

  test("poprawne zgloszenie zapisuje wiersz z wersja klauzuli RODO", async ({
    page,
  }) => {
    const email = `${ZNACZNIK}-ok-${sfx()}@example.invalid`;
    await page.goto("/kontakt");
    await page.getByRole("radio", { name: "Osoba indywidualna" }).check();
    await page.getByLabel("Imię i nazwisko").fill(`${ZNACZNIK} Jan Poprawny`);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Telefon").fill("+48 600 100 404");
    await page
      .getByLabel("Interesujące szkolenie lub obszar")
      .fill(`${ZNACZNIK} obszar`);
    await page.getByLabel("Wiadomość").fill("Poprawna tresc zgloszenia QA.");
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

    // Ekran potwierdzenia NIE dowodzi zapisu — dopiero wiersz.
    const { data } = await serviceClient()
      .from("inquiries")
      .select("kind,status,rodo_ack,rodo_clause_version")
      .eq("email", email)
      .single();
    expect(data?.kind).toBe("osoba");
    expect(data?.status).toBe("nowe");
    expect(data?.rodo_ack).toBe(true);
    // Rozliczalnosc z art. 5 ust. 2 — wersja klauzuli zapisana przy zgloszeniu.
    expect(data?.rodo_clause_version).toBeTruthy();
  });
});

test.describe("panel — status, notatka wewnetrzna, szczegol", () => {
  test("zmiana statusu, notatka i historia dzialaja po restylizacji", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const svc = serviceClient();
    const { data: wstawione, error } = await svc
      .from("inquiries")
      .insert({
        kind: "indywidualne",
        full_name: `${ZNACZNIK} Panel Przeplyw`,
        email: `${ZNACZNIK}-panel-${sfx()}@example.invalid`,
        phone: "+48 600 100 405",
        message: "Zgloszenie do testu przeplywu panelu.",
        rodo_ack: true,
        rodo_clause_version: "DRAFT-0-niezatwierdzona",
        source_path: "/kontakt",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const id = wstawione!.id as string;

    await loginAsAdmin(page);

    // Lista musi pokazac nowe zgloszenie.
    await page.goto("/panel/zgloszenia");
    await expect(page.locator("table")).toContainText(`${ZNACZNIK} Panel`);

    // Szczegol — produkt ma go mimo ze wzorzec jest tu tylko do odczytu.
    await page.goto(`/panel/zgloszenia/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `${ZNACZNIK} Panel`,
    );
    await expect(page.locator("main, body")).toContainText("Treść zgłoszenia");

    // Notatka wewnetrzna (kolumna `admin_note` dostala UI dopiero w ISK-402).
    const notatka = `${ZNACZNIK} notatka ${sfx()}`;
    await page.getByLabel("Treść notatki").fill(notatka);
    await page.getByRole("button", { name: "Zapisz notatkę" }).click();
    await expect(page.getByLabel("Treść notatki")).toHaveValue(notatka);

    const { data: poNotatce } = await svc
      .from("inquiries")
      .select("admin_note")
      .eq("id", id)
      .single();
    expect(poNotatce?.admin_note).toBe(notatka);

    // Zmiana statusu „nowe" -> „w toku".
    await page.getByRole("button", { name: /Ustaw: W toku/ }).click();
    await expect(page.locator("body")).toContainText("W toku");

    const { data: poStatusie } = await svc
      .from("inquiries")
      .select("status,first_handled_at")
      .eq("id", id)
      .single();
    expect(poStatusie?.status).toBe("w_toku");
    // Przejscie musi odlozyc znacznik obslugi, nie tylko przemalowac pigulke.
    expect(poStatusie?.first_handled_at).toBeTruthy();

    // Historia statusow zostaje (tabela `inquiry_status_history`).
    const { data: historia } = await svc
      .from("inquiry_status_history")
      .select("to_status")
      .eq("inquiry_id", id);
    expect((historia ?? []).length).toBeGreaterThan(0);

    await svc.from("inquiries").delete().eq("id", id);
  });

  test("uzytkownik bez uprawnien nie wchodzi do panelu", async ({ page }) => {
    await page.goto("/panel/zgloszenia");
    // Niezalogowany musi wyladowac na logowaniu, nie zobaczyc danych osobowych.
    await expect(page).toHaveURL(/\/panel\/logowanie/);
    await expect(page.locator("body")).not.toContainText(ZNACZNIK);
  });
});

test.afterAll(async () => {
  const svc = serviceClient();
  await svc.from("inquiries").delete().like("full_name", `${ZNACZNIK}%`);
});
