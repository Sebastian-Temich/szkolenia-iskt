/**
 * ISK-409 — D1 w tresci strony glownej: zakazane twierdzenia i miejsce,
 * w ktorym stoi znacznik `[DEMO]`.
 *
 * DLACZEGO TO WYMAGA WLASNEJ BRAMKI
 * Naruszenia D1 zamkniete w tej karcie byly niewidoczne dla kazdej istniejacej
 * bramki, bo zaden z nich nie jest bledem technicznym: strona sie renderowala,
 * axe milczal, kontrast sie zgadzal, konspekt byl poprawny. Defekt byl
 * wylacznie TRESCIOWY:
 *   - `<h2>` brzmial "Najczęściej wybierane", czyli podawal reczna flage
 *     `is_featured` jako statystyke zachowania uzytkownikow (CR-I1);
 *   - punkt w hero obiecywal "Online i stacjonarnie", choc model danych NIE MA
 *     kolumny formatu dostawy (CR-I2);
 *   - `[DEMO]` bylo wszyte w nazwy wlasne z zasiewu, dajac 29 widocznych
 *     wystapien na `/` (UX-B3).
 * Takie rzeczy wracaja przy pierwszej zmianie copy, jesli nic ich nie mierzy.
 *
 * KONSTRUKCJA W DUCHU `katalog-dane.spec.ts`
 * Tamta bramka liczy ZAKAZANA cene z zywych wierszy (`price_net_pln * 0.2`),
 * zamiast wpisywac napis do testu. Tutaj ta sama zasada: zakazane napisy
 * powstaja z nazw wlasnych POBRANYCH Z BAZY (`[DEMO] ` + nazwa), wiec bramka
 * nadal mierzy cokolwiek po kazdej zmianie zasiewu — i nie da sie jej
 * uciszyc, przepisujac tresc w jednym miejscu.
 */
import { expect, test, type Page } from "@playwright/test";

import { serviceClient } from "./helpers/stack";

