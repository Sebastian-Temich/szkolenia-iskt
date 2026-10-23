// Zrzuty do `docs/instrukcja-administratora/` (ISK-427).
//
// DLACZEGO TO JEST SPEC, A NIE RECZNE PRZEJSCIE
// Poprzedni zestaw 18 zrzutow zrobiono recznie 2026-10-09 (`9469014`) i do
// odbioru V1 nikt ich nie odswiezyl — raport ISK-408 (N1) zastal instrukcje
// pokazujaca panel sprzed calego redesignu M3. Reczne przejscie starzeje sie
// po cichu: nikt nie wie, ze zrzut jest stary, dopoki ktos nie porowna go
// z produktem. Zapisane jako spec, zestaw odtwarza sie jedna komenda, wiec
// przy kolejnej zmianie UI koszt odswiezenia to jeden przebieg.
//
// NAZWY PLIKOW SA KONTRAKTEM
// `README.md` instrukcji odwoluje sie do `images/NN-nazwa.png`. Lista ponizej
// musi zgadzac sie z tamtymi odwolaniami — inaczej instrukcja pokaze zepsute
// obrazki. Dlatego nazwy stoja w jednym miejscu (`SHOT`), a nie w literalach
// rozsianych po tescie.
//
// JAK URUCHOMIC
//   INSTRUKCJA_DIR=docs/instrukcja-administratora/images \
//   PLAYWRIGHT_USE_BUILD=1 npx playwright test zrzuty-instrukcji --workers=1
//
// Bez `INSTRUKCJA_DIR` cale pliki sa pomijane — w CI nie chcemy nadpisywac
// dokumentacji przy kazdym przebiegu. `PLAYWRIGHT_USE_BUILD=1` jest WAZNE:
// `next dev` wstrzykuje wlasna nakladke bledow i wskazniki kompilacji, ktore
// trafilyby na zrzut i czytalyby sie jak element produktu.
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin, loginViaUi } from "./helpers/auth";
import { createInquiry } from "./helpers/data";
import { ADMIN_EMAIL, serviceClient } from "./helpers/stack";

const outputDirectory = process.env.INSTRUKCJA_DIR;

const SHOT = {
  login: "01-logowanie",
  loginError: "02-logowanie-blad",
  dashboard: "03-pulpit-panelu",
  trainerNew: "04-trener-dodawanie-bez-zdjecia",
  trainerDraft: "05-trener-zapisany-szkic",
  trainerEdit: "06-trener-edycja",
  trainerPublic: "07-profil-trenera-bez-zdjecia",
  trainingNew: "08-szkolenie-dodawanie",
  trainingDraft: "09-szkolenie-zapisane-szkic",
  trainingEdit: "10-szkolenie-edycja",
  trainingPublished: "11-szkolenie-opublikowane-panel",
  trainingPublicPage: "12-szkolenie-opublikowane-publicznie",
  trainingWithdrawn: "13-szkolenie-wycofane-panel",
  trainingWithdrawnPublic: "14-szkolenie-wycofane-publicznie",
  inquiryList: "15-zgloszenia-lista",
  inquiryNew: "16-zgloszenie-szczegoly-nowe",
  inquiryInProgress: "17-zgloszenie-w-toku",
  inquiryClosed: "18-zgloszenie-zamkniete",
} as const;

/**
 * Dane pokazywane na zrzutach.
 *
 * Nazwy sa DOKLADNIE te, ktorych instrukcja uzywa jako przykladow
 * (`anna-kowalska` w §2, `zarzadzanie-projektem` w §3) — czytelnik ma widziec
 * na obrazku to samo, co przeczytal w kroku. Pozostaja jawnie fikcyjne:
 * zadna realna osoba, cena ani termin (ADR-0002 §6).
 *
 * Slug jest STALY, nie losowy: zrzut z losowym sufiksem w adresie wygladalby
 * na artefakt testu, a nie na panel. Cene za to zbijamy do okraglej liczby,
 * zeby nikt nie wzial jej za cennik ISKT.
 */
