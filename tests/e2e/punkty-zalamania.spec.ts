/**
 * ISK-412 / UX-K1 — NAGLOWEK I KORPUS PRZELACZAJA SIE NA TEJ SAMEJ GRANICY.
 *
 * CO BYLO ZLE
 * Nawigacja chowala sie za przyciskiem przy `max-width: 60rem` (960 px),
 * a siatki tresci schodzily do dwoch kolumn przy `max-width: 64rem` (1024 px).
 * W pasmie 961–1024 px pelny pasek desktopowy stal wiec nad korpusem juz
 * zwinietym — i dokladnie przy 1024 px zatwierdzona tabela punktow zalamania
 * obiecuje uklad desktopowy, a korpus byl mobilny.
 *
 * DLACZEGO ZADNA ISTNIEJACA BRAMKA TEGO NIE WIDZIALA
 * `widoki-publiczne-rwd.spec.ts` mierzy 360 / 768 / 1440 px — wszystkie trzy
 * leza POZA pasmem 961–1024 px, wiec rozjazd byl niewidoczny dla gates i dal
 * sie zobaczyc tylko na zrzucie. Ta bramka mierzy granice od obu stron:
 * 1023 px (ostatni mobilny) i 1024 px (pierwszy desktopowy).
 *
 * CO DOKLADNIE JEST ASERCJA
 * Nie „nawigacja jest taka a taka przy 1024 px” — to zapisywaloby biezacy
 * stan. Asercja jest RELACYJNA: tryb naglowka i tryb korpusu musza byc ZGODNE
 * przy kazdej mierzonej szerokosci. Taka bramka upada takze wtedy, gdy ktos
 * w przyszlosci przesunie jedna z dwoch granic, nie ruszajac drugiej — czyli
 * pilnuje wlasnosci, a nie liczby.
 */
import { expect, test, type Page } from "@playwright/test";

/**
 * Siatka odniesienia dla korpusu: cztery kroki „Jak to dziala” na stronie
 * glownej. Wybrana swiadomie, bo jej liczba elementow jest STALA (tresc
 * z `lib/audience.ts`, nie z bazy), wiec liczba torow zalezy wylacznie od
 * zapytan medialnych. Siatki zalezne od danych (wyroznione, katalog, trenerzy)
 * zmieniaja liczbe kolumn takze przez liczbe rekordow i nie nadaja sie na
 * miare punktu zalamania.
 */
const SIATKA_KORPUSU = ".home-steps";

type Tryb = {
  navPelna: boolean;
  navPrzycisk: boolean;
  toryKorpusu: number;
  gridTemplateColumns: string;
};

async function zmierzTryb(page: Page, selector: string): Promise<Tryb> {
  return page.evaluate((sel) => {
    const widoczny = (s: string) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).display !== "none" : false;
    };
    const grid = document.querySelector(sel);
    const gridTemplateColumns = grid
      ? getComputedStyle(grid).gridTemplateColumns
      : "";
    // `gridTemplateColumns` z `getComputedStyle` jest ROZWIAZANY do pikseli,
    // wiec widzi uklad UZYTY, a nie zapis `repeat(4, 1fr)` z arkusza.
    const toryKorpusu = gridTemplateColumns
      .split(/\s+/)
      .filter((token) => token.endsWith("px")).length;
    return {
      navPelna: widoczny(".site-nav"),
      navPrzycisk: widoczny(".site-nav-toggle"),
      toryKorpusu,
      gridTemplateColumns,
    };
  }, selector);
}

/** 1023 px to ostatni piksel trybu mobilnego, 1024 — pierwszy desktopowy. */
const GRANICA = [
  { width: 1023, desktop: false },
  { width: 1024, desktop: true },
] as const;

for (const { width, desktop } of GRANICA) {
  test(`strona glowna @ ${width}px: naglowek i korpus sa w tym samym trybie`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    const tryb = await zmierzTryb(page, SIATKA_KORPUSU);

    // Naglowek: dokladnie jeden z dwoch trybow, nigdy oba i nigdy zaden.
    expect(
      tryb.navPelna,
      `@ ${width}px: pelny pasek nawigacji oczekiwany=${desktop}`,
    ).toBe(desktop);
    expect(
      tryb.navPrzycisk,
      `@ ${width}px: przycisk nawigacji oczekiwany=${!desktop}`,
    ).toBe(!desktop);

    // Korpus: w trybie desktopowym siatka czterech krokow ma wiecej niz dwa
    // tory; w mobilnym dokladnie dwa (ponizej 40rem schodzi do jednego, ale
    // 1023 px jest powyzej tej granicy).
    if (desktop) {
      expect(
        tryb.toryKorpusu,
        `@ ${width}px: korpus mial byc desktopowy, gridTemplateColumns="${tryb.gridTemplateColumns}"`,
      ).toBeGreaterThan(2);
    } else {
      expect(
        tryb.toryKorpusu,
        `@ ${width}px: korpus mial byc mobilny, gridTemplateColumns="${tryb.gridTemplateColumns}"`,
      ).toBe(2);
    }
  });
}

/**
 * Ta sama wlasnosc zapisana wprost: nie ma szerokosci, przy ktorej pelny pasek
 * stoi nad korpusem mobilnym. To jest asercja, ktora upadala przed ISK-412 —
 * przy 1024 px `navPelna` bylo `true`, a korpus mial dwa tory.
 */
test("nie istnieje pasmo z pelnym paskiem nad korpusem mobilnym", async ({
  page,
}) => {
  const rozjazdy: string[] = [];

  for (const width of [960, 961, 1000, 1023, 1024, 1025, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    const tryb = await zmierzTryb(page, SIATKA_KORPUSU);
    const korpusDesktopowy = tryb.toryKorpusu > 2;
    if (tryb.navPelna !== korpusDesktopowy) {
      rozjazdy.push(
        `${width}px: navPelna=${tryb.navPelna} korpusDesktopowy=${korpusDesktopowy}` +
          ` (gridTemplateColumns="${tryb.gridTemplateColumns}")`,
      );
    }
  }

  expect(
    rozjazdy,
    `Naglowek i korpus przelaczaja sie przy roznych szerokosciach:\n${rozjazdy.join("\n")}`,
  ).toEqual([]);
});
