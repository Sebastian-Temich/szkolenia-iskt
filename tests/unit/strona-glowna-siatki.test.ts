/**
 * ISK-412 / UX-B2 — pasmo wyroznionych zweza sie RAZEM Z NAGLOWKIEM.
 *
 * Geometria (szerokosc pasma, liczba torow) jest wlasnoscia CSS i mierzy ja
 * bramka e2e; tutaj sprawdzamy decyzje, ktora podejmuje React: KTORE pasmo
 * dostaje modyfikator. To jest miejsce, w ktorym ISK-401 zrobil blad — zwezal
 * siatke, a naglowek zostawial na pelnej szerokosci kontenera — wiec kontrakt
 * „modyfikator siedzi na opakowaniu obejmujacym naglowek” wart jest bramki
 * tanszej niz uruchomienie przegladarki.
 *
 * Zakres `0..4`, bo tyle moze byc wyroznionych pozycji: `is_featured` ustawia
 * administrator w panelu i nie ma w produkcie reguly, ktora by to ograniczala
 * poza rozmiarem siatki wzorca.
 */
import { describe, expect, test } from "vitest";

import {
  areaGridClassName,
  featuredBandClassName,
  featuredGridClassName,
} from "@/app/(public)/home-sections";

describe("pasmo wyroznionych szkolen", () => {
  test("przy jednej i dwoch kartach pasmo jest zwezone", () => {
    expect(featuredBandClassName(1)).toBe("home-featured-band-1");
    expect(featuredBandClassName(2)).toBe("home-featured-band-2");
  });

  /**
   * Zasiew kanoniczny ma DOKLADNIE JEDNO wyroznione szkolenie, wiec to jest
   * stan, ktory ISKT widzi na odbiorze — i wlasnie ten przypadek bramka UX
   * nazwala „66% pustego pasma”. Dlatego ma wlasna, jawna asercje.
   */
  test("stan zasiewu (jedno szkolenie) zweza pasmo i daje jeden tor", () => {
    expect(featuredBandClassName(1)).toBe("home-featured-band-1");
    expect(featuredGridClassName(1)).toBe(
      "home-featured-grid home-featured-grid-1",
    );
  });

  test("przy trzech i czterech kartach pasmo zostaje pelne", () => {
    // Rzad jest wtedy domkniety, wiec nie ma pustki do zlikwidowania.
    expect(featuredBandClassName(3)).toBeUndefined();
    expect(featuredBandClassName(4)).toBeUndefined();
  });

  test("stan pusty nie zweza pasma", () => {
    // Przy zerze renderuje sie karta stanu pustego, a nie siatka — zwezenie
    // zrobiloby z komunikatu waski slupek.
    expect(featuredBandClassName(0)).toBeUndefined();
  });

  test("siatka dostaje modyfikator tylko ponizej czterech kart", () => {
    expect(featuredGridClassName(0)).toBe(
      "home-featured-grid home-featured-grid-0",
    );
    expect(featuredGridClassName(2)).toBe(
      "home-featured-grid home-featured-grid-2",
    );
    expect(featuredGridClassName(3)).toBe(
      "home-featured-grid home-featured-grid-3",
    );
    expect(featuredGridClassName(4)).toBe("home-featured-grid");
    // Piata pozycja nie ma wlasnego modyfikatora — wraca do pelnych rzedow.
    expect(featuredGridClassName(5)).toBe("home-featured-grid");
  });
});

describe("siatka obszarow", () => {
  /**
   * Regresja ISK-401, zostawiona jako bramka: przy liczbie kategorii
   * niepodzielnej przez 3 ostatni rzad jest wysrodkowany, zamiast zostawiac
   * dziure po prawej. Zasiew ma piec kategorii, czyli reszte 2.
   */
  test("reszta z dzielenia przez 3 wybiera modyfikator osierocenia", () => {
    expect(areaGridClassName(3)).toBe("home-area-grid");
    expect(areaGridClassName(6)).toBe("home-area-grid");
    expect(areaGridClassName(4)).toBe(
      "home-area-grid home-area-grid-orphans-1",
    );
    expect(areaGridClassName(5)).toBe(
      "home-area-grid home-area-grid-orphans-2",
    );
  });
});
