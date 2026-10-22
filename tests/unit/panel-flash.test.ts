/**
 * ISK-414 / CR-I8 — pasek potwierdzenia nie da sie podrobic ani przykleic.
 *
 * `lib/panel/flash.ts` mial od ISK-402 wlasny docstring z teza, ze przenoszenie
 * KODU ze zamknietego zbioru (a nie dowolnego tekstu) zamyka wektor
 * socjotechniczny „Zapisano zmiany bez zapisu". Nie zamykalo: znany kod BYL
 * bannerem, wiec `?komunikat=szkolenie-zapisane` podeslany administratorowi
 * renderowal potwierdzenie operacji, ktorej nie bylo. Straznik domknietego
 * zbioru — cala racja bytu `flashMessage` — nie mial przy tym ANI JEDNEGO
 * testu jednostkowego, choc kazdy sasiadujacy modul panelu je ma.
 *
 * CZEGO TE TESTY PILNUJA
 *  1. sam adres NIE wystarcza — kazdy kod z domknietego zbioru podstawiony
 *     recznie w `?komunikat=` daje `null` (to jest dowod z DoD karty);
 *  2. samo ciasteczko tez nie wystarcza — po zdjeciu parametru (F5 po
 *     `history.replaceState`) banner nie wraca, czyli flash jest jednorazowy;
 *  3. domkniety zbior dalej obowiazuje po stronie ciasteczka;
 *  4. bilet z JEDNEGO zapisu nie otwiera bannera dla innego zapisu.
 *
 * Kontrola negatywna: powrot `flashMessage` do jednoargumentowej wersji
 * (tresc z samego adresu) czerwieni tu przypadki 1 i 4, a usuniecie
 * `hasOwnProperty` — przypadek z `__proto__`.
 */
import { describe, expect, it } from "vitest";

import {
  FLASH_COOKIE,
  FLASH_PARAM,
  type FlashCode,
  flashCookie,
  flashMessage,
  withFlash,
} from "@/lib/panel/flash";

/**
 * Zbior kodow jest wypisany TUTAJ, a nie importowany z modulu. Import
 * sprawdzalby tylko, czy mapa jest sama ze soba zgodna; lista wpisana recznie
 * pilnuje takze tego, ze nikt nie dolozy do bannera kodu bez testu.
 */
const codes: Array<[FlashCode, string]> = [
  ["szkolenie-zapisane", "Zapisano szkolenie."],
  ["trener-zapisany", "Zapisano profil trenera."],
  ["kategoria-zapisana", "Zapisano kategorię."],
  ["notatka-zapisana", "Zapisano notatkę wewnętrzną."],
];

const OTHER_NONCE = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";

