import { expect, test } from "@playwright/test";

import { AUDIENCE_COPY, AUDIENCE_DEFAULT } from "../../lib/audience";
import {
  createDraftTraining,
  type DraftTraining,
} from "./helpers/draft-training";

// Skany axe dla tych samych widokow mieszkaja w `dostepnosc.spec.ts` — tutaj
// zostaje wylacznie dowod, ze widok sie renderuje i zwraca poprawny status.
// Wczesniej ta sama strona byla skanowana trzykrotnie (home/kontakt/public).
//
// H1 strony glownej zamrazal napis "Kompetencje, które zmieniają" — tresc,
// ktorej w produkcie nie ma: tytulem steruje przelacznik audytorium, a stanem
// domyslnym jest `osoba`. Tekst bierzemy z `lib/audience.ts`, a nie przepisujemy
// go tutaj: przepisana kopia rozjezdza sie przy pierwszej zmianie copy i wtedy
// bramka albo klamie (zielona na napisie, ktorego nikt nie widzi), albo zglasza
// regresje widoku, ktora jest literowka w tescie.
const pages = [
  ["/", AUDIENCE_COPY[AUDIENCE_DEFAULT].heroTitle],
  ["/szkolenia", "Znajdź szkolenie"],
  ["/szkolenia/wprowadzenie-do-ai", "[DEMO] Wprowadzenie do AI"],
  ["/trenerzy", "Ekspertki i eksperci"],
  // Strone /kontakt dostarcza E4 (hostuje formularz) — stad jej naglowek.
  ["/kontakt", "Zapytaj o szkolenie"],
] as const;

for (const [path, heading] of pages) {
  test(`${path} renderuje publiczny widok`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      heading,
    );
  });
}

test.describe("ochrona szkicow", () => {
  let draft: DraftTraining;

  test.beforeAll(async () => {
    draft = await createDraftTraining();
  });

  test.afterAll(async () => {
    await draft?.remove();
  });

  test("realny nieopublikowany wiersz zwraca 404 pod bezposrednim URL", async ({
    page,
  }) => {
    const response = await page.goto(`/szkolenia/${draft.slug}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Nie znaleźliśmy",
    );
  });

  test("szkic nie wycieka do katalogu ani do sitemap.xml", async ({
    page,
    request,
  }) => {
    await page.goto("/szkolenia");
    await expect(page.getByText("Szkic nieopublikowany")).toHaveCount(0);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain(draft.slug);
  });
});

// ISK-375. Test jednostkowy dowodzi, ze `lib/seo.ts` czyta `NEXT_PUBLIC_SITE_URL`,
// ale `NEXT_PUBLIC_*` Next.js WSTAWIA do bundla przy `next build` — wartosc
// widziana przez funkcje w locie nie musi byc ta, ktora wyladowala w artefakcie.
// Dlatego tutaj mierzymy odpowiedz realnego serwera (w CI: `npm run start` na
// buildzie z `npm run build`, PLAYWRIGHT_USE_BUILD=1).
//
// Adres aplikacji (`baseURL`, port 4173) jest CELOWO inny niz
// `NEXT_PUBLIC_SITE_URL` w CI (127.0.0.1:3000) — gdyby `robots.txt` zgadzal sie
// z adresem zadania zamiast z konfiguracja, ten test by to pokazal.
test.describe("adres kanoniczny z konfiguracji", () => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  test.beforeAll(() => {
    // W CI zmienna stoi na poziomie workflow (`ci.yml` -> `env`), lokalnie
    // ustawia ja `scripts/e2e-local.sh`. Pominiecie w CI zamienilo by ten test
    // w zielony no-op, czyli dokladnie w bramke, ktora przepuscila ISK-375.
    if (process.env.CI) {
      expect(
        configured,
        "NEXT_PUBLIC_SITE_URL musi byc ustawione w CI",
      ).toBeTruthy();
    }
  });

  test("robots.txt emituje host i sitemap z NEXT_PUBLIC_SITE_URL", async ({
    request,
  }) => {
    test.skip(
      !configured,
      "Brak NEXT_PUBLIC_SITE_URL w procesie testow — uruchom ./scripts/e2e-local.sh",
    );

    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();

    expect(body).toContain(`Host: ${configured}`);
    expect(body).toContain(`Sitemap: ${configured}/sitemap.xml`);
    // Negatyw: zahardkodowana domena produkcyjna nie moze wyciekac do artefaktu
    // zbudowanego z innym adresem. Bez tego testu publikacja preview zglosilaby
    // produkcyjny `Host` i kanoniki.
    expect(body).not.toContain("szkolenia.iskt.pl");
    // Karta ISK-375 nie jest publikacja — blokada indeksowania zostaje.
    expect(body).toContain("Disallow: /");
  });

  test("sitemap.xml i kanonik strony uzywaja tego samego adresu", async ({
    page,
    request,
  }) => {
    test.skip(
      !configured,
      "Brak NEXT_PUBLIC_SITE_URL w procesie testow — uruchom ./scripts/e2e-local.sh",
    );

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain(`<loc>${configured}/szkolenia</loc>`);
    expect(xml).not.toContain("szkolenia.iskt.pl");

    await page.goto("/szkolenia");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${configured}/szkolenia`,
    );
  });
});

