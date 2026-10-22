/**
 * ISK-401 / M2 — przelacznik audytorium na stronie glownej.
 *
 * CO TEN PLIK MA UDOWODNIC
 * Jedno zdanie, na ktorym stoi cala decyzja projektowa M2: przelacznik
 * "Dla Ciebie / Dla firm" jest PERSONALIZACJA TRESCI, a nie filtrem danych.
 * Gdyby byl filtrem, model danych musialby dostac kolumne rozroznienia
 * audytorium — a migracje sa w ISK-399 zabronione. Dlatego nie wystarczy
 * pokazac, ze tekst sie zmienia: trzeba pokazac, ze DANE sie NIE zmieniaja.
 * Karta ISK-348 pokazala juz raz, jak latwo jest dostarczyc widok, ktory
 * "dziala", a odpowiada na inne pytanie niz zadane.
 *
 * Teksty importujemy z `lib/audience.ts`, zamiast przepisywac je do testu:
 * przepisana kopia rozjezdza sie przy pierwszej zmianie copy i wtedy bramka
 * albo klamie (zielona na napisie, ktorego nikt nie widzi), albo zglasza
 * regresje, ktora jest literowka w tescie.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  AUDIENCE_COPY,
  AUDIENCE_SWITCH_LABELS,
  type Audience,
} from "../../lib/audience";

const OSOBA = AUDIENCE_COPY.osoba;
const FIRMA = AUDIENCE_COPY.firma;

/**
 * Kontrolki wskazujemy po `name`/`value`, a nie po nazwie dostepnej.
 *
 * `SegmentedControl` renderuje `input[type=radio]` w `span`ie, a etykiete
 * w drugim `span`ie — bez `label`, `aria-label` ani `aria-labelledby`. Opcje
 * NIE MAJA wiec nazwy dostepnej (osobny test nizej mierzy to wprost, bo jest to
 * defekt, a nie decyzja). Gdyby pozostale asercje szly przez
 * `getByRole("radio", { name })`, padlyby wszystkie naraz i z tym samym
 * komunikatem — a chcemy wiedziec osobno, czy przelacznik DZIALA i czy jest
 * NAZWANY.
 */
function heroOpcja(page: Page, value: Audience): Locator {
  return page.locator(`input[name="audience-hero"][value="${value}"]`);
}

function kontaktOpcja(page: Page, value: Audience): Locator {
  return page.locator(`input[name="audience-contact"][value="${value}"]`);
}

/** Pierwsza akcja hero to CTA niosace stan audytorium w adresie. */
function heroCta(page: Page): Locator {
  return page.locator(".home-hero-actions a").first();
}

test("stan domyslny pokazuje tresc dla osoby indywidualnej", async ({
  page,
}) => {
  await page.goto("/");

  // Stanem domyslnym jest `osoba` — nie "pusty" ani "oba naraz". Gdyby hero
  // startowalo bez wybranej opcji, `:checked` nie wskazywaloby niczego, a tresc
  // i tak musialaby cos pokazac: rozjazd miedzy pastylka a tekstem.
  await expect(heroOpcja(page, "osoba")).toBeChecked();
  await expect(heroOpcja(page, "firma")).not.toBeChecked();

  await expect(page.locator(".home-hero .ui-eyebrow")).toHaveText(
    OSOBA.heroEyebrow,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    OSOBA.heroTitle,
  );
  await expect(page.locator(".home-hero-lead")).toHaveText(OSOBA.heroLead);
  await expect(heroCta(page)).toContainText(OSOBA.heroCta);

  await expect(page.locator("#jak .ui-section-title")).toHaveText(
    OSOBA.processTitle,
  );
  await expect(page.locator("#jak .ui-section-lead")).toHaveText(
    OSOBA.processLead,
  );
  // Tablica w `toHaveText` sprawdza LICZBE i tresc naraz: trzy kroki zamiast
  // czterech albo mieszanka krokow z dwoch wariantow sa bledem.
  await expect(page.locator("#jak .home-step-title")).toHaveText(
    OSOBA.processSteps.map((step) => step.title),
  );

  await expect(page.locator("#kontakt .ui-section-title")).toHaveText(
    OSOBA.contactTitle,
  );
});

