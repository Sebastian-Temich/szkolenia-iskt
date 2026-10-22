/**
 * Pasek potwierdzenia operacji panelu (ISK-402 / M3; naprawiony w ISK-414).
 *
 * Wzorzec pokazuje po kazdym zapisie banner „Zapisano zmiany: „<tytul>"" —
 * zwykly `div`, wiec czytnik ekranu nie oglasza nic (nosnikiem jest u nas
 * `Notice` z `role="status"`).
 *
 * CZEGO NIE ZAMYKAL SAM KOD W ADRESIE (CR-I8)
 * Pierwsza wersja przenosila przez adres kod ze zamknietego zbioru i uznawala
 * to za wystarczajace zabezpieczenie: nieznany kod nie dawal bannera. Tylko ze
 * ZNANY kod jest bannerem — `/panel/szkolenia?komunikat=szkolenie-zapisane`
 * podeslany administratorowi renderowal „Zapisano szkolenie." mimo ze nic nie
 * zostalo zapisane. Domkniety zbior ograniczal TRESC, a nie prawo do jej
 * wyswietlenia. Ten sam defekt dzialal w druga strone: banner byl LEPKI, wiec
 * F5 po NIEUDANEJ pozniejszej edycji nadal potwierdzal sukces.
 *
 * JAK JEST TERAZ: ADRES + CIASTECZKO, ZUZYWANE RAZ
 * Akcja zapisu losuje jednorazowy `nonce`, zapisuje w ciasteczku `panel_flash`
 * pare `<kod>.<nonce>` i przekierowuje na `?komunikat=<nonce>`. Banner wstaje
 * TYLKO gdy oba zrodla sie zgadzaja:
 *
 *  - podrobienie linku nie dziala, bo obcy adres nie ma pasujacego ciasteczka,
 *    a ciasteczka naszej domeny nie da sie ustawic z cudzej strony. Tresc
 *    bierzemy z ciasteczka przez te sama mape, wiec domkniety zbior dalej
 *    obowiazuje (ciasteczko to tez dane od klienta);
 *  - lepkosc znika, bo `PanelFlash` zdejmuje `?komunikat=` z adresu przez
 *    `history.replaceState` zaraz po wyrenderowaniu. Po F5 parametru juz nie
 *    ma, wiec nie ma i bannera; `nonce` pasowal do dokladnie jednego adresu,
 *    ktorego w historii juz nie ma, a samo ciasteczko wygasa po minucie.
 *
 * `httpOnly` celowo: tresc bannera nie jest potrzebna w JavaScripcie, a
 * `sameSite=lax` wystarcza, bo ciasteczko jedzie z nawigacja po `redirect()`.
 * `secure` NIE jest ustawione swiadomie — CI uruchamia produkcyjny build na
 * `http://localhost`, a ciasteczko `secure` zostaloby tam odrzucone i caly
 * pasek stalby sie nietestowalny. Nie ma w nim sekretu: kod z domknietego
 * zbioru i jednorazowy identyfikator bez zadnego znaczenia poza tym jednym
 * przekierowaniem.
 */
export const FLASH_PARAM = "komunikat";
export const FLASH_COOKIE = "panel_flash";

/** Minuta na przejscie `redirect()` — potem ciasteczko znika samo. */
const FLASH_MAX_AGE_SECONDS = 60;

/** Kształt `crypto.randomUUID()`. Luzniejszy wzorzec przyjmowalby smieci. */
const NONCE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const FLASH_MESSAGES = {
  "szkolenie-zapisane": "Zapisano szkolenie.",
  "trener-zapisany": "Zapisano profil trenera.",
  "kategoria-zapisana": "Zapisano kategorię.",
  "notatka-zapisana": "Zapisano notatkę wewnętrzną.",
} as const;

export type FlashCode = keyof typeof FLASH_MESSAGES;

export type FlashCookie = {
  name: typeof FLASH_COOKIE;
  /** `<kod>.<nonce>` — tresc i jednorazowy bilet w jednym. */
  value: string;
  /** Ten sam `nonce` do adresu przekierowania. */
  nonce: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/panel";
    maxAge: number;
  };
};

/** Ciasteczko biletu dla udanego zapisu; `nonce` jest nowy przy kazdym wywolaniu. */
export function flashCookie(code: FlashCode): FlashCookie {
  const nonce = crypto.randomUUID();
  return {
    name: FLASH_COOKIE,
    value: `${code}.${nonce}`,
    nonce,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/panel",
      maxAge: FLASH_MAX_AGE_SECONDS,
    },
  };
}

/**
 * Tresc bannera — `null`, gdy czegokolwiek brakuje albo cokolwiek sie nie zgadza.
 *
 * Wymaga OBU zrodel: `nonce` z adresu i pary `<kod>.<nonce>` z ciasteczka.
 * Dowolny adres bez ciasteczka (podeslany link, F5 po zdjeciu parametru,
 * zakladka) nie daje bannera.
 */
export function flashMessage(
  param: string | string[] | undefined,
  cookieValue: string | undefined,
): string | null {
  if (typeof param !== "string" || !NONCE_PATTERN.test(param)) return null;
  if (typeof cookieValue !== "string") return null;

  const separator = cookieValue.indexOf(".");
  if (separator <= 0) return null;
  const code = cookieValue.slice(0, separator);
  const nonce = cookieValue.slice(separator + 1);

  if (nonce !== param) return null;
  return Object.prototype.hasOwnProperty.call(FLASH_MESSAGES, code)
    ? FLASH_MESSAGES[code as FlashCode]
    : null;
}

/** Adres przekierowania po udanym zapisie — z biletem, bez tresci. */
export function withFlash(path: string, nonce: string): string {
  return `${path}?${FLASH_PARAM}=${encodeURIComponent(nonce)}`;
}
