import { describe, expect, it } from "vitest";

import { AUDIENCES, AUDIENCE_COPY, toAudience } from "@/lib/audience";
import { CATEGORY_ICON_FALLBACK, categoryIconName } from "@/lib/category-icon";
import {
  formatDurationHours,
  formatPriceNet,
  formatProgramIndex,
} from "@/lib/format";
import { orderTrainerLinks, type TrainerLink } from "@/lib/public-catalog";
import { ICON_NAMES } from "@/components/ui";

/**
 * ISK-401. Trzy pola istnialy w bazie i nie docieraly do UI, a jedno —
 * kolejnosc prowadzacych — bylo niedeterministyczne. Te testy pilnuja warstwy,
 * ktora je udostepnia, bo kazdy z tych defektow byl niewidoczny: dane byly
 * poprawne, tylko nikt ich nie czytal, wiec zielona bramka nic nie znaczyla.
 */

describe("formatPriceNet", () => {
  /**
   * ISK-399 / D1 pilnowane TESTEM, nie komentarzem. Wzorzec liczy cene jako
   * `pelna x 0.2` i dokleja "z dofinansowaniem". Gdyby ktos kiedys wprowadzil
   * tu mnoznik, ten test padnie — a sama regula w komentarzu nie bronilaby sie
   * niczym.
   */
  it("pokazuje cene katalogowa bez zadnego mnoznika", () => {
    expect(formatPriceNet(1990)).toContain("1990".slice(0, 1));
    // 20% z 1990 to 398 — ta wartosc nie moze wystapic w wyniku.
    expect(formatPriceNet(1990)).not.toContain("398");
    // Wynik musi zawierac pelna kwote, nie jej czesc.
    expect(normalizeDigits(formatPriceNet(1990))).toContain("1990");
  });

  it("pomija grosze, gdy ich nie ma, i pokazuje je, gdy sa", () => {
    // `1990,00 zl` czyta sie jak blad w cenniku; `1990,50 zl` juz nie.
    expect(formatPriceNet(1990)).not.toMatch(/[.,]00/);
    expect(formatPriceNet(1990.5)).toMatch(/[.,]50/);
  });

  it("przyjmuje napis, bo serializacja `numeric` zalezy od wersji PostgREST", () => {
    expect(normalizeDigits(formatPriceNet("1990.00"))).toContain("1990");
    expect(formatPriceNet("1990.00")).toEqual(formatPriceNet(1990));
  });

  it("zwraca null dla braku ceny i dla wartosci nieliczbowej", () => {
    // Bez tego widok renderowalby "NaN zl" — czyli stan gorszy niz brak ceny,
    // bo wyglada na dane, a nie na brak danych.
    expect(formatPriceNet(null)).toBeNull();
    expect(formatPriceNet("brak")).toBeNull();
  });
});

describe("formatDurationHours", () => {
  it("formatuje godziny i nie zgaduje liczby dni", () => {
    // Wzorzec trzyma czas jako tekst ("2 dni · 16h"). W modelu jest liczba
    // godzin; liczby dni nie ma, wiec nie wolno jej dopisac.
    const text = formatDurationHours(16);
    expect(text).toContain("16");
    expect(text).not.toMatch(/dni|dzie/i);
  });

  it("zachowuje polowki godziny, bo kolumna jest `numeric`", () => {
    expect(formatDurationHours(1.5)).toMatch(/1[.,]5/);
  });

  it("zwraca null dla braku wartosci", () => {
    expect(formatDurationHours(null)).toBeNull();
  });
});

describe("formatProgramIndex", () => {
  it("numeruje moduly od 01, bo numeracji nie ma w danych", () => {
    expect(formatProgramIndex(0)).toBe("01");
    expect(formatProgramIndex(9)).toBe("10");
  });
});

describe("categoryIconName", () => {
  /**
   * Kolumna `categories.icon` jest wypelniona od zasiewu E2 nazwami z Lucide
   * w wersji z tamtego czasu. Zestaw bundlowany w M1 pochodzi
   * z `lucide-static@1.61.0`, gdzie `code` i `flask` nazywaja sie inaczej.
   * Tlumaczenie jest w warstwie widoku, nie w bazie.
   */
  it("tlumaczy nazwy z zasiewu na nazwy z zestawu", () => {
    expect(categoryIconName("code")).toBe("code-xml");
    expect(categoryIconName("flask")).toBe("flask-conical");
  });

  it("przepuszcza nazwy, ktore zestaw zna wprost", () => {
    for (const name of ["cpu", "leaf", "languages"]) {
      expect(categoryIconName(name)).toBe(name);
    }
  });

  it("kazda nazwa z zasiewu daje ikone, ktora zestaw potrafi narysowac", () => {
    // To jest wlasciwa asercja tego modulu: nie "mapa ma wpisy", ale
    // "zaden obszar z zasiewu nie wyladuje na zastepniku". Bez niej literowka
    // w aliasie przeszlaby, bo fallback zawsze cos rysuje.
    const seeded = ["cpu", "leaf", "languages", "code", "flask"];
    for (const name of seeded) {
      const resolved = categoryIconName(name);
      expect(ICON_NAMES).toContain(resolved);
      expect(resolved).not.toBe(CATEGORY_ICON_FALLBACK);
    }
  });

  it("nieznana i pusta wartosc daje zastepnik, a nie wyjatek", () => {
    // Administrator moze wpisac w panelu dowolny napis. Sekcja "Obszary" nie
    // moze sie od tego wywalic.
    expect(categoryIconName("nie-ma-takiej-ikony")).toBe(
      CATEGORY_ICON_FALLBACK,
    );
    expect(categoryIconName(null)).toBe(CATEGORY_ICON_FALLBACK);
    expect(categoryIconName("")).toBe(CATEGORY_ICON_FALLBACK);
    expect(ICON_NAMES).toContain(CATEGORY_ICON_FALLBACK);
  });
});

