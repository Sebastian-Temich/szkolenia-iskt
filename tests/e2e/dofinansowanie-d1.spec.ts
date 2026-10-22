/**
 * ISK-413 / CR-I4 — `trainings.funding_available` i `funding_note`:
 * jedyny mechanizm decyzji D1, do tej pory z ZEROWYM pokryciem.
 *
 * CO DOKLADNIE BYLO NIEZMIERZONE
 * Wzorzec renderuje karte dofinansowania BEZWARUNKOWO i wpisuje w nia na sztywno
 * zdanie o KFS i BUR oraz prog „do 80%". ISK-399 / D1 tego zabrania: badge i karta
 * sa warunkowane kolumna `funding_available`, a tresc bierze sie z `funding_note`.
 * Produkt robi to poprawnie — ale do tej pory ani jeden test o to nie pytal:
 * `grep -F "detail-funding" tests/` nie dawal zadnego trafienia, a zasiany
 * przypadek negatywny (`funding_available = false`) nie byl odwiedzany przez
 * zaden spec. Powrot do bezwarunkowego zdania o KFS/BUR przeszedlby przez cale
 * CI na zielono.
 *
 * To ta sama klasa defektu „zielona bramka, martwa kolumna", przeciw ktorej
 * napisano `katalog-dane.spec.ts` dla `price_net_pln`, `categories.icon`
 * i `training_trainers.sort_order` — z pominieciem wlasnie kolumny z D1.
 *
 * DLACZEGO DANE SA TWORZONE, A NIE DOPISANE DO ZASIEWU
 * Arm pozytywny musi dowiesc, ze na ekranie stoi tresc Z KOLUMNY, a nie tekst
 * zapasowy z komponentu. Zasiew jest wspolna wlasnoscia kilku kart i zmienia sie
 * pod testem: w chwili pisania tej karty `funding_note` byla NULL we wszystkich
 * trzech szkoleniach [DEMO] (czyli „tresc z kolumny" i „zapas" byly
 * nierozroznialne), a karta F1 (ISK-409) dopisala noty i przestawila
 * `zrownowazony-rozwoj-esg` na `funding_available = true`. Dlatego trzy ramiona
 * zakladaja WLASNE szkolenia kluczem service_role i sprzataja po sobie — sa
 * hermetyczne i nie konkuruja o `supabase/seed.sql`.
 *
 * Arm zasiewu jest DODATKOWY, bo nieodwiedzanie zasianego przypadku negatywnego
 * bylo czescia zarzutu — i WYSZUKUJE ten przypadek w bazie, zamiast wpisywac
 * slug na sztywno. Wpisany slug raz juz sie zestarzal (patrz komentarz w tescie).
 */
import { expect, test, type Page } from "@playwright/test";

import { createTraining, deleteTraining, sfx } from "./helpers/data";
import { serviceClient } from "./helpers/stack";

/**
 * Tekst zapasowy z `app/(public)/szkolenia/[slug]/page.tsx`. Arm pozytywny musi
 * pokazac tresc z kolumny ZAMIAST niego — inaczej „czytamy `funding_note`"
 * jest nieodroznialne od „renderujemy staly tekst pod warunkiem na flage".
 */
const ZAPAS = "To szkolenie może kwalifikować się do dofinansowania";

/**
 * Widoczna tresc `main`, a nie calego `body`.
 *
 * Zakres jest celowy: asercje o NIEOBECNOSCI musza patrzec na tresc widoku,
 * nie na stale elementy ukladu. Strona glowna ma sekcje `#dofinansowania`
 * z naglowkiem „Dofinansowania", wiec gdyby ktos dopisal ja do nawigacji
 * w naglowku, asercja `not.toMatch(/dofinansowan/i)` zrobila by sie czerwona
 * na POPRAWNYM kodzie — i czytaloby sie to jak wyciek kolumny D1.
 */
