/**
 * ISK-403 / M4a — POMIAR widokow publicznych (nie bramka).
 *
 * Zbiera komplet zrzutow 360/768/1440 i wszystkie metryki a11y/layoutu.
 * Progi i ocena istotnosci naleza do raportu QA, nie do tego pliku: test, ktory
 * `expect`-uje kazda metryke, przerywa przebieg na pierwszym widoku i nie daje
 * kompletu zrzutow — a komplet jest wprost kryterium odbioru karty.
 */
import { test } from "@playwright/test";

import { SZEROKOSCI } from "./helpers/isk403-pomiar";
import { przygotujKatalogi, zmierzWidok } from "./helpers/isk403-zbieracz";

/** Widoki publiczne wraz ze stanami brzegowymi. */
const WIDOKI = [
  { klucz: "landing", sciezka: "/" },
  { klucz: "katalog", sciezka: "/szkolenia" },
  { klucz: "kurs", sciezka: "/szkolenia/wprowadzenie-do-ai" },
  { klucz: "trenerzy", sciezka: "/trenerzy" },
  { klucz: "kontakt", sciezka: "/kontakt" },
  { klucz: "polityka", sciezka: "/polityka-prywatnosci" },
  // Stany brzegowe (zakres pkt 5 karty).
  { klucz: "katalog-brak-wynikow", sciezka: "/szkolenia?q=niczegotakiegoniema" },
  { klucz: "katalog-filtr-obszar", sciezka: "/szkolenia?category=esg" },
  { klucz: "kurs-404", sciezka: "/szkolenia/nie-ma-takiego-szkolenia" },
] as const;

test.beforeAll(przygotujKatalogi);

for (const widok of WIDOKI) {
  // Osobny test na widok: padniecie jednego nie zabiera zrzutow pozostalym.
  test(`pomiar publiczny: ${widok.klucz} @ 360/768/1440`, async ({ page }) => {
    test.setTimeout(300_000);
    for (const szerokosc of SZEROKOSCI) {
      await zmierzWidok(page, widok.klucz, widok.sciezka, szerokosc);
    }
  });
}