describe("orderTrainerLinks", () => {
  const trainer = (full_name: string) => ({
    id: full_name,
    slug: full_name,
    full_name,
    headline: null,
    bio: null,
    competences: [],
    photo_url: null,
  });

  it("sortuje po `sort_order`, ktorego embed wczesniej nie pobieral", () => {
    const links: TrainerLink[] = [
      { sort_order: 20, trainer: trainer("Druga") },
      { sort_order: 10, trainer: trainer("Pierwsza") },
    ];
    expect(orderTrainerLinks(links).map((t) => t.full_name)).toEqual([
      "Pierwsza",
      "Druga",
    ]);
  });

  it("remis rozstrzyga nazwisko, wiec kolejnosc nie zalezy od zapytania", () => {
    // `sort_order` rowne u dwoch osob jest w bazie dopuszczalne. Bez tego
    // rozstrzygniecia PostgREST moglby zwracac je w dowolnej kolejnosci, a karta
    // "Prowadzacy" ustawialaby ludzi inaczej miedzy odpowiedziami.
    const ab: TrainerLink[] = [
      { sort_order: 10, trainer: trainer("Beata") },
      { sort_order: 10, trainer: trainer("Adam") },
    ];
    const ba: TrainerLink[] = [...ab].reverse();
    expect(orderTrainerLinks(ab).map((t) => t.full_name)).toEqual([
      "Adam",
      "Beata",
    ]);
    expect(orderTrainerLinks(ba)).toEqual(orderTrainerLinks(ab));
  });

  it("brak `sort_order` traktuje jak zero, nie jak NaN", () => {
    // `null - 10` daje NaN, a komparator zwracajacy NaN zostawia tablice
    // w kolejnosci wejsciowej — czyli po cichu wraca defekt.
    const links: TrainerLink[] = [
      { sort_order: null, trainer: trainer("Bez kolejnosci") },
      { sort_order: -5, trainer: trainer("Przed zerem") },
    ];
    expect(orderTrainerLinks(links).map((t) => t.full_name)).toEqual([
      "Przed zerem",
      "Bez kolejnosci",
    ]);
  });

  it("pomija powiazania bez trenera", () => {
    // Trener wycofany z publikacji nie wchodzi w embed, wiec `trainer` jest
    // `null`, a wiersz powiazania zostaje.
    const links: TrainerLink[] = [
      { sort_order: 10, trainer: null },
      { sort_order: 20, trainer: trainer("Jedyna") },
    ];
    expect(orderTrainerLinks(links)).toHaveLength(1);
  });
});

describe("przelacznik audytorium", () => {
  it("ma tresc dla kazdego rodzaju zgloszenia", () => {
    // `AUDIENCES` to `INQUIRY_KINDS` z `lib/validation/inquiry.ts`. Dodanie tam
    // trzeciego rodzaju musi tu padnac, a nie wyrenderowac puste hero.
    for (const audience of AUDIENCES) {
      const copy = AUDIENCE_COPY[audience];
      expect(copy).toBeDefined();
      expect(copy.heroTitle.length).toBeGreaterThan(0);
      expect(copy.processSteps).toHaveLength(4);
    }
  });

  it("zaden tekst nie zawiera progu procentowego ani oceny (D1)", () => {
    // ISK-399 / D1 zabrania "do 80%", "4.9/5", "15+/200+" i SLA "24 godzin".
    // Komentarz tego nie pilnuje — ten test pilnuje.
    const all = AUDIENCES.flatMap((audience) => {
      const copy = AUDIENCE_COPY[audience];
      return [
        copy.heroEyebrow,
        copy.heroTitle,
        copy.heroLead,
        copy.heroCta,
        copy.processTitle,
        copy.processLead,
        copy.contactTitle,
        copy.contactLead,
        ...copy.processSteps.flatMap((step) => [step.title, step.description]),
      ];
    }).join(" ");

    expect(all).not.toMatch(/\d\s*%/);
    expect(all).not.toMatch(/80\s*%/);
    expect(all).not.toMatch(/\d[.,]\d\s*\/\s*5/);
    expect(all).not.toMatch(/\b\d+\+/);
    expect(all).not.toMatch(/24\s*godzin/i);
  });

  it("kazdy krok procesu ma ikone z zestawu", () => {
    for (const audience of AUDIENCES) {
      for (const step of AUDIENCE_COPY[audience].processSteps) {
        expect(ICON_NAMES).toContain(step.icon);
      }
    }
  });

  it("`toAudience` nie przepuszcza wartosci z adresu", () => {
    // `/kontakt?rodzaj=` przyjmuje dowolny napis z zewnatrz.
    expect(toAudience("firma")).toBe("firma");
    expect(toAudience("osoba")).toBe("osoba");
    expect(toAudience("administrator")).toBe("osoba");
    expect(toAudience(undefined)).toBe("osoba");
    expect(toAudience(["firma"])).toBe("osoba");
  });
});

/** Usuwa separatory grup i waskie spacje, zeby porownac same cyfry. */
function normalizeDigits(value: string | null): string {
  return (value ?? "").replace(/[^\d]/g, "");
}