/** Cala widoczna tresc strony — do asercji negatywnych. */
async function trescStrony(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

type NazwaWlasna = { zrodlo: string; nazwa: string };

/**
 * Nazwy wlasne, ktore strona glowna renderuje z bazy: obszary (sekcja
 * "#obszary" i kolumna stopki) oraz tytuly wyroznionych szkolen.
 */
async function nazwyWlasneNaStronieGlownej(): Promise<NazwaWlasna[]> {
  const svc = serviceClient();

  const kategorie = await svc
    .from("categories")
    .select("name")
    .eq("is_published", true);
  if (kategorie.error) throw kategorie.error;

  const wyroznione = await svc
    .from("trainings")
    .select("title")
    .eq("is_published", true)
    .eq("is_featured", true);
  if (wyroznione.error) throw wyroznione.error;

  return [
    ...(kategorie.data as Array<{ name: string }>).map((row) => ({
      zrodlo: "categories.name",
      nazwa: row.name,
    })),
    ...(wyroznione.data as Array<{ title: string }>).map((row) => ({
      zrodlo: "trainings.title",
      nazwa: row.title,
    })),
  ];
}

test.describe("D1: strona glowna nie stwierdza rzeczy, ktorych nie ma w danych", () => {
  test("zadne twierdzenie o popularnosci ani o formacie zajec", async ({
    page,
  }) => {
    await page.goto("/");
    const tresc = await trescStrony(page);

    // CR-I1. "Najczęściej wybierane" bylo tytulem sekcji wyroznionych, a nie
    // ma w produkcie ANI JEDNEGO licznika wyswietlen, zgloszen czy sprzedazy —
    // zawartosc tej sekcji pochodzi w calosci z checkboxa w panelu. To byl
    // zakazany przez D1 badge "Popularne", tylko przeniesiony do `<h2>`.
    for (const fraza of [
      "Najczęściej wybierane",
      "Najczesciej wybierane",
      "Popularne",
      "Bestseller",
      "Najchętniej",
    ]) {
      expect(
        tresc,
        `/: twierdzenie o popularnosci „${fraza}” — produkt nie ma zadnego licznika, ktory by je potwierdzal (D1)`,
      ).not.toContain(fraza);
    }

    // Uczciwy tytul MUSI tam byc — bez tego asercje negatywne wyzej
    // przechodzilyby rowniez wtedy, gdyby cala sekcja zniknela.
    await expect(
      page.getByRole("heading", { name: "Szkolenia, które wyróżniamy" }),
    ).toBeVisible();
  });

  test("punkty w hero nie obiecuja formatu zajec ani nie oceniaja jakosci", async ({
    page,
  }) => {
    await page.goto("/");
    const punkty = page.locator(".home-hero-points");
    await expect(punkty).toBeVisible();
    const trescPunktow = await punkty.innerText();

    // CR-I2. Asercja jest ZAWEZONA do listy punktow hero, i to celowo:
    // karta sciezki "Dla firm i zespołów" nizej mowi o szkoleniach
    // "stacjonarnie lub online", ale nosi `[DEMO]`, czyli jest jawnie
    // oznaczona jako tresc zastepcza. Zakazane jest NIEOZNACZONE twierdzenie
    // podane jako fakt o ofercie — a dokladnie tym byly punkty hero.
    for (const fraza of [
      "Online i stacjonarnie",
      "stacjonarn",
      "online",
      "Praktyczne programy",
      "ekspert",
    ]) {
      expect(
        trescPunktow.toLowerCase(),
        `hero: punkt „${fraza}” nie ma oparcia w modelu danych (nie ma kolumny formatu dostawy, nie ma oceny jakosci) i nie jest oznaczony jako demo`,
      ).not.toContain(fraza.toLowerCase());
    }

    // Kontrola, ze lista nie jest pusta i ze mowi o rzeczach, ktore widok
    // szczegolu faktycznie pokazuje z kolumn bazy.
    for (const fraza of [
      "Program i efekty kształcenia",
      "Prowadzący",
      "Dofinansowanie",
    ]) {
      expect(trescPunktow, `hero: brak punktu „${fraza}”`).toContain(fraza);
    }
  });

  /**
   * ISK-426 / I-1 — TA SAMA ZASADA, ALE NA CALEJ STRONIE.
   *
   * Asercja wyzej jest zawezona do `.home-hero-points`, a skan
   * calostronicowy („zadne twierdzenie o popularnosci”) wylicza tylko frazy
   * o popularnosci. Przez te dwie dziury „Online i stacjonarnie” wrocilo na
   * `/` jako `<h3>` karty pasma `#zakres`, a „Ucz sie z ekspertem” nigdy
   * z niego nie znikneło (`lib/audience.ts`, `<h3 class="home-step-title">`)
   * — ZADNA bramka nie zaswiecila sie na jedno ani drugie.
   *
   * DLACZEGO WLASNIE NAGLOWKI, A NIE CALA TRESC
   * Doktryna pliku dopuszcza twierdzenie, ktore nosi `[DEMO]` (lead pasma
   * i akapity kart je nosza). Naglowek jest jednak jedynym miejscem, gdzie
   * oznaczyc go NIE DA SIE: test „[DEMO] nie stoi w zadnym naglowku” nizej
   * tego zabrania. Te dwie asercje razem daja regule nie do obejscia:
   * twierdzenie o formacie zajec albo o jakosci MUSI zjechac do oznaczonego
   * akapitu, bo w `h1/h2/h3` nie ma dla niego legalnej formy.
   *
   * NAZWY WLASNE Z BAZY SA WYLACZONE, I TO MIERZONE, NIE ZALOZONE
   * `h3` obszarow i wyroznionych szkolen to `categories.name`
   * i `trainings.title` — dane, nie copy. Kategoria nazwana w panelu
   * „Szkolenia online” nie jest twierdzeniem marketingowym (ta sama zasada,
   * co w UX-B3: znacznik idzie przy twierdzeniach, nie przy nazwach). Zbior
   * do wylaczenia pobieram z bazy tym samym helperem, co bramka UX-B3, wiec
   * nie da sie go po cichu rozszerzyc, wpisujac wyjatek do testu.
   */
  test("zaden naglowek na / nie obiecuje formatu zajec ani nie ocenia jakosci", async ({
    page,
  }) => {
    const nazwyZBazy = new Set(
      (await nazwyWlasneNaStronieGlownej()).map(({ nazwa }) => nazwa),
    );

    await page.goto("/");
    const wszystkieNaglowki = await page
      .locator("h1, h2, h3")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node.textContent ?? "").trim()),
      );
    const naglowkiCopy = wszystkieNaglowki.filter(
      (text) => text.length > 0 && !nazwyZBazy.has(text),
    );

    // KONTROLA WAKUACYJNOSCI 1: strona, ktora nie wyrenderowala sie wcale,
    // dalaby pusta liste i zielona petle nizej.
    expect(
      naglowkiCopy.length,
      "brak naglowkow redakcyjnych na / — bramka nie mialaby czego mierzyc",
    ).toBeGreaterThan(5);

    // KONTROLA WAKUACYJNOSCI 2: naglowki, ktore niosly naruszenie, musza na
    // stronie BYC. Bez tego usuniecie calego pasma `#zakres` albo kroku
    // procesu przeszloby jako „naprawa”.
    for (const naglowek of ["Forma prowadzenia", "Ucz się z prowadzącym"]) {
      expect(
        naglowkiCopy,
        `/: brak naglowka „${naglowek}” — asercje negatywne nizej byly by prawdziwe takze dla strony bez tej sekcji`,
      ).toContain(naglowek);
    }

    for (const fraza of [
      "Online i stacjonarnie",
      "stacjonarn",
      "online",
      "zdalnie",
      "hybrydow",
      "Praktyczne programy",
      "ekspert",
    ]) {
      const trafienia = naglowkiCopy.filter((text) =>
        text.toLowerCase().includes(fraza.toLowerCase()),
      );
      expect(
        trafienia,
        `/: naglowek z fraza „${fraza}” — model danych nie ma kolumny formatu dostawy ani oceny jakosci, a naglowka NIE WOLNO oznaczyc [DEMO]; twierdzenie nalezy przeniesc do oznaczonego akapitu`,
      ).toEqual([]);
    }
  });

  /**
   * ISK-426 / I-1, strona pozytywna: twierdzenie o formie zajec zostalo
   * PRZENIESIONE do oznaczonego akapitu, a nie skasowane. Bez tej asercji
   * bramka wyzej nagradzalaby ciche usuniecie informacji.
   */
  test("forma zajec jest nadal podana, ale w akapicie oznaczonym [DEMO]", async ({
    page,
  }) => {
    await page.goto("/");

    const akapity = await page
      .locator("#zakres .home-scope-text")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node.textContent ?? "").trim()),
      );
    const oFormie = akapity.filter((text) => /online|stacjonarn/i.test(text));

    expect(
      oFormie.length,
      "#zakres: zaden akapit nie mowi o formie zajec — informacja zniknela, zamiast zjechac z naglowka do oznaczonej tresci",
    ).toBe(1);
    expect(
      oFormie[0],
      "#zakres: akapit o formie zajec bez znacznika [DEMO] — nieoznaczone twierdzenie o kolumnie, ktorej nie ma",
    ).toContain("[DEMO]");
  });

  test("prog procentowy dofinansowania nie wrocil", async ({ page }) => {
    await page.goto("/");
    const tresc = await trescStrony(page);
    // Pokrywa sie celowo z `katalog-dane.spec.ts`: tamten test mierzy cene po
    // mnozniku, ten — samo obietnice progu, bo wraca ona najchetniej razem
    // ze zmiana copy sekcji "#dofinansowania".
    expect(tresc, "/: prog procentowy dofinansowania").not.toMatch(/\d+\s*%/);
    expect(tresc, "/: obietnica „do 80”").not.toMatch(/do\s+80\b/i);
  });
});

