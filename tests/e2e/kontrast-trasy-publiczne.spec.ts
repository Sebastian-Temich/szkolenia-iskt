// ISK-410 / CR-I6 — kontrast AA mierzony na REALNYCH trasach publicznych.
//
// Dlaczego ten plik musial powstac, skoro kontrast byl juz "pokryty":
//
//  1. `fundament-ui.spec.ts` mierzy selektory `#ds .ui-*`, czyli zmontowana
//     galerie design systemu. To nie jest zadna strona produktu — galeria nie
//     stawia `.ui-button` na markowym gradiencie, bo nie odtwarza ukladu
//     landinga.
//  2. `panel-wzorzec.spec.ts` i `ux-blockers.spec.ts` mierza wylacznie panel
//     administratora.
//  3. Landing, katalog, szczegol, trenerzy, kontakt i polityka mialy jedyne
//     zabezpieczenie w regule axe `color-contrast` — a ta nad gradientem
//     oddaje `incomplete`, nie `violation` (patrz `dostepnosc.spec.ts`).
//
// Do tego dochodzi czwarty, niezalezny powod, dla ktorego CR-B1 przezyl
// wszystkie bramki: oba znaki marki (`.site-brand-mark`, `.footer-brand-mark`)
// niosa WIDOCZNY tekst "ISKT", ale maja `aria-hidden="true"`. axe pomija
// wezly `aria-hidden` z zasady, wiec nawet gdyby umial policzyc gradient,
// nigdy by na nie nie spojrzal. WCAG 1.4.3 obowiazuje je mimo to — kryterium
// mowi o tekscie RENDEROWANYM, a nie o tym, co widzi czytnik ekranu. Pomiar
// nizej celowo ich nie pomija.
import { expect, test, type Page } from "@playwright/test";

import { contrastSamples, formatSample } from "./helpers/kontrast";

const TRASY: Array<[name: string, path: string]> = [
  ["strona glowna", "/"],
  ["katalog", "/szkolenia"],
  ["szczegol szkolenia", "/szkolenia/wprowadzenie-do-ai"],
  ["trenerzy", "/trenerzy"],
  ["kontakt", "/kontakt"],
  ["polityka prywatnosci", "/polityka-prywatnosci"],
];

/**
 * Oznacza elementy, ktore faktycznie RYSUJA tekst: liscie drzewa (bez dzieci
 * elementowych) z niepusta trescia. Bez tego filtra pomiar objalby kontenery,
 * ktorych `textContent` to sklejka tekstu potomkow — komunikat bledu
 * wskazywalby wtedy `<body>` zamiast konkretnego napisu.
 *
 * Tagujemy atrybutem zamiast uzywac `:not(:has(*))`, bo selektor ma trafic
 * dokladnie w ten sam zbior, ktory policzylismy — bez zaleznosci od tego,
 * ktora wersja `:has()` siedzi w przegladarce.
 */
async function oznaczTekstowe(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ATRYBUT = "data-kontrast-probka";
    document
      .querySelectorAll(`[${ATRYBUT}]`)
      .forEach((n) => n.removeAttribute(ATRYBUT));

    let licznik = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.children.length > 0) continue;
      if (!(el.textContent ?? "").trim()) continue;

      // Element niewidoczny nie podlega 1.4.3. `checkVisibility` lapie te
      // przypadki, ktorych sama geometria nie lapie (np. `visibility:
      // hidden` o niezerowym pudelku) — geometrie i tak odfiltruje helper.
      if (typeof el.checkVisibility === "function" && !el.checkVisibility()) {
        continue;
      }
      // `<option>` renderuje sie w widgecie systemowym, poza kontrola CSS.
      if (el.tagName === "OPTION") continue;

      el.setAttribute(ATRYBUT, "");
      licznik += 1;
    }
    return licznik;
  });
}

for (const [name, path] of TRASY) {
  test(`${name} (${path}): kazdy renderowany napis przechodzi prog 1.4.3`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);

    const oznaczone = await oznaczTekstowe(page);
    // Pusty zbior dalby zielony test bez pomiaru — trasa z kilkoma napisami
    // to znak, ze strona sie nie wyrenderowala, a nie ze kontrast jest OK.
    expect(
      oznaczone,
      `Na ${path} znalazlem tylko ${oznaczone} napisow — strona sie nie zlozyla, pomiar nie ma na czym stac`,
    ).toBeGreaterThan(20);

    // Helper odrzuca jeszcze elementy o zerowej geometrii, wiec probek bywa
    // mniej niz oznaczonych — prog anty-wakuumowy powtarzamy po pomiarze,
    // zamiast zadac rownosci, ktora zalezy od szczegolow ukladu.
    const probki = await contrastSamples(page, "[data-kontrast-probka]");
    expect(
      probki.length,
      `Zmierzylem tylko ${probki.length} z ${oznaczone} oznaczonych napisow na ${path}`,
    ).toBeGreaterThan(20);

    const zaNiskie = probki.filter((s) => s.ratio < s.required);
    expect(
      zaNiskie.map(formatSample),
      `Kontrast ponizej AA na ${path}`,
    ).toEqual([]);
  });
}

