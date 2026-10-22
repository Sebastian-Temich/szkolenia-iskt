/**
 * ISK-401 / M2 — przepelnienie poziome mierzone na DZIECIACH, nie na korzeniu.
 *
 * DLACZEGO TEN PLIK ISTNIEJE, CHOC BRAMKA PRZEWIJANIA JUZ BYLA
 * Wszystkie dotychczasowe bramki przewijania w tym repozytorium (ISK-364 / P10
 * w `ux-blockers.spec.ts`, trzy testy w `public-pages.spec.ts`) sprawdzaja
 * `document.documentElement.scrollWidth <= window.innerWidth`. Ten pomiar jest
 * NIEFALSYFIKOWALNY w momencie, w ktorym korzen dokumentu dostaje
 * `overflow-x: hidden`: przegladarka przestaje wtedy raportowac przepelnienie
 * na korzeniu, element dalej wychodzi poza kadr, a bramka jest zielona. To nie
 * jest teoretyczne — zmierzony fakt w tym projekcie (ISK-399, lista pulapek
 * weryfikacyjnych): ukrycie przewijania na korzeniu zamaskowalo element szerszy
 * od kadru i gates przeszly.
 *
 * Dlatego tutaj chodzimy po KAZDYM elemencie dokumentu i pytamy o jego wlasna
 * geometrie. Element, ktory wystaje poza kadr, jest defektem nawet wtedy, gdy
 * korzen go przycina: tresc jest wtedy nieosiagalna, a nie "schowana".
 *
 * Sam detektor i jego zasada wylaczen stoja w `helpers/przepelnienie.ts` —
 * razem z uzasadnieniem, dlaczego wyjatek na przyciecie przez przodka jest
 * zawezony do ORNAMENTOW (ISK-413 / CR-I3). Drugie ramie tej bramki
 * (`describe` na koncu pliku) wstrzykuje element za szeroki w kazde poddrzewo
 * przycinane przez przodka i wymaga, zeby detektor go zglosil.
 */
import { expect, test } from "@playwright/test";

import {
  oznaczKonteneryObcinajace,
  usunWstrzyknieta,
  wstrzyknijZaSzeroki,
  zmierzPrzepelnienie,
} from "./helpers/przepelnienie";

/** Wszystkie trasy publiczne — razem z dwiema, ktorych M2 nie przebudowal. */
const WIDOKI = [
  "/",
  "/szkolenia",
  "/szkolenia/wprowadzenie-do-ai",
  "/trenerzy",
  "/kontakt",
  "/polityka-prywatnosci",
] as const;

/** 360 px to najwezszy ekran z zakresu zlecenia, 1440 — pelny desktop wzorca. */
const SZEROKOSCI = [360, 768, 1440] as const;

/**
 * Minimalna szerokosc toru siatki przy 360 px.
 *
 * Wzorzec trzyma siatke wyroznionych szkolen na `repeat(4, 1fr)` bez ani jednej
 * reguly `@media`, wiec przy 360 px tor schodzi do ~62 px — karta zostaje
 * narysowana, tekst w niej lamie sie po jednym slowie i nie da sie jej
 * przeczytac. Zaden pomiar przepelnienia tego nie widzi, bo siatka MIESCI sie
 * w kadrze. 120 px to prog, ponizej ktorego kolumna przestaje byc kolumna.
 */
const MIN_TOR_PX = 120;