test.describe("UX-B3: [DEMO] oznacza twierdzenia, nie nazwy wlasne", () => {
  test("zadna nazwa wlasna z bazy nie jest renderowana z prefiksem [DEMO]", async ({
    page,
  }) => {
    const nazwy = await nazwyWlasneNaStronieGlownej();
    // Kontrola zalozenia: pusty zasiew dalby pusta petle i zielony test,
    // ktory nie mierzy niczego.
    expect(
      nazwy.length,
      "brak opublikowanych kategorii i wyroznionych szkolen — bramka nie mialaby czego mierzyc",
    ).toBeGreaterThan(0);

    await page.goto("/");
    const tresc = await trescStrony(page);

    for (const { zrodlo, nazwa } of nazwy) {
      // POZYTYW: nazwa z bazy faktycznie dochodzi do widoku. Bez tego
      // negatyw nizej byl by prawdziwy takze dla strony, ktora nie
      // renderuje nazw w ogole.
      expect(tresc, `/: brak nazwy „${nazwa}” (${zrodlo}) w widoku`).toContain(
        nazwa,
      );
      // NEGATYW: ta sama nazwa nie moze byc poprzedzona znacznikiem.
      expect(
        tresc,
        `/: „[DEMO] ${nazwa}” — znacznik wszyty w nazwe wlasna (${zrodlo}); sygnal o danych przykladowych nalezy podac raz, w pasku nad naglowkiem`,
      ).not.toContain(`[DEMO] ${nazwa}`);
    }
  });

  test("[DEMO] nie stoi w zadnym naglowku ani w nazwie dostepnej odnosnika", async ({
    page,
  }) => {
    await page.goto("/");

    // Strukturalne sformulowanie zasady "znacznik przy twierdzeniach, nie
    // w nazwach": naglowki i etykiety odnosnikow to nazwy wlasne i nawigacja,
    // a nie twierdzenia o faktach. Ta asercja jest odporna na zmiany copy —
    // nie wylicza ani jednej frazy.
    const naglowki = await page
      .locator("h1, h2, h3")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node.textContent ?? "").trim())
          .filter((text) => text.includes("[DEMO]")),
      );
    expect(
      naglowki,
      "naglowek z [DEMO] — znacznik ma oznaczac twierdzenia w tresci, nie nazwy wlasne",
    ).toEqual([]);

    const odnosniki = await page.locator("a").evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const el = node as HTMLAnchorElement;
          return (el.getAttribute("aria-label") ?? el.innerText ?? "").trim();
        })
        .filter((text) => text.includes("[DEMO]")),
    );
    expect(
      odnosniki,
      "odnosnik z [DEMO] w nazwie dostepnej — czytnik ekranu czyta znacznik jako czesc celu nawigacji",
    ).toEqual([]);
  });

  test("sygnal o srodowisku demonstracyjnym jest podany RAZ i jest widoczny", async ({
    page,
  }) => {
    await page.goto("/");

    const pasek = page.locator(".demo-banner");
    await expect(pasek).toHaveCount(1);
    await expect(pasek).toBeVisible();
    await expect(pasek).toContainText("Środowisko demonstracyjne");
    // Pasek musi nazwac to, co jest fikcyjne — inaczej po zdjeciu `[DEMO]`
    // z nazw wlasnych odwiedzajacy nie dowie sie, ze trenerzy sa wymysleni.
    await expect(pasek).toContainText("trenerzy");

    // Pasek stoi NAD przyklejonym naglowkiem i jest widoczny bez przewijania.
    const paskiBox = await pasek.boundingBox();
    const naglowekBox = await page.locator(".site-header").boundingBox();
    expect(paskiBox, "pasek demo nie ma pudelka").not.toBeNull();
    expect(naglowekBox, "naglowek nie ma pudelka").not.toBeNull();
    expect(
      paskiBox!.y,
      "pasek demo musi stac nad naglowkiem — inaczej przykleja sie razem z nim i zabiera ekran na telefonie",
    ).toBeLessThan(naglowekBox!.y);

    // Zdanie objasniajace znacznik zostaje w stopce (wymog ISK-409): `[DEMO]`
    // nadal stoi przy twierdzeniach w tresci i musi byc wyjasnione.
    await expect(page.locator(".footer-bar")).toContainText(
      "Wszystkie treści oznaczone [DEMO] są fikcyjne.",
    );
  });

  test("rok w stopce jest liczony, a nie wpisany na sztywno", async ({
    page,
  }) => {
    await page.goto("/");
    // `const year = 2026` renderowalo "© 2026 ISKT" i stawalo sie falszywe
    // 2027-01-01 bez zadnego sygnalu. Rok biezacy liczymy w tescie tak samo
    // jak w kodzie, zeby bramka nie wymagala corocznej edycji.
    const rok = String(new Date().getFullYear());
    await expect(page.locator(".footer-bar")).toContainText(`© ${rok} ISKT`);
  });
});