test("przelaczenie na firme zmienia caly zestaw tresci, nie tylko H1", async ({
  page,
}) => {
  await page.goto("/");
  await heroOpcja(page, "firma").check();

  // Szesc miejsc, ktore czytaja ten jeden stan. Asercja na samym H1 przeszlaby
  // takze wtedy, gdyby sekcja procesu albo naglowek kontaktu zostaly przy
  // tresci dla osoby indywidualnej — czyli przy widoku mowiacym dwie rzeczy
  // naraz do dwoch roznych odbiorcow.
  await expect(page.locator(".home-hero .ui-eyebrow")).toHaveText(
    FIRMA.heroEyebrow,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    FIRMA.heroTitle,
  );
  await expect(page.locator(".home-hero-lead")).toHaveText(FIRMA.heroLead);
  await expect(heroCta(page)).toContainText(FIRMA.heroCta);
  await expect(page.locator("#jak .ui-section-title")).toHaveText(
    FIRMA.processTitle,
  );
  await expect(page.locator("#jak .home-step-title")).toHaveText(
    FIRMA.processSteps.map((step) => step.title),
  );
  await expect(page.locator("#kontakt .ui-section-title")).toHaveText(
    FIRMA.contactTitle,
  );

  // Kontrola: to sa NAPRAWDE inne napisy. Gdyby ktos kiedys wyrownal oba
  // warianty copy, wszystkie asercje wyzej przechodzilyby, nie mierzac niczego.
  expect(FIRMA.heroTitle).not.toBe(OSOBA.heroTitle);
  expect(FIRMA.processSteps.map((step) => step.title)).not.toEqual(
    OSOBA.processSteps.map((step) => step.title),
  );
});

test("przelacznik nie filtruje danych — katalog, obszary i ceny sa identyczne", async ({
  page,
}) => {
  await page.goto("/");

  /** Nazwa dostepna + adres kazdego linku obszaru. */
  const obszary = () =>
    page
      .locator("#obszary a.home-area")
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            `${node.getAttribute("aria-label")} -> ${node.getAttribute("href")}`,
        ),
      );
  /** To samo dla kart wyroznionych szkolen. */
  const karty = () =>
    page
      .locator(".home-featured-grid a.training-card")
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            `${node.getAttribute("aria-label")} -> ${node.getAttribute("href")}`,
        ),
      );
  const ceny = () =>
    page.locator(".home-featured-grid .training-card-price").allInnerTexts();

  const obszaryPrzed = await obszary();
  const kartyPrzed = await karty();
  const cenyPrzed = await ceny();

  // Bez tych trzech asercji caly test bylby pozorny: porownanie dwoch pustych
  // list zawsze przechodzi. Zasiew [DEMO] ma piec obszarow i co najmniej jedno
  // szkolenie wyroznione.
  expect(obszaryPrzed.length).toBeGreaterThan(1);
  expect(kartyPrzed.length).toBeGreaterThan(0);
  expect(cenyPrzed.length).toBe(kartyPrzed.length);

  await heroOpcja(page, "firma").check();
  // Dowod, ze przelaczenie FAKTYCZNIE sie stalo — inaczej "dane bez zmian"
  // byloby prawda o stronie, ktora nic nie zrobila.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    FIRMA.heroTitle,
  );

  expect(await obszary()).toEqual(obszaryPrzed);
  expect(await karty()).toEqual(kartyPrzed);
  // Ceny osobno: to one najszybciej padlyby ofiara "wariantu dla firm"
  // z innym cennikiem, czyli kolumny, ktorej model danych nie ma.
  expect(await ceny()).toEqual(cenyPrzed);

  // I w druga strone — stan `osoba` nie przywraca "innych" danych.
  await kontaktOpcja(page, "osoba").check();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    OSOBA.heroTitle,
  );
  expect(await obszary()).toEqual(obszaryPrzed);
  expect(await karty()).toEqual(kartyPrzed);
  expect(await ceny()).toEqual(cenyPrzed);
});

