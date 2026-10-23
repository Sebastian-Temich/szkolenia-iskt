/**
 * ISK-418 / F9 — bramka widocznosci pierscienia focusu (WCAG 2.1 SC 1.4.11).
 *
 * DLACZEGO OSOBNA BRAMKA, SKORO JEST JUZ SKAN axe
 * `axe-core` NIE ocenia kontrastu wskaznika focusu — regula `color-contrast`
 * dotyczy tekstu. Przebieg WCAG 2.1 AA na 45 pomiarach widokow dal zero
 * naruszen przy pierscieniu o kontrascie 1,45:1 na pasmie CTA i 2,07:1 na
 * stopce. Klasa F9 przezyla komplet zielonych bramek wlasnie dlatego, ze
 * zadna jej nie mierzyla.
 *
 * DLACZEGO PRZEJSCIE Tab, A NIE LISTA SELEKTOROW
 * Pierscien zalezy od TLA, na ktorym lezy, a nie od samego elementu. Lista
 * selektorow pilnowalaby tych miejsc, ktore ktos pamietal; przejscie
 * klawiatura obchodzi kazdy element w kolejnosci, w ktorej dojdzie do niego
 * uzytkownik, razem ze stopka na `ink-900` i pasmami `green-700`.
 *
 * Test `pokrycie powierzchni ciemnych` pilnuje, zeby bramka nie byla pusta:
 * gdyby przejscie nie dochodzilo do zadnej ciemnej powierzchni, pozostale
 * asercje bylyby zielone na samych tlach jasnych — czyli dokladnie poza
 * miejscem najglebszej awarii. Ten straznik zadzialal od razu: pierwsza wersja
 * chodzila po `/` i oczekiwala ciemnej stopki, ktora od M2 jest jasna.
 */
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import {
  opisPrzystanku,
  przejscieFocusem,
  PROG_1411,
  type PrzystanekFocusu,
} from "./helpers/pierscien-focusu";

/**
 * Zapas ponad faktyczna liczbe przystankow na najdluzszym widoku (pomiar
 * ISK-403/M4a: 189 przystankow na pieciu widokach). Po wyjsciu poza ostatni
 * element focus wraca na poczatek dokumentu i przystanki sie powtarzaja —
 * to nie szkodzi, bo oceniamy kazdy z osobna.
 */
const LICZBA_TABOW = 60;

const WIDOKI_PUBLICZNE: Array<[nazwa: string, sciezka: string]> = [
  ["strona glowna", "/"],
  ["katalog", "/szkolenia"],
  ["szczegol szkolenia", "/szkolenia/wprowadzenie-do-ai"],
  ["kontakt", "/kontakt"],
];

/** Luminancja tla z opisu `rgb(r, g, b)` zwroconego przez pomiar. */
function luminancjaTla(opis: string): number {
  const m = opis.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return 1;
  const kanal = (v: string) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(m[1]!) + 0.7152 * kanal(m[2]!) + 0.0722 * kanal(m[3]!);
}

/** Przystanki, ktore nie spelniaja kryterium — brak pierscienia tez jest wada. */
function naruszenia(przystanki: PrzystanekFocusu[]): string[] {
  return przystanki
    .filter((p) => !p.maPierscien || p.kontrast < PROG_1411)
    .map(opisPrzystanku);
}

for (const [nazwa, sciezka] of WIDOKI_PUBLICZNE) {
  test(`pierscien focusu >= ${PROG_1411}:1 na kazdym przystanku Tab — ${nazwa}`, async ({
    page,
  }) => {
    const odpowiedz = await page.goto(sciezka);
    expect(odpowiedz?.status()).toBe(200);

    const przystanki = await przejscieFocusem(page, LICZBA_TABOW);

    // Bez tego widok bez elementow fokusowalnych (albo z zepsutym pomiarem)
    // przechodzilby na pustej liscie.
    expect(
      przystanki.length,
      `przejscie Tab nie zatrzymalo sie na zadnym elemencie na ${sciezka}`,
    ).toBeGreaterThan(5);

    expect(naruszenia(przystanki)).toEqual([]);
  });
}

/**
 * DLACZEGO SZCZEGOL SZKOLENIA, A NIE STRONA GLOWNA
 * Pierwsza wersja tego testu chodzila po `/` i oczekiwala ciemnej stopki.
 * To zalozenie jest nieaktualne: `.site-footer` ma DWIE reguly w tej samej
 * warstwie `components` i ta pozniejsza (`app/globals.css`, sekcja stopki)
 * maluje ja na `--color-surface-page`, czyli jasno. Stopka przestala byc
 * ciemna w M2 i zaden przystanek Tab na `/` nie wypadal na ciemnym tle —
 * test slusznie zglaszal wtedy, ze bramka byla pusta (zmierzone: 59
 * przystankow, zero ciemnych).
 *
 * Ciemna powierzchnia z elementem fokusowalnym jest dzis na szczegole
 * szkolenia: karta dofinansowania to `<Card tone="dark">` (`.ui-card-dark`,
 * tlo `ink-900`) z przyciskiem `variant="light"` w srodku. Na niej wlasnie
 * zmierzono defekt F9 (1,54:1 — rdzen bez obwodki).
 */
test("pokrycie powierzchni ciemnych — pomiar dochodzi do karty ink-900", async ({
  page,
}) => {
  await page.goto("/szkolenia/wprowadzenie-do-ai");
  const przystanki = await przejscieFocusem(page, LICZBA_TABOW);

  // `.ui-card-dark` ma `background: var(--color-ink-900)` (#0e1511,
  // luminancja 0,006). Prog 0,2 lapie cala rodzine ciemnych powierzchni
  // (`ink-900`, `green-700` = 0,069), a odcina tla jasne.
  const ciemne = przystanki.filter((p) => luminancjaTla(p.tloOtoczenia) < 0.2);
  expect(
    ciemne.map(opisPrzystanku),
    `zaden z ${przystanki.length} przystankow nie wypadl na ciemnym tle — ` +
      `bramka mierzy wtedy wylacznie tla jasne i jest pusta tam, gdzie ` +
      `defekt F9 byl najglebszy (pasmo CTA 1,45:1)`,
  ).not.toEqual([]);

  // Na tych wlasnie przystankach pierscien mial 1,54:1 przed naprawa: rdzen
  // `green-800` bez obwodki, bo `box-shadow` skladnika z `@layer components`
  // wygrywal z obwodka z `@layer base`.
  expect(naruszenia(ciemne)).toEqual([]);
});

test(`pierscien focusu >= ${PROG_1411}:1 na kazdym przystanku Tab — panel/zgloszenia`, async ({
  page,
}) => {
  await loginAsAdmin(page);
  const odpowiedz = await page.goto("/panel/zgloszenia");
  expect(odpowiedz?.status()).toBe(200);

  const przystanki = await przejscieFocusem(page, LICZBA_TABOW);
  expect(przystanki.length).toBeGreaterThan(5);
  expect(naruszenia(przystanki)).toEqual([]);
});