for (const path of WIDOKI) {
  for (const width of SZEROKOSCI) {
    test(`${path} @ ${width}px: zaden element nie wychodzi poza kadr`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(path);
      // Pomiar na stronie bledu nie dowodzilby niczego o ukladzie.
      expect(response?.status()).toBe(200);

      const metryki = await zmierzPrzepelnienie(page);
      expect(
        metryki.winowajcy,
        `${path} @ ${width}px: elementy poza kadrem (${metryki.winowajcy.length}):\n${metryki.winowajcy.join(
          "\n",
        )}`,
      ).toEqual([]);

      // Asercja DODATKOWA, nie glowna. Zostaje, bo tani pomiar na korzeniu
      // lapie przypadek, w ktorym przepelnienie wnosi sam `body` (wtedy petla
      // wyzej nie ma na co wskazac). Sama by nie wystarczyla: `overflow-x`
      // inny niz `visible` na korzeniu zeruje ja na stale, a element dalej
      // wystaje — i to wlasnie przepuscily poprzednie bramki.
      expect(
        metryki.scrollWidth,
        `${path} @ ${width}px: scrollWidth ${metryki.scrollWidth} > kadr ${metryki.kadr}`,
      ).toBeLessThanOrEqual(metryki.kadr + 1);
    });
  }

  test(`${path} @ 360px: zaden tor siatki nie schodzi ponizej ${MIN_TOR_PX}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);

    const waskie = await page.evaluate((min) => {
      const opis = (el: Element) => {
        const klasy = Array.from(el.classList).slice(0, 4).join(".");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
          klasy ? `.${klasy}` : ""
        }`;
      };

      const wyniki: string[] = [];
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const style = getComputedStyle(el);
        if (style.display !== "grid" && style.display !== "inline-grid") {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // `gridTemplateColumns` czytany z `getComputedStyle` jest ROZWIAZANY:
        // przegladarka oddaje uzyte piksele ("311px" / "62px 62px 62px 62px"),
        // a nie zapis `repeat(4, 1fr)`. Dlatego ten pomiar widzi defekt, ktorego
        // czytanie arkusza nie pokaze.
        const tory = style.gridTemplateColumns
          .split(/\s+/)
          .filter((token) => token.endsWith("px"))
          .map((token) => Number.parseFloat(token))
          .filter((value) => Number.isFinite(value));

        // Siatka jednotorowa to POPRAWNY uklad waskiego ekranu — jej jedyny tor
        // jest kontenerem, wiec mierzenie go nie mowi nic o czytelnosci. Defekt
        // wzorca polega na tym, ze siatka ZOSTAJE wielokolumnowa przy 360 px.
        if (tory.length < 2) continue;
        if (tory.every((tor) => tor >= min)) continue;

        wyniki.push(
          `${opis(el)} — gridTemplateColumns="${style.gridTemplateColumns}"`,
        );
      }
      return wyniki;
    }, MIN_TOR_PX);

    expect(
      waskie,
      `${path} @ 360px: siatki z torem ponizej ${MIN_TOR_PX}px:\n${waskie.join("\n")}`,
    ).toEqual([]);
  });
}

/**
 * DRUGIE RAMIE BRAMKI (ISK-413 / CR-I3, punkt 4 karty M4b).
 *
 * CZEGO BRAKOWALO
 * Testy wyzej dowodza tylko tego, ze dzisiejszy produkt nie ma elementow poza
 * kadrem. Nie dowodza, ze detektor UMIE taki element znalezc — a przy poprzednim
 * (szerokim) wyjatku na przyciecie przez przodka NIE UMIAL: `h1` hero, rzad CTA
 * i tytul kazdej karty szkolenia byly zwolnione hurtem, bo `.home-hero` i
 * `.ui-card-flush` maja `overflow: hidden`. Bramka swiecila na zielono i swiecila
 * by dalej, gdyby tresc wyszla za kadr. Tu wstrzykujemy element szerszy od kadru
 * i WYMAGAMY zgloszenia.
 *
 * DLACZEGO KONTENERY SA WYKRYWANE, A NIE WPISANE NA LISTE
 * Lista selektorow starzeje sie w ciszy. Karta M4b wskazywala m.in.
 * `.ui-panel { overflow: hidden }` — ta regula nie jest przypisana zadnemu
 * elementowi w `app/` ani `components/`, czyli wskazywala na martwy kod,
 * a prawdziwe poddrzewo (`.home-hero-inner`) nie bylo wymienione wcale.
 * Dlatego ramie pyta STRONE, co faktycznie przycina, i wchodzi do kazdego
 * takiego kontenera po kolei.
 *
 * KAZDY KONTENER DOSTAJE OBA WSTRZYKNIECIA
 *  - element TRESCI (w drzewie dostepnosci, wskazywalny) — musi byc zgloszony;
 *  - ORNAMENT (`aria-hidden` + `pointer-events: none`) — musi byc zwolniony.
 * Pierwsze dowodzi, ze detektor dziala. Drugie dowodzi, ze wyjatek nadal
 * dziala CELOWO, a nie dlatego, ze go po cichu wylaczono — bez tej polowy
 * "poprawka" dajaca sie sprowadzic do usuniecia wyjatku tez by przeszla.
 */