test.describe("powierzchnie markowe (CR-B1)", () => {
  // Nosniki wymienione w ISK-410. `.panel-avatar` stoi w panelu, wiec tu go
  // nie ma — pokrywa go `panel-wzorzec.spec.ts`.
  const NOSNIKI: Array<[name: string, path: string, selector: string]> = [
    ["znak marki w naglowku", "/", ".site-brand-mark"],
    ["znak marki w stopce", "/", ".footer-brand-mark"],
    // Panel dofinansowan niesie tekst w potomkach, wiec bierzemy jego liscie
    // przez to samo tagowanie, co pomiar calych tras.
    ["panel dofinansowan", "/", ".ui-panel-brand [data-kontrast-probka]"],
  ];

  for (const [name, path, selector] of NOSNIKI) {
    test(`${name}: tlem porownania jest gradient, nie biel strony`, async ({
      page,
    }) => {
      await page.goto(path);
      await oznaczTekstowe(page);
      const probki = await contrastSamples(page, selector);
      expect(
        probki.length,
        `selektor \`${selector}\` nic nie zlapal — markup sie rozjechal`,
      ).toBeGreaterThan(0);

      // ASERCJA ANTY-WAKUUMOWA, sedno slepej plamy nr 1.
      //
      // Przed ISK-410 helper czytal wylacznie `backgroundColor`, wiec na
      // `--gradient-brand` (ktory siedzi w `background-image`) wracal
      // `rgba(0,0,0,0)`, obchod szedl do bialego `body` i probka raportowala
      // kontrast WOBEC BIELI. Pomiar byl zielony, bo mierzyl inna scene niz
      // ta, ktora widzi uzytkownik.
      //
      // `backgroundsConsidered > 1` moze byc prawda TYLKO wtedy, gdy helper
      // realnie rozlozyl gradient na stopnie. Gdyby ktos cofnal kompozycje
      // `background-image`, ta asercja padnie — nawet jesli kolory beda
      // poprawne. Dokladnie o to chodzi: pilnuje bramki, nie produktu.
      const naGradiencie = probki.filter((s) => s.backgroundsConsidered > 1);
      expect(
        naGradiencie.length,
        `Zaden pomiar \`${selector}\` nie widzial gradientu (backgroundsConsidered <= 1 wszedzie). ` +
          `To znaczy, ze tlem porownania znow jest biel strony, a nie powierzchnia markowa. ` +
          `Probki: ${probki.map(formatSample).join(" | ")}`,
      ).toBeGreaterThan(0);

      const zaNiskie = probki.filter((s) => s.ratio < s.required);
      expect(
        zaNiskie.map(formatSample),
        `Kontrast ponizej AA: ${name}`,
      ).toEqual([]);
    });
  }

  // ARM NEGATYWNY (Definition of Done).
  //
  // Zielona bramka nie dowodzi, ze bramka cokolwiek lapie — dowodzi tylko, ze
  // dzis nic nie wystaje. Dlatego wstrzykujemy z powrotem DOKLADNIE ten
  // kolor, ktory ISK-410 usunal (`#54841d`, biel 4,4726:1), i zadamy, zeby
  // pomiar go zglosil. Jesli ten test przestanie lapac regresje, znaczy to,
  // ze kompozycja gradientu znow jest martwa.
  test("arm negatywny: przywrocenie starego green-500 jest wychwycone", async ({
    page,
  }) => {
    await page.goto("/");

    // Stan sprzed poprawki. `--gradient-brand` odwoluje sie do tokenu przez
    // `var()`, a custom properties rozwiazuja sie w miejscu UZYCIA, wiec
    // nadpisanie tokenu na `:root` wraca cala powierzchnie markowa do 4,47:1.
    await page.addStyleTag({
      content: ":root { --color-green-500: #54841d; }",
    });

    const probki = await contrastSamples(page, ".site-brand-mark");
    expect(probki.length).toBeGreaterThan(0);

    const zaNiskie = probki.filter((s) => s.ratio < s.required);
    expect(
      zaNiskie.length,
      `Bramka NIE wychwycila przywroconego #54841d — kompozycja gradientu znow nie dziala. ` +
        `Zmierzono: ${probki.map(formatSample).join(" | ")}`,
    ).toBeGreaterThan(0);

    // Nie wystarczy "cokolwiek padlo" — wartosc ma byc ta, ktora policzyl
    // recenzent ISK-404. Rozny wynik oznaczalby, ze mierzymy inna scene.
    for (const probka of zaNiskie) {
      expect(probka.ratio, formatSample(probka)).toBeCloseTo(4.47, 1);
    }
  });

  // ARM POZYTYWNY: ta sama powierzchnia, ten sam pomiar, kolor po poprawce.
  // Oba ramiona w jednym pliku, zeby nie dalo sie przeoczyc, ze jedno z nich
  // zostalo wylaczone.
  test("arm pozytywny: po poprawce znak marki przechodzi z zapasem", async ({
    page,
  }) => {
    await page.goto("/");

    const probki = await contrastSamples(page, ".site-brand-mark");
    expect(probki.length).toBeGreaterThan(0);

    for (const probka of probki) {
      expect(probka.backgroundsConsidered).toBeGreaterThan(1);
      expect(probka.required).toBe(4.5); // 13 px/800 to tekst NORMALNY
      expect(probka.ratio, formatSample(probka)).toBeCloseTo(4.71, 1);
      expect(probka.ratio).toBeGreaterThanOrEqual(probka.required);
    }
  });
});