test("nieistniejace szkolenie zwraca 404", async ({ page }) => {
  const response = await page.goto("/szkolenia/nie-ma-takiego-szkolenia");
  expect(response?.status()).toBe(404);
});

test("filtr i wyszukiwanie są zapisane w URL", async ({ page }) => {
  await page.goto("/szkolenia");

  // Ta bramka zamrazala kontrolke, nie kontrakt: `getByLabel("Obszar")
  // .selectOption("ai")` wymagalo `<select name="category">`, ktorego juz nie
  // ma. Filtr obszaru jest teraz rzedem linkow (`FilterPillLink`), a adres
  // (`?category=`, `?q=`) pozostal bez zmian — mierzymy wiec to samo, tylko
  // przez kontrolke, ktora w produkcie istnieje. Celujemy w `href`, a nie
  // w nazwe kategorii z zasiewu: nazwa jest dana, adres jest kontraktem.
  const filtry = page.getByRole("navigation", { name: "Filtr obszarów" });
  await filtry.locator('a[href*="category=ai"]').click();
  await expect(page).toHaveURL(/category=ai/);
  // Wybrany obszar niesie `aria-current="page"`, a nie samo tlo (WCAG 1.4.1):
  // `<select>` oglaszal stan sam z siebie, pigulka-link bez tego nie oglasza go
  await expect(filtry.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    /category=ai/,
  );

  await expect(
    page.getByRole("heading", { name: "[DEMO] Wprowadzenie do AI" }),
  ).toBeVisible();
  // NEGATYW, ktorego ta bramka nigdy nie miala. Dotad dowodzila wylacznie, ze
  // pozycja z wybranego obszaru JEST na liscie — filtr, ktory nie filtruje
  // (nieskuteczne `eq` na osadzonej tabeli, pominiete `!inner`), przechodzil
  // przez nia bez sladu. Szkolenie z innego obszaru musi zniknac.
  await expect(
    page.getByRole("link", { name: /Zrównoważony rozwój i ESG/ }),
  ).toHaveCount(0);

  // Fraza dochodzi do adresu RAZEM z obszarem. Pole `category` jest ukryte
  // i stoi POZA `.catalog-form`, powiazane z nim atrybutem `form` — gdyby to
  // powiazanie zniklo, wpisanie frazy kasowaloby filtr (tak robi wzorzec).
  await page.getByLabel("Wyszukaj").fill("AI");
  await page.getByRole("button", { name: "Pokaż wyniki" }).click();
  await expect(page).toHaveURL(/category=ai/);
  await expect(page).toHaveURL(/q=AI/);
  await expect(
    page.getByRole("heading", { name: "[DEMO] Wprowadzenie do AI" }),
  ).toBeVisible();
});