test.describe("drugie ramie: detektor widzi tresc wewnatrz poddrzew przycinanych", () => {
  // 360 px to kadr, w ktorym tresc wychodzi za krawedz najlatwiej, a zarazem
  // ten, dla ktorego karta wprost wymienia naglowek hero, rzad CTA i tytul karty.
  const KADR = { width: 360, height: 900 } as const;

  for (const path of ["/", "/szkolenia"] as const) {
    test(`${path} @ ${KADR.width}px: kazdy kontener przycinajacy jest przeszukiwany`, async ({
      page,
    }) => {
      await page.setViewportSize({ ...KADR });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // Punkt odniesienia. Gdyby strona JUZ miala winowajce, nie dalo by sie
      // odroznic "detektor znalazl wstrzyknieta kontrolke" od "detektor zglasza
      // to, co bylo wczesniej".
      const przed = await zmierzPrzepelnienie(page);
      expect(
        przed.winowajcy,
        `${path}: punkt odniesienia nie jest czysty:\n${przed.winowajcy.join("\n")}`,
      ).toEqual([]);

      const kontenery = await oznaczKonteneryObcinajace(page);
      // Kontenery, ktore nie potrafia ulozyc pudelka HTML (element zastapiony
      // w rodzaju `<img>`). Nie da sie w nich NICZEGO pokazac, wiec nie da sie
      // tez niczego ukryc — pominiecie jest poprawne, ale musi byc WIDOCZNE
      // w raporcie, zeby „pominelismy wszystko" nie przeszlo za zielone.
      const pominiete: string[] = [];
      let sprawdzone = 0;

      for (const [indeks, opisKontenera] of kontenery.entries()) {
        // --- ramie negatywne: TRESC musi byc zgloszona ---------------------
        const tresc = await wstrzyknijZaSzeroki(page, {
          indeks,
          rodzaj: "tresc",
        });
        if (tresc.width === 0 || tresc.height === 0) {
          await usunWstrzyknieta(page, tresc.id);
          pominiete.push(opisKontenera);
          continue;
        }
        const zTrescia = await zmierzPrzepelnienie(page);
        expect(
          zTrescia.winowajcy.join("\n"),
          `${path}: element szerszy od kadru wstrzyknięty w ${opisKontenera} NIE zostal zgloszony — ` +
            `detektor jest slepy na tresc wewnatrz tego poddrzewa`,
        ).toContain(`#${tresc.id}`);
        await usunWstrzyknieta(page, tresc.id);

        // --- wyjatek nadal dziala: ORNAMENT musi byc zwolniony -------------
        const ornament = await wstrzyknijZaSzeroki(page, {
          indeks,
          rodzaj: "ornament",
        });
        const zOrnamentem = await zmierzPrzepelnienie(page);
        expect(
          zOrnamentem.winowajcy,
          `${path}: ornament w ${opisKontenera} zostal zgloszony jako winowajca — ` +
            `wyjatek na ozdoby przestal dzialac (poswiaty hero wyjda na czerwono)`,
        ).toEqual([]);
        expect(
          zOrnamentem.zwolnieni.join("\n"),
          `${path}: ornament w ${opisKontenera} nie trafil na liste zwolnionych — ` +
            `przeszedl inna sciezka, niz zaklada ten test`,
        ).toContain(`#${ornament.id}`);
        await usunWstrzyknieta(page, ornament.id);
        sprawdzone += 1;
      }

      // Bramka anty-wakuacyjna. Liczy kontenery FAKTYCZNIE sprawdzone, a nie
      // znalezione: gdyby arkusz przestal cokolwiek przycinac ALBO gdyby
      // wszystkie trafienia byly elementami zastapionymi, ramie mierzyloby
      // pusty zbior i przechodzilo bez ani jednej asercji — to jest ta pulapka,
      // ktora w tym repozytorium nazwano „zielona bramka, martwa dana".
      expect(
        sprawdzone,
        `${path}: ani jeden kontener przycinajacy nie zostal sprawdzony ` +
          `(znalezione: ${kontenery.length}, pominiete jako nieukladajace pudelka: ${
            pominiete.join(", ") || "brak"
          })`,
      ).toBeGreaterThan(0);

      // Stan koncowy rowny stanowi wejsciowemu — wstrzykniecia nie zostawiaja
      // osadu, ktory podpowiadalby wynik kolejnym asercjom.
      const po = await zmierzPrzepelnienie(page);
      expect(po.winowajcy).toEqual([]);
    });
  }

  test("asercja `scrollWidth` jest slepa na tresc w przycietym poddrzewie", async ({
    page,
  }) => {
    // Ten test nie bada produktu — dokumentuje POMIAREM, dlaczego glowna
    // asercja chodzi po dzieciach, a `scrollWidth` zostaje tylko dodatkiem
    // (patrz komentarz przy tamtej asercji). Bez tego dowodu "zostaje, bo tani"
    // jest opinia; z nim jest faktem zmierzonym w tym repozytorium.
    await page.setViewportSize({ width: 360, height: 900 });
    expect((await page.goto("/"))?.status()).toBe(200);

    const kontenery = await oznaczKonteneryObcinajace(page);
    expect(kontenery.length).toBeGreaterThan(0);

    // Pierwszy kontener, ktory NAPRAWDE uklada pudelko — indeks 0 na sztywno
    // zalezalby od kolejnosci w drzewie i wywrocilby ten test na elemencie
    // zastapionym, bez zadnego zwiazku z mierzona wlasnoscia.
    let tresc: Awaited<ReturnType<typeof wstrzyknijZaSzeroki>> | null = null;
    for (let indeks = 0; indeks < kontenery.length; indeks += 1) {
      const proba = await wstrzyknijZaSzeroki(page, {
        indeks,
        rodzaj: "tresc",
      });
      if (proba.width > 0 && proba.height > 0) {
        tresc = proba;
        break;
      }
      await usunWstrzyknieta(page, proba.id);
    }
    expect(
      tresc,
      "zaden kontener przycinajacy nie ulozyl pudelka — nie ma czym zmierzyc slepoty `scrollWidth`",
    ).not.toBeNull();
    const id = tresc!.id;

    const metryki = await zmierzPrzepelnienie(page);

    // Element wystaje 200 px za kadr i detektor dzieci go widzi...
    expect(metryki.winowajcy.join("\n")).toContain(`#${id}`);
    // ...a `scrollWidth` dalej raportuje kadr co do piksela, bo przodek
    // przycina. Dokladnie tak przechodzily poprzednie bramki przewijania.
    expect(
      metryki.scrollWidth,
      `scrollWidth ${metryki.scrollWidth} zglosil przepelnienie, ktore przodek przycina — ` +
        `jesli to sie zmienilo, komentarz przy asercji dodatkowej jest nieaktualny`,
    ).toBeLessThanOrEqual(metryki.kadr + 1);

    await usunWstrzyknieta(page, id);
  });
});