async function trescStrony(page: Page): Promise<string> {
  const tresc = await page.evaluate(
    () => document.querySelector("main")?.innerText ?? null,
  );
  // Brak `main` to defekt sam w sobie (jeden landmark na trase), a nie powod,
  // zeby cicho zmierzyc cos innego.
  expect(tresc, "widok nie ma elementu `main`").not.toBeNull();
  return tresc as string;
}

/**
 * Trzy znaki rozpoznawcze mechanizmu D1 na stronie szczegolu. Osobna funkcja,
 * bo oba ramiona musza patrzec na DOKLADNIE ten sam zestaw miejsc — inaczej
 * „nic sie nie renderuje" znaczyloby co innego w kazdym tescie.
 */
async function sladyDofinansowania(page: Page) {
  return {
    /** Karta w kolumnie bocznej (`.detail-funding`). */
    karta: await page.locator(".detail-funding").count(),
    /** Badge „Dofinansowanie" w rzedzie etykiet nad `h1`. */
    badge: await page
      .locator(".detail-badges .ui-badge")
      .filter({ hasText: /dofinansowanie/i })
      .count(),
    /** Przycisk CTA z karty dofinansowania. */
    cta: await page
      .locator(".detail-funding a")
      .filter({ hasText: /dofinansowanie/i })
      .count(),
  };
}