test("wyszukiwanie znajduje tresc gdy fraza ma polskie znaki", async ({
  page,
}) => {
  // `search_tsv` jest zbudowane na tekscie po `unaccent`, wiec fraza wpisana
  // z polskimi znakami musi trafic w ten sam zapis.
  await page.goto(`/szkolenia?q=${encodeURIComponent("zrównoważony")}`);
  await expect(
    page.getByRole("link", { name: /Zrównoważony rozwój i ESG/ }),
  ).toBeVisible();
});

/**
 * KIERUNEK ODWROTNY — DO ISK-412 NIEMOZLIWY DO ZMIERZENIA PRZEZ UI.
 * Zasiew trzymal wczesniej tytuly BEZ diakrytykow, wiec zapytanie ASCII
 * trafialo w tekst ASCII i nie dowodzilo niczego o `unaccent` — wlasciwosc
 * byla sprawdzana wylacznie w tescie integracyjnym (P6a) na wlasnej pozycji.
 * Odkad tresc zasiewu ma polskie znaki (ISK-412), ten przeplyw da sie dowiesc
 * na prawdziwym widoku: fraza bez ogonkow musi znalezc tekst z ogonkami.
 */
test("wyszukiwanie bez polskich znakow znajduje tresc z diakrytykami", async ({
  page,
}) => {
  await page.goto("/szkolenia?q=zrownowazony");
  await expect(
    page.getByRole("link", { name: /Zrównoważony rozwój i ESG/ }),
  ).toBeVisible();
});

for (const width of [360, 768, 1280]) {
  test(`strona główna nie przewija się poziomo przy ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  // Regresja klasy ISK-355: nazwa wlasnej klasy kolidujaca z utility Tailwinda
  // (warstwa `utilities` wygrywa z `components`) kasuje marginesy i wysrodkowanie,
  // a sama strona dalej renderuje sie "poprawnie". Mierzymy wiec realny uklad.
  //
  // Kontener strony glownej to `.ui-container`, a nie `.page-shell` — stara
  // asercja celowala w klase, ktorej na `/` nie ma, czyli `layout === null`
  // i blad "oczekuje niepustego". Zmiana nie jest wymiana selektora jeden za
  // jeden: `.page-shell` zwezal sam element (`width: min(...)`), wiec margines
  // bylo widac na pudelku, a `.ui-container` robi luz `padding-inline`, wiec
  // pudelko DOTYKA krawedzi kadru z zalozenia i `box.left` bywa rowne 0.
  // Mierzymy wiec pudelko TRESCI (`box + padding`): to ta sama wlasnosc widziana
  // przez czlowieka (tekst nie przykleja sie do krawedzi) i dodatkowo dowod, ze
  // token `--container-pad` naprawde sie zastosowal, a nie zostal przeslonięty.
  test(`tresc ma marginesy boczne i jest wysrodkowana przy ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const layout = await page.evaluate(() => {
      const shell = document.querySelector("main .ui-container");
      if (!shell) return null;
      const box = shell.getBoundingClientRect();
      const style = getComputedStyle(shell);
      // `clientWidth`, nie `innerWidth`: gdyby pasek przewijania zajmowal
      // miejsce w ukladzie, `innerWidth` byloby o jego szerokosc wieksze niz
      // kadr, w ktorym policzono `box.right` — i symetryczny uklad wygladalby
      // na przesuniety o ~15 px.
      const kadr = document.documentElement.clientWidth;
      return {
        left: box.left + Number.parseFloat(style.paddingLeft),
        right: kadr - (box.right - Number.parseFloat(style.paddingRight)),
      };
    });
    expect(layout).not.toBeNull();
    expect(layout!.left).toBeGreaterThan(0);
    expect(Math.abs(layout!.left - layout!.right)).toBeLessThanOrEqual(1);
  });
}