test("CR-I4: dofinansowanie w szczegole pochodzi z kolumny, a nie z zapasu w kodzie", async ({
  page,
}) => {
  // `funding_note` byla pominieta na liscie kolumn w zasiewie, wiec kazde
  // dofinansowane szkolenie pokazywalo ten sam, nieoznaczony napis zapasowy
  // z `app/(public)/szkolenia/[slug]/page.tsx`. Dwa wiersze z ROZNA trescia
  // sa jedynym sposobem odroznienia "czytamy kolumne" od "trafilismy w zapas".
  const { data, error } = await serviceClient()
    .from("trainings")
    .select("slug,funding_note")
    .eq("is_published", true)
    .eq("funding_available", true);
  if (error) throw error;
  const wiersze = data as Array<{ slug: string; funding_note: string | null }>;

  expect(
    wiersze.length,
    "zasiew nie ma dofinansowanych szkolen — bramka nie mialaby czego mierzyc",
  ).toBeGreaterThanOrEqual(2);
  for (const row of wiersze) {
    expect(
      row.funding_note,
      `${row.slug}: funding_note jest NULL, wiec widok wypisze zapas z kodu (CR-I4)`,
    ).not.toBeNull();
  }
  // SEDNO: tresci musza sie ROZNIC. Identyczne wartosci przechodzilyby test
  // nawet wtedy, gdyby widok dalej renderowal jeden napis wpisany w kodzie.
  expect(
    new Set(wiersze.map((row) => row.funding_note)).size,
    "wszystkie funding_note sa identyczne — nie da sie odroznic kolumny od zapasu",
  ).toBeGreaterThan(1);

  for (const row of wiersze) {
    await page.goto(`/szkolenia/${row.slug}`);
    await expect(page.locator(".detail-funding-text")).toHaveText(
      row.funding_note!,
    );
  }
});