test.describe("D1: karta i badge dofinansowania sa warunkowane kolumna", () => {
  let zDofinansowaniem: Awaited<ReturnType<typeof createTraining>>;
  let bezDofinansowania: Awaited<ReturnType<typeof createTraining>>;
  let bezNotatki: Awaited<ReturnType<typeof createTraining>>;

  /**
   * Notatka jest unikalna na przebieg. Staly napis moglby trafic na stronie
   * przypadkiem (np. z innego szkolenia zasiewu) i asercja o nieobecnosci
   * w armie negatywnym bylaby wtedy falszywie czerwona albo falszywie zielona.
   */
  const notatka = `[TEST] Nota dofinansowania ${sfx()} — tresc wprost z kolumny funding_note.`;

  /*
   * TYTULY NIE MOGA ZAWIERAC SLOWA „dofinansowanie".
   * Tytul szkolenia renderuje sie w `h1`, czyli wpada w `main`, a arm negatywny
   * asertuje `not.toMatch(/dofinansowan/i)` na calym `main`. Pierwsza wersja
   * nazywala te szkolenia „[TEST] Dofinansowanie wylaczone" i test padal na
   * SWOICH WLASNYCH danych, nie na defekcie produktu (zmierzone w CI,
   * przebieg 39860729647). Nazwy mowia teraz o fladze, nie o dofinansowaniu.
   */

  test.beforeAll(async () => {
    zDofinansowaniem = await createTraining({
      published: true,
      titlePrefix: "[TEST] Flaga wlaczona",
      fundingAvailable: true,
      fundingNote: notatka,
    });
    // ARM NEGATYWNY. `funding_note` jest tu USTAWIONA, mimo ze flaga jest
    // falszywa — i to jest sedno: gdyby widok czytal samą notatke (albo
    // renderowal karte bezwarunkowo), ten przypadek by ja pokazal. Szkolenie
    // z NULL-em w notatce nie odroznilby tych dwoch bledow.
    bezDofinansowania = await createTraining({
      published: true,
      titlePrefix: "[TEST] Flaga wylaczona",
      fundingAvailable: false,
      fundingNote: `${notatka} (ten wariant NIE MA prawa jej pokazac)`,
    });
    // Flaga wlaczona, notatka NULL — jedyny przypadek, w ktorym tekst zapasowy
    // jest dozwolony. Bez niego nie dowiedzionoby, ze zapas w ogole dziala,
    // i „nie pokazuj zapasu" dalo by sie spelnic usuwajac go z komponentu.
    bezNotatki = await createTraining({
      published: true,
      titlePrefix: "[TEST] Flaga wlaczona bez noty",
      fundingAvailable: true,
      fundingNote: null,
    });
  });

  test.afterAll(async () => {
    for (const szkolenie of [zDofinansowaniem, bezDofinansowania, bezNotatki]) {
      if (szkolenie?.id) await deleteTraining(szkolenie.id);
    }
  });

  test("ARM POZYTYWNY: przy `funding_available` prawdziwym widok pokazuje tresc z `funding_note`", async ({
    page,
  }) => {
    // Kontrola zalozenia: baza naprawde trzyma te wartosci. Bez tego blad
    // nizej czytalby sie jak defekt widoku, a bylby defektem fabryki danych.
    const { data, error } = await serviceClient()
      .from("trainings")
      .select("funding_available,funding_note")
      .eq("slug", zDofinansowaniem.slug)
      .single();
    if (error) throw error;
    expect(data.funding_available).toBe(true);
    expect(data.funding_note).toBe(notatka);

    await page.goto(`/szkolenia/${zDofinansowaniem.slug}`);

    const slady = await sladyDofinansowania(page);
    expect(slady.karta, "brak karty `.detail-funding`").toBe(1);
    expect(slady.badge, "brak badge „Dofinansowanie”").toBe(1);
    expect(slady.cta, "brak CTA w karcie dofinansowania").toBe(1);

    // SEDNO ARMU: na ekranie stoi napis Z BAZY, znak w znak.
    expect(
      (await page.locator(".detail-funding-text").innerText()).trim(),
    ).toBe(notatka);

    // ...i NIE stoi tekst zapasowy. Gdyby widok ignorowal kolumne i zawsze
    // rysowal staly napis, poprzednia asercja byla by czerwona, a ta zlapie
    // wariant, w ktorym pokazuje OBA.
    expect(
      await trescStrony(page),
      "zapas obok tresci z kolumny",
    ).not.toContain(ZAPAS);
  });

  test("ARM NEGATYWNY: przy `funding_available` falszywym nie ma ANI badge, ANI karty, ANI zdania", async ({
    page,
  }) => {
    const { data, error } = await serviceClient()
      .from("trainings")
      .select("funding_available,funding_note")
      .eq("slug", bezDofinansowania.slug)
      .single();
    if (error) throw error;
    expect(data.funding_available).toBe(false);
    // Notatka ISTNIEJE w bazie — pomiar nizej jest o flagę, nie o pusta kolumne.
    expect(data.funding_note).toBeTruthy();

    await page.goto(`/szkolenia/${bezDofinansowania.slug}`);
    // Strona musi byc naprawde wyrenderowana, zanim orzekniemy o nieobecnosci —
    // asercja „czegos nie ma" na niezaladowanym widoku jest zawsze zielona.
    await expect(page.locator("h1.detail-title")).toBeVisible();

    const slady = await sladyDofinansowania(page);
    expect(slady.karta, "karta dofinansowania przy wylaczonej fladze").toBe(0);
    expect(slady.badge, "badge dofinansowania przy wylaczonej fladze").toBe(0);
    expect(slady.cta, "CTA dofinansowania przy wylaczonej fladze").toBe(0);

    const tresc = await trescStrony(page);
    expect(
      tresc,
      "tresc `funding_note` wyciekla przy wylaczonej fladze",
    ).not.toContain(notatka);
    expect(tresc, "tekst zapasowy przy wylaczonej fladze").not.toContain(ZAPAS);
    // Zdanie wzorca, ktorego D1 zabrania bezwarunkowo. Sprawdzane po slowach
    // kluczowych, a nie po calym napisie, zeby przeformulowanie go nie ukrylo.
    expect(tresc, "nazwa programu KFS przy wylaczonej fladze").not.toMatch(
      /\bKFS\b/,
    );
    expect(tresc, "nazwa programu BUR przy wylaczonej fladze").not.toMatch(
      /\bBUR\b/,
    );
    expect(tresc, "slowo „dofinansowanie” przy wylaczonej fladze").not.toMatch(
      /dofinansowan/i,
    );
  });

  test("ARM ZASIEWU: nieodwiedzane dotad szkolenie z zasiewu tez nie pokazuje dofinansowania", async ({
    page,
  }) => {
    // Zarzut CR-I4 brzmial wprost: zasiany przypadek negatywny istnieje,
    // ale nie wchodzi na niego zaden test. Wchodzi.
    //
    // Slug jest WYSZUKIWANY, a nie wpisany na sztywno. Pierwsza wersja celowala
    // w `zrownowazony-rozwoj-esg` i zrobila sie czerwona, gdy karta F1
    // (ISK-409) przestawila to szkolenie na `funding_available = true`
    // i dopisala mu nota (zmierzone w CI, przebieg 39865183332 — kontrola
    // zalozenia zadzialala dokladnie tak, jak miala). Zasiew jest wspolna
    // wlasnoscia kilku kart, wiec test pyta BAZE, ktore szkolenie jest dzisiaj
    // przypadkiem negatywnym, zamiast zakladac, ze to wciaz to samo.
    const { data, error } = await serviceClient()
      .from("trainings")
      .select("slug,funding_available")
      .eq("is_published", true)
      .eq("funding_available", false)
      // Bez tego filtra zapytanie moglo by trafic we WLASNE szkolenie tego
      // specu (arm negatywny tez ma flage falszywa) i „arm zasiewu" mierzylby
      // dane, ktore sam zalozyl. Prefiks pochodzi z `createTraining()`.
      .not("slug", "like", "test-szkolenie-%")
      .order("sort_order")
      .limit(1);
    if (error) throw error;
    const zasiane = data as Array<{ slug: string; funding_available: boolean }>;
    // Brak JAKIEGOKOLWIEK zasianego przypadku negatywnego to defekt zasiewu,
    // nie powod do cichego przejscia: negatywna sciezka D1 zostalaby wtedy bez
    // pokrycia na danych demonstracyjnych, czyli dokladnie w stanie, przeciw
    // ktoremu ta karta powstala.
    expect(
      zasiane.length,
      "zasiew nie ma ANI JEDNEGO opublikowanego szkolenia z `funding_available = false` — " +
        "negatywna sciezka D1 nie ma pokrycia na danych [DEMO]",
    ).toBe(1);
    const slug = zasiane[0]!.slug;

    await page.goto(`/szkolenia/${slug}`);
    await expect(page.locator("h1.detail-title")).toBeVisible();

    const slady = await sladyDofinansowania(page);
    expect(slady.karta).toBe(0);
    expect(slady.badge).toBe(0);
    expect(slady.cta).toBe(0);
    expect(await trescStrony(page)).not.toMatch(/dofinansowan/i);
  });

  test("przy `funding_note` NULL karta pokazuje tekst zapasowy — i nadal bez KFS/BUR", async ({
    page,
  }) => {
    await page.goto(`/szkolenia/${bezNotatki.slug}`);

    const slady = await sladyDofinansowania(page);
    expect(slady.karta, "karta zniknela przy NULL-u w notatce").toBe(1);
    expect(slady.badge).toBe(1);

    expect(await page.locator(".detail-funding-text").innerText()).toContain(
      ZAPAS,
    );
    // Zapas jest dozwolony WYLACZNIE dlatego, ze nie obiecuje konkretnego
    // programu ani progu. Gdyby ktos dopisal do niego KFS/BUR albo procent,
    // D1 zostalaby zlamana wlasnie tym tekstem.
    const tresc = await trescStrony(page);
    expect(tresc, "KFS w tekscie zapasowym").not.toMatch(/\bKFS\b/);
    expect(tresc, "BUR w tekscie zapasowym").not.toMatch(/\bBUR\b/);
    expect(tresc, "prog procentowy w tekscie zapasowym").not.toMatch(/\d+\s*%/);
  });
});
