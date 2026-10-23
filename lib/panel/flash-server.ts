import { cookies } from "next/headers";

import { FLASH_COOKIE, FLASH_PARAM, flashMessage } from "./flash";

/**
 * Tresc paska potwierdzenia dla biezacego zadania (ISK-414).
 *
 * Osobny modul od `flash.ts`, bo `flash.ts` ma zostac CZYSTY: jego straznik
 * domknietego zbioru i wiazanie biletu sa testowane jednostkowo w node, bez
 * zakresu zadania Next.js.
 *
 * Bez `import "server-only"` SWIADOMIE, choc modul jest serwerowy: ten pakiet
 * rzuca „cannot be imported from a Client Component" przy kazdym imporcie poza
 * warunkiem `react-server`, wiec w `environment: "node"` wywraca kazdy test,
 * ktory renderuje strone panelu (zmierzone na `tests/unit/trener-inicjaly`).
 * Granice trzyma `next/headers`: w komponencie klienta `cookies()` nie istnieje.
 *
 * NIE SIEGA PO CIASTECZKO BEZ BILETU W ADRESIE
 * Kolejnosc ma znaczenie podwojnie. Po pierwsze bez `?komunikat=` nie ma czego
 * weryfikowac, wiec odczyt ciasteczka bylby praca na nic. Po drugie `cookies()`
 * rzuca „called outside a request scope" i strona panelu przestaje dac sie
 * wyrenderowac w tescie jednostkowym — zmierzone na `tests/unit/trener-inicjaly`
 * (ISK-417), ktory renderuje `/panel/trenerzy` z pustymi `searchParams`.
 * Dynamiczne API wolamy wiec dopiero wtedy, gdy faktycznie jest po co.
 */
export async function readPanelFlash(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  const ticket = searchParams[FLASH_PARAM];
  if (typeof ticket !== "string") return null;
  return flashMessage(ticket, (await cookies()).get(FLASH_COOKIE)?.value);
}
