/**
 * Formatowanie wartosci katalogu do widoku.
 *
 * ISK-399 / D1 — granica, ktorej te funkcje pilnuja:
 * cena pokazywana w UI to WYLACZNIE `trainings.price_net_pln`. Wzorzec liczy
 * `pelna x 0.2` i dokleja "z dofinansowaniem" oraz "do 80%" — to regula
 * marketingowa prototypu, nie dana. Tutaj nie ma zadnego mnoznika i zadnego
 * progu procentowego; nie da sie go dodac bez zmiany tego pliku i jego testu.
 */

/**
 * Cena netto. `price_net_pln` to w bazie `numeric(10,2)`; PostgREST serializuje
 * `numeric` jako liczbe JSON, ale wersje roznia sie co do tego, wiec przyjmujemy
 * tez napis — inaczej zmiana wersji PostgREST po cichu zamienilaby cene na
 * "NaN zl".
 *
 * Grupowanie tysiecy robi `Intl` dla `pl-PL` (waska spacja nierozdzielajaca),
 * a nie recznie wstawiana zwykla spacja jak we wzorcu: zwykla spacja pozwala
 * zlamac cene w pol przy waskiej kolumnie.
 */
export function formatPriceNet(value: number | string | null): string | null {
  if (value === null || value === undefined) return null;
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return null;
  // Grosze pokazujemy tylko wtedy, gdy sa — `1990.00 zl` czyta sie jak blad.
  const hasFraction = Math.abs(amount % 1) > Number.EPSILON;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(amount);
}

/**
 * Czas trwania. Kolumna jest `numeric` w godzinach (zasiew: `16.0`), a nie
 * tekstem jak we wzorcu ("2 dni · 16h"), wiec liczba dni nie jest w danych
 * i jej nie zgadujemy. Polowki godziny wystepuja w modelu (`numeric`), stad
 * `0,5 godz.` zamiast zaokraglenia w dol.
 */
export function formatDurationHours(hours: number | null): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return null;
  }
  const text = new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 1,
  }).format(hours);
  return `${text} godz.`;
}

/** Numer modulu programu: "01", "02", ... — numeracja nie jest w danych. */
export function formatProgramIndex(index: number): string {
  return String(index + 1).padStart(2, "0");
}
