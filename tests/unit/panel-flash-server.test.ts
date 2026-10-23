/**
 * ISK-414 — `readPanelFlash` siega po ciasteczko TYLKO z biletem w adresie.
 *
 * Nie jest to mikrooptymalizacja, a warunek renderowalnosci strony panelu
 * poza zakresem zadania Next.js: `cookies()` rzuca wtedy „called outside
 * a request scope". Pierwsza wersja tej karty wolala `cookies()` bezwarunkowo
 * i zepsula `tests/unit/trener-inicjaly.test.ts` (ISK-417), ktory renderuje
 * `/panel/trenerzy` z pustymi `searchParams` — 4 czerwone testy u SASIADA,
 * wykryte dopiero przy rebase na `main`.
 *
 * Kontrola negatywna: przeniesienie `cookies()` przed sprawdzenie biletu
 * czerwieni „bez biletu…" (atrapa rzuca tak samo jak Next poza zadaniem).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flashCookie } from "@/lib/panel/flash";

const cookieCalls = vi.fn();
let store: Map<string, string>;
let outsideRequestScope = false;

vi.mock("next/headers", () => ({
  cookies: () => {
    cookieCalls();
    if (outsideRequestScope) {
      throw new Error("`cookies` was called outside a request scope.");
    }
    return Promise.resolve({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
    });
  },
}));

const { readPanelFlash } = await import("@/lib/panel/flash-server");

beforeEach(() => {
  store = new Map();
  outsideRequestScope = false;
  cookieCalls.mockClear();
});

describe("readPanelFlash", () => {
  it("bez biletu w adresie zwraca null i NIE wola `cookies()`", async () => {
    // Tak renderuje sie strona panelu w tescie jednostkowym: brak zakresu zadania.
    outsideRequestScope = true;

    await expect(readPanelFlash({})).resolves.toBeNull();
    await expect(readPanelFlash({ strona: "2" })).resolves.toBeNull();
    // Parametr powtorzony w adresie dociera jako tablica — tez nie jest biletem.
    await expect(readPanelFlash({ komunikat: ["a", "b"] })).resolves.toBeNull();

    expect(cookieCalls).not.toHaveBeenCalled();
  });

  it("z biletem czyta ciasteczko i zwraca tresc po weryfikacji", async () => {
    const cookie = flashCookie("szkolenie-zapisane");
    store.set(cookie.name, cookie.value);

    await expect(readPanelFlash({ komunikat: cookie.nonce })).resolves.toBe(
      "Zapisano szkolenie.",
    );
    expect(cookieCalls).toHaveBeenCalledTimes(1);
  });

  it("bilet bez pasujacego ciasteczka nie daje bannera (podrobiony link)", async () => {
    await expect(
      readPanelFlash({ komunikat: "szkolenie-zapisane" }),
    ).resolves.toBeNull();

    const cookie = flashCookie("trener-zapisany");
    store.set(cookie.name, cookie.value);
    // Inny bilet niz ten w ciasteczku.
    await expect(
      readPanelFlash({ komunikat: "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d" }),
    ).resolves.toBeNull();
  });
});