test("przelacznik dziala z klawiatury, a oba segmenty trzymaja jeden stan", async ({
  page,
}) => {
  await page.goto("/");

  // `fieldset` + `legend` + `radio` zamiast dwoch `button`ow (tak robi wzorzec)
  // daje natywna nawigacje strzalkami: Tab wchodzi do grupy RAZ, a lewo/prawo
  // przelacza wybor. Na `button`ach trzeba to napisac i wzorzec tego nie robi.
  const osoba = heroOpcja(page, "osoba");
  await osoba.focus();
  await expect(osoba).toBeFocused();
  await page.keyboard.press("ArrowRight");

  await expect(heroOpcja(page, "firma")).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    FIRMA.heroTitle,
  );
  // Strzalka w lewo wraca — gdyby stan niosl `onClick`, a nie grupa radio,
  // ten krok nie zadzialalby wcale.
  await page.keyboard.press("ArrowLeft");
  await expect(heroOpcja(page, "osoba")).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    OSOBA.heroTitle,
  );

  // Na stronie stoja DWA przelaczniki tego samego stanu (hero i karta
  // kontaktu). Dwie niezalezne kontrolki pokazywalyby sprzeczny wybor:
  // "Dla firm" w hero i "Osoba indywidualna" nizej, przy jednym CTA.
  await heroOpcja(page, "firma").check();
  await expect(kontaktOpcja(page, "firma")).toBeChecked();
  await expect(kontaktOpcja(page, "osoba")).not.toBeChecked();

  await kontaktOpcja(page, "osoba").check();
  await expect(heroOpcja(page, "osoba")).toBeChecked();
  await expect(heroOpcja(page, "firma")).not.toBeChecked();

  // Grupy maja etykiete — grupa radio bez `legend` jest ogloszana jako "grupa"
  // i nie wiadomo, czego dotyczy wybor. Czytamy `textContent`, a nie
  // `innerText`: legenda hero jest schowana wzrokowo (`ui-visually-hidden`,
  // 1x1 px z `clip-path`), a schowana wzrokowo nadal MUSI istniec dla czytnika.
  const legendy = await page
    .locator("fieldset.ui-segmented-group > legend")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  expect(legendy.length).toBeGreaterThanOrEqual(2);
  for (const legenda of legendy)
    expect(legenda.trim().length).toBeGreaterThan(0);
});

/**
 * Osobny test, bo mierzy inna wlasnosc niz dzialanie przelacznika i ma padac
 * osobno: `components/ui/segmented-control.tsx` zawija `input[type=radio]`
 * w `span`, nie w `label`, i nie podaje `aria-label`. Opcja nie ma wiec zadnej
 * nazwy dostepnej — czytnik ekranu oglasza "opcja 1 z 2", nie mowiac, ktora.
 * Docblock komponentu obiecuje dokladnie to, czego brakuje ("czytnik ekranu
 * oglasza grupa <legend>, opcja 1 z 2, zaznaczone"), a `tests/unit` sprawdzaja
 * nazwy klas, nie drzewo dostepnosci — dlatego defekt przezyl M1.
 */
test("kazda opcja przelacznika ma wlasna nazwe dostepna (WCAG 4.1.2)", async ({
  page,
}) => {
  await page.goto("/");
  for (const value of ["osoba", "firma"] as const) {
    await expect(
      heroOpcja(page, value),
      `opcja ${value} w hero nie ma nazwy dostepnej — radio bez \`label\`/\`aria-label\``,
    ).toHaveAccessibleName(AUDIENCE_SWITCH_LABELS[value]);
  }
});

test("CTA hero przenosi wybrany rodzaj zgloszenia do formularza", async ({
  page,
}) => {
  await page.goto("/");

  // Wybor zrobiony na stronie glownej musi dojsc do `/kontakt`, inaczej osoba
  // wskazuje to samo dwa razy. `?rodzaj=` jest tu kontraktem miedzy widokami.
  await expect(heroCta(page)).toHaveAttribute("href", "/kontakt?rodzaj=osoba");

  await heroOpcja(page, "firma").check();
  await expect(heroCta(page)).toHaveAttribute("href", "/kontakt?rodzaj=firma");

  // Link dziala, a nie tylko ma poprawny atrybut.
  await heroCta(page).click();
  await expect(page).toHaveURL(/\/kontakt\?rodzaj=firma$/);
});