const TRAINER = {
  slug: "anna-kowalska",
  fullName: "Anna Kowalska",
  headline: "Przykładowy nagłówek profilu (dane demonstracyjne)",
  bio: "Fikcyjny biogram trenerki na potrzeby instrukcji administratora.",
  competences: "Zarządzanie projektem, Komunikacja",
} as const;

const TRAINING = {
  slug: "zarzadzanie-projektem",
  title: "Zarządzanie projektem",
  summary:
    "Przykładowe szkolenie z zarządzania projektem (dane demonstracyjne).",
  description:
    "Fikcyjny opis szczegółowy szkolenia demonstracyjnego na potrzeby instrukcji.",
  duration: "16",
  price: "1000",
  outcomes: "Planuje projekt\nProwadzi spotkanie statusowe",
  audience: "Osoby rozpoczynające pracę z projektami",
} as const;

/**
 * Sprzata wiersze instrukcji ZANIM i PO przebiegu.
 *
 * Przed: slug jest staly, wiec niedokonczony poprzedni przebieg zostawilby
 * wiersz, na ktorym `insert` przez formularz padlby na unikalnosc slugu —
 * i czytaloby sie to jak blad walidacji formularza, nie jak brud po testach.
 */
async function cleanup(): Promise<void> {
  const svc = serviceClient();
  await svc.from("trainings").delete().eq("slug", TRAINING.slug);
  await svc.from("trainers").delete().eq("slug", TRAINER.slug);
}

async function shoot(page: Page, name: string): Promise<void> {
  // Zrzuty ida do repozytorium, wiec musza byc powtarzalne: bez kursora
  // mrugajacego w polu i bez animacji w polowie przejscia.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(outputDirectory!, `${name}.png`),
    fullPage: true,
  });
}

/**
 * Pomijanie idzie PRZEZ CIALO TESTU, nie przez cialo `describe`.
 *
 * `test.skip(warunek, powod)` jest wspierane w tescie, w `beforeEach` i jako
 * wariant z callbackiem — w ciele `describe` ta dwuargumentowa forma nie jest
 * udokumentowana. `visual-evidence.spec.ts` rozwiazuje to samo zadanie
 * (zrzuty tylko przy ustawionym katalogu) wlasnie tak, wiec trzymamy jeden
 * idiom w obu plikach.
 */
function skipUnlessConfigured(): void {
  test.skip(
    !outputDirectory,
    "Ustaw INSTRUKCJA_DIR, aby wygenerowac zrzuty do instrukcji.",
  );
}

