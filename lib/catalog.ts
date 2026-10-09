export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export function normalizeCatalogQuery(params: CatalogSearchParams) {
  const value = (key: string) => {
    const raw = params[key];
    if (typeof raw !== "string") return "";
    return raw.trim().replace(/\s+/g, " ");
  };

  return {
    category: value("category").slice(0, 64),
    q: value("q").slice(0, 80),
  };
}

/**
 * Odpowiednik `public.immutable_unaccent()` z migracji E2, po stronie klienta.
 * Kolumna `trainings.search_tsv` jest zbudowana na tekscie przepuszczonym przez
 * `unaccent`, wiec fraza musi przejsc te sama normalizacje — inaczej zapytanie
 * "zrownowazony" trafia, a to samo slowo wpisane z polskimi znakami nie trafia.
 *
 * NFD rozklada wiekszosc polskich znakow na litere bazowa i znak diakrytyczny,
 * ale "l" z kreska (U+0142) nie ma rozkladu — slownik unaccent mapuje je na "l",
 * wiec odwzorowujemy to jawnie.
 */
export function unaccentPl(phrase: string): string {
  return phrase
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
}

/** Polska odmiana rzeczownika "szkolenie" przez liczebnik (1 / 2-4 / 5+). */
export function describeTrainingCount(count: number): string {
  const lastDigit = Math.abs(count) % 10;
  const lastTwoDigits = Math.abs(count) % 100;
  if (Math.abs(count) === 1) return `${count} szkolenie`;
  if (
    lastDigit >= 2 &&
    lastDigit <= 4 &&
    !(lastTwoDigits >= 12 && lastTwoDigits <= 14)
  ) {
    return `${count} szkolenia`;
  }
  return `${count} szkoleń`;
}