describe("flashCookie — bilet jednorazowy", () => {
  it("niesie kod i nonce w jednej wartosci, pod nazwa ciasteczka panelu", () => {
    const cookie = flashCookie("szkolenie-zapisane");

    expect(cookie.name).toBe(FLASH_COOKIE);
    expect(cookie.value).toBe(`szkolenie-zapisane.${cookie.nonce}`);
    expect(cookie.nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("kazde wywolanie daje NOWY nonce — bilet nie jest wielokrotnego uzytku", () => {
    const first = flashCookie("szkolenie-zapisane");
    const second = flashCookie("szkolenie-zapisane");

    expect(first.nonce).not.toBe(second.nonce);
    // Bilet z pierwszego zapisu nie otwiera bannera po drugim.
    expect(flashMessage(first.nonce, second.value)).toBeNull();
  });

  /**
   * `httpOnly` — tresc bannera nie jest potrzebna w JavaScripcie.
   * `sameSite=lax` — ciasteczko musi przejsc z nawigacja po `redirect()`.
   * `path=/panel` — nie wyciekamy go na publiczne strony.
   * Brak `secure` jest SWIADOMY i uzasadniony w module (CI mierzy produkcyjny
   * build na `http://localhost`); gdyby ktos go dolozyl, ta asercja ma o tym
   * powiedziec wprost, a nie zostawic zielone testy i martwy banner.
   */
  it("ma atrybuty wymagane do przejscia przez redirect i nic ponad to", () => {
    expect(flashCookie("notatka-zapisana").options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/panel",
      maxAge: 60,
    });
  });
});

describe("withFlash — adres przekierowania", () => {
  it("doklada nonce pod parametrem panelu, bez tresci komunikatu", () => {
    const { nonce } = flashCookie("trener-zapisany");

    const url = withFlash("/panel/trenerzy", nonce);

    expect(url).toBe(`/panel/trenerzy?${FLASH_PARAM}=${nonce}`);
    // W adresie nie ma ani kodu, ani napisu — nie ma czego podstawic.
    expect(url).not.toContain("trener-zapisany");
    expect(url).not.toContain("Zapisano");
  });

  it("ucieka znaki specjalne, wiec nonce nie rozbije adresu", () => {
    expect(withFlash("/panel/szkolenia", "a b&c=d")).toBe(
      "/panel/szkolenia?komunikat=a%20b%26c%3Dd",
    );
  });
});

describe("flashMessage — banner wymaga OBU zrodel", () => {
  it.each(codes)(
    "po udanym zapisie pokazuje komunikat kodu %s",
    (code, text) => {
      const cookie = flashCookie(code);

      expect(flashMessage(cookie.nonce, cookie.value)).toBe(text);
    },
  );

  /**
   * DOWOD Z DoD: recznie spreparowany `?komunikat=` nie renderuje bannera.
   * Atakujacy zna kody (sa w repozytorium), ale nie ma ciasteczka — nie da
   * sie go ustawic linkiem z cudzej strony.
   */
  it.each(codes)("sam adres z kodem %s nie daje bannera", (code) => {
    expect(flashMessage(code, undefined)).toBeNull();
    // Nawet gdyby zgadl format biletu i podstawil go w adresie.
    expect(flashMessage(OTHER_NONCE, undefined)).toBeNull();
    expect(flashMessage(`${code}.${OTHER_NONCE}`, undefined)).toBeNull();
  });

  /**
   * Druga polowa jednorazowosci: `PanelFlash` zdejmuje parametr z adresu, wiec
   * po F5 zostaje samo (jeszcze niewygasle) ciasteczko. Banner nie wraca.
   */
  it("samo ciasteczko bez parametru w adresie nie daje bannera", () => {
    const cookie = flashCookie("szkolenie-zapisane");

    expect(flashMessage(undefined, cookie.value)).toBeNull();
    expect(flashMessage("", cookie.value)).toBeNull();
  });

  it("nonce z innego zapisu nie pasuje", () => {
    const cookie = flashCookie("kategoria-zapisana");

    expect(flashMessage(OTHER_NONCE, cookie.value)).toBeNull();
  });

  /** Straznik domknietego zbioru — teraz po stronie ciasteczka. */
  it("nieznany kod w ciasteczku nie daje bannera, nawet z pasujacym nonce", () => {
    const { nonce } = flashCookie("szkolenie-zapisane");

    expect(flashMessage(nonce, `wszystko-zapisane.${nonce}`)).toBeNull();
    expect(flashMessage(nonce, `Zapisano zmiany.${nonce}`)).toBeNull();
  });

  it("nie przyjmuje kluczy z prototypu Object", () => {
    const { nonce } = flashCookie("szkolenie-zapisane");

    expect(flashMessage(nonce, `__proto__.${nonce}`)).toBeNull();
    expect(flashMessage(nonce, `constructor.${nonce}`)).toBeNull();
    expect(flashMessage(nonce, `toString.${nonce}`)).toBeNull();
  });

  it("odrzuca polamane ciasteczka i parametr powtorzony w adresie", () => {
    const cookie = flashCookie("szkolenie-zapisane");

    // Bez separatora, bez nonce, bez kodu.
    expect(flashMessage(cookie.nonce, "szkolenie-zapisane")).toBeNull();
    expect(flashMessage(cookie.nonce, `.${cookie.nonce}`)).toBeNull();
    expect(flashMessage(cookie.nonce, "")).toBeNull();
    // `?komunikat=a&komunikat=b` dociera do strony jako tablica.
    expect(flashMessage([cookie.nonce], cookie.value)).toBeNull();
  });

  it("nie przyjmuje parametru, ktory nie ma ksztaltu biletu", () => {
    // Prefiks pasujacego nonce ani jego przedluzenie nie moga przejsc.
    const cookie = flashCookie("szkolenie-zapisane");

    expect(flashMessage(cookie.nonce.slice(0, 35), cookie.value)).toBeNull();
    expect(flashMessage(`${cookie.nonce} `, cookie.value)).toBeNull();
    expect(flashMessage(cookie.nonce.toUpperCase(), cookie.value)).toBeNull();
  });
});
