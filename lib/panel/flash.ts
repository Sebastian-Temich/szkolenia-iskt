/**
 * Pasek potwierdzenia operacji panelu (ISK-402 / M3).
 *
 * Wzorzec pokazuje po kazdym zapisie banner „Zapisano zmiany: „<tytul>"" —
 * zwykly `div`, wiec czytnik ekranu nie oglasza nic (nosnikiem jest u nas
 * `Notice` z `role="status"`).
 *
 * DLACZEGO KOD, A NIE TEKST W ADRESIE
 * Akcje panelu koncza sie `redirect()` na liste, wiec komunikat musi przejsc
 * przez adres. Przenosimy przez niego WYLACZNIE kod ze zamknietego zbioru,
 * a tekst bierzemy z mapy po stronie serwera. Gdyby w adresie jechal gotowy
 * napis (albo tytul pozycji, jak we wzorcu), kazdy link z `?komunikat=…`
 * wstawialby w panel administratora dowolna tresc — React owszem ucieknie
 * znaki, wiec nie bylby to XSS, ale banner „Zapisano zmiany" potwierdzajacy
 * operacje, ktorej nie bylo, jest sam w sobie wektorem socjotechnicznym.
 * Nieznany kod nie daje zadnego bannera.
 */
export const FLASH_PARAM = "komunikat";

const FLASH_MESSAGES = {
  "szkolenie-zapisane": "Zapisano szkolenie.",
  "trener-zapisany": "Zapisano profil trenera.",
  "kategoria-zapisana": "Zapisano kategorię.",
  "notatka-zapisana": "Zapisano notatkę wewnętrzną.",
} as const;

export type FlashCode = keyof typeof FLASH_MESSAGES;

/** Tresc bannera dla wartosci z `searchParams`; `null` gdy kod jest nieznany. */
export function flashMessage(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string") return null;
  return Object.prototype.hasOwnProperty.call(FLASH_MESSAGES, value)
    ? FLASH_MESSAGES[value as FlashCode]
    : null;
}

/** Adres przekierowania po udanym zapisie. */
export function withFlash(path: string, code: FlashCode): string {
  return `${path}?${FLASH_PARAM}=${encodeURIComponent(code)}`;
}