test.describe("Zrzuty do instrukcji administratora", () => {
  // Sekwencja jest NARRACJA: szkic -> edycja -> publikacja -> wycofanie.
  // Rownoleglosc rozsypalaby ja, a dwa workery walczylyby o ten sam slug.
  test.describe.configure({ mode: "serial" });

  // Hooki musza sprawdzic katalog SAME: `test.skip` z ciala testu nie powstrzyma
  // `beforeAll`, a `mkdir(undefined)` wywrocilby caly plik zamiast go pominac.
  test.beforeAll(async () => {
    if (!outputDirectory) return;
    await mkdir(outputDirectory, { recursive: true });
    await cleanup();
  });

  test.afterAll(async () => {
    if (!outputDirectory) return;
    await cleanup();
  });

  test.beforeEach(async ({ page }) => {
    // Jedna szerokosc dla calego zestawu. 1280 to ten sam desktopowy punkt,
    // ktorego uzywa `visual-evidence.spec.ts` — instrukcja opisuje prace przy
    // komputerze, a nie na telefonie.
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("01-02 logowanie: formularz i odmowa", async ({ page }) => {
    skipUnlessConfigured();
    await page.goto("/panel/logowanie");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await shoot(page, SHOT.login);

    // Odmowa uwierzytelnienia — wlasciwe haslo celowo zle.
    await loginViaUi(page, ADMIN_EMAIL, "zle-haslo-na-potrzeby-zrzutu");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Nie udało się zalogować");
    await shoot(page, SHOT.loginError);
  });

  test("03 pulpit panelu", async ({ page }) => {
    skipUnlessConfigured();
    await loginAsAdmin(page);
    await expect(
      page.getByRole("heading", { name: "Zarządzanie ofertą" }),
    ).toBeVisible();
    await shoot(page, SHOT.dashboard);
  });

  test("04-07 trener: dodanie, szkic, edycja, profil publiczny", async ({
    page,
  }) => {
    skipUnlessConfigured();
    await loginAsAdmin(page);
    await page.goto("/panel/trenerzy");
    await page.getByRole("link", { name: "Dodaj trenera" }).click();

    await page.getByLabel("Imię i nazwisko").fill(TRAINER.fullName);
    await page.getByLabel("Slug").fill(TRAINER.slug);
    await page.getByLabel("Nagłówek").fill(TRAINER.headline);
    await page.getByLabel("Biogram").fill(TRAINER.bio);
    await page
      .getByLabel("Kompetencje (po przecinku)")
      .fill(TRAINER.competences);
    // „URL zdjecia" zostaje PUSTE — zrzut 07 dokumentuje wlasnie profil bez
    // zdjecia, wiec formularz na zrzucie 04 musi byc w tym samym stanie.
    await shoot(page, SHOT.trainerNew);

    await page.getByRole("button", { name: "Zapisz trenera" }).click();
    const row = page.getByRole("row").filter({ hasText: TRAINER.fullName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Szkic")).toBeVisible();
    await shoot(page, SHOT.trainerDraft);

    await row.getByRole("link", { name: "Edytuj" }).click();
    await expect(page.getByLabel("Imię i nazwisko")).toHaveValue(
      TRAINER.fullName,
    );
    await shoot(page, SHOT.trainerEdit);

    // Publikacja jest warunkiem zrzutu 07: niepublikowany trener nie wychodzi
    // na publiczna liste.
    await page.goto("/panel/trenerzy");
    await row.getByRole("button", { name: "Publikuj" }).click();
    await expect(row.getByRole("button", { name: "Wycofaj" })).toBeVisible();

    // `/trenerzy/[slug]` jest POZA V1 (patrz nota w edytorze trenera), wiec
    // „profil bez zdjecia" to kafel na publicznej LISCIE, nie osobna strona.
    await page.goto("/trenerzy");
    await expect(page.getByText(TRAINER.fullName)).toBeVisible();
    await shoot(page, SHOT.trainerPublic);
  });

  test("08-14 szkolenie: szkic, edycja, publikacja, wycofanie", async ({
    page,
  }) => {
    skipUnlessConfigured();
    await loginAsAdmin(page);
    await page.goto("/panel/szkolenia");
    await page.getByRole("link", { name: "Dodaj szkolenie" }).click();

    await page.getByLabel("Tytuł", { exact: true }).fill(TRAINING.title);
    await page.getByLabel("Slug").fill(TRAINING.slug);
    await page.getByLabel("Podsumowanie").fill(TRAINING.summary);
    await page.getByLabel("Opis", { exact: true }).fill(TRAINING.description);
    // Kategoria: pierwsza opublikowana z zasiewu [DEMO]. Wybieramy po INDEKSIE,
    // nie po nazwie — nazwy kategorii zmieniaja sie wraz z seedem.
    await page.getByLabel("Kategoria").selectOption({ index: 1 });
    await page.getByLabel("Poziom").selectOption("podstawowy");
    await page.getByLabel("Czas (godz.)").fill(TRAINING.duration);
    await page.getByLabel("Cena netto PLN").fill(TRAINING.price);
    await page.getByLabel("Czego się nauczysz").fill(TRAINING.outcomes);
    await page.getByLabel("Dla kogo").fill(TRAINING.audience);
    // Zaznaczamy trenera, zeby zrzut pokazywal sekcje „Trenerzy" w uzyciu —
    // krok 10 instrukcji mowi wprost, ze mozna wybrac wiecej niz jedna osobe.
    const trainerCheckbox = page.getByRole("checkbox").first();
    if (await trainerCheckbox.isVisible()) await trainerCheckbox.check();
    await shoot(page, SHOT.trainingNew);

    await page.getByRole("button", { name: "Zapisz szkolenie" }).click();
    const row = page.getByRole("row").filter({ hasText: TRAINING.title });
    await expect(row).toBeVisible();
    await expect(row.getByText("Szkic")).toBeVisible();
    await shoot(page, SHOT.trainingDraft);

    await row.getByRole("link", { name: "Edytuj" }).click();
    await expect(page.getByLabel("Tytuł", { exact: true })).toHaveValue(
      TRAINING.title,
    );
    await shoot(page, SHOT.trainingEdit);

    await page.goto("/panel/szkolenia");
    await row.getByRole("button", { name: "Publikuj" }).click();
    await expect(row.getByText("Opublikowane")).toBeVisible();
    await shoot(page, SHOT.trainingPublished);

    await page.goto(`/szkolenia/${TRAINING.slug}`);
    await expect(
      page.getByRole("heading", { name: TRAINING.title }),
    ).toBeVisible();
    await shoot(page, SHOT.trainingPublicPage);

    await page.goto("/panel/szkolenia");
    await row.getByRole("button", { name: "Wycofaj" }).click();
    await expect(row.getByText("Szkic")).toBeVisible();
    await shoot(page, SHOT.trainingWithdrawn);

    // Po wycofaniu publiczny adres ma oddac 404 — to jest TRESC zrzutu 14,
    // wiec sprawdzamy jedno i drugie: status odpowiedzi i to, co widzi czlowiek.
    const response = await page.goto(`/szkolenia/${TRAINING.slug}`);
    expect(response?.status()).toBe(404);
    await shoot(page, SHOT.trainingWithdrawnPublic);
  });

  test("15-18 zgloszenie: lista, szczegoly, w toku, zamkniete", async ({
    page,
  }) => {
    skipUnlessConfigured();
    // Zgloszenie zakladamy przez `serviceClient`, nie przez publiczny formularz:
    // formularz ma honeypot, `MIN_FILL_MS` i wspolny limiter IP, ktore do zrzutu
    // nic nie wnosza, a potrafia przebieg wywrocic.
    const inquiry = await createInquiry();

    await loginAsAdmin(page);
    await page.goto("/panel/zgloszenia");
    const row = page.getByRole("row").filter({ hasText: inquiry.email });
    await expect(row).toBeVisible();
    await shoot(page, SHOT.inquiryList);

    await page.goto(`/panel/zgloszenia/${inquiry.id}`);
    await expect(
      page.getByRole("heading", { name: "Treść zgłoszenia" }),
    ).toBeVisible();
    // Karta „Notatka wewnetrzna" jest nowa w V1 (ISK-402) i instrukcja ja
    // teraz opisuje — zrzut 16 ma ja zawierac, wiec tego pilnujemy.
    await expect(
      page.getByRole("heading", { name: "Notatka wewnętrzna" }),
    ).toBeVisible();
    await shoot(page, SHOT.inquiryNew);

    await page.getByRole("button", { name: "Ustaw: W toku" }).click();
    await expect(page.getByText("W toku").first()).toBeVisible();
    await shoot(page, SHOT.inquiryInProgress);

    await page.getByRole("button", { name: "Ustaw: Zamknięte" }).click();
    await expect(page.getByText("Zamknięte").first()).toBeVisible();
    await shoot(page, SHOT.inquiryClosed);

    await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
  });
});
