/**
 * ISK-403 / M4a — POMIAR widokow panelu.
 *
 * Panel jest za logowaniem, wiec kazdy test loguje sie sam (sesja zyje
 * w ciasteczkach kontekstu przegladarki, a konteksty sa per-test).
 *
 * Widoki szczegolowe (`/panel/zgloszenia/[id]`, `/panel/szkolenia/[id]`,
 * `/panel/trenerzy/[id]`) maja adresy zalezne od danych. Ustalamy je ZAPYTANIEM
 * DO BAZY, nie klikaniem w pierwszy link na liscie: `a[href^="/panel/szkolenia/"]`
 * .first() trafia w przycisk „Dodaj szkolenie" (`/panel/szkolenia/nowe`), ktory
 * stoi w DOM wyzej niz wiersze tabeli — poprzednia wersja mierzyla formularz
 * dodawania i nie zauwazyla, ze szczegolu nie zmierzyla wcale.
 */
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { serviceClient } from "./helpers/stack";
import { SZEROKOSCI } from "./helpers/isk403-pomiar";
import { przygotujKatalogi, zmierzWidok } from "./helpers/isk403-zbieracz";

/** Znacznik zgloszenia testowego — po pomiarze usuwamy je ze wspoldzielonego stacku. */
const ZNACZNIK = "ISK403-QA";

/** Listy panelu — adresy stale. */
const LISTY: Array<{
  klucz: string;
  sciezka: string;
  bezLogowania?: boolean;
}> = [
  { klucz: "panel-logowanie", sciezka: "/panel/logowanie", bezLogowania: true },
  { klucz: "panel-pulpit", sciezka: "/panel" },
  { klucz: "panel-szkolenia", sciezka: "/panel/szkolenia" },
  { klucz: "panel-trenerzy", sciezka: "/panel/trenerzy" },
  { klucz: "panel-zgloszenia", sciezka: "/panel/zgloszenia" },
  { klucz: "panel-brak-dostepu", sciezka: "/panel/brak-dostepu" },
];

test.beforeAll(przygotujKatalogi);

for (const widok of LISTY) {
  test(`pomiar panelu: ${widok.klucz} @ 360/768/1440`, async ({ page }) => {
    test.setTimeout(300_000);
    if (!widok.bezLogowania) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await loginAsAdmin(page);
    }
    for (const szerokosc of SZEROKOSCI) {
      await zmierzWidok(page, widok.klucz, widok.sciezka, szerokosc);
    }
  });
}

test("pomiar panelu: szczegoly (zgloszenie, szkolenie, trener) @ 360/768/1440", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const svc = serviceClient();

  // Zgloszenie tworzymy TUTAJ, a nie w `beforeAll`.
  //
  // `beforeAll`/`afterAll` sa per-WORKER, a nie per-plik: przy `--workers=2`
  // testy tego pliku rozkladaja sie na dwa procesy, wiec `afterAll` jednego
  // workera usuwal zgloszenie, kiedy drugi wlasnie go potrzebowal. Objaw byl
  // mylacy — test padal po 60 ms na „zgloszenie testowe musi istniec", co czyta
  // sie jak brak danych w bazie, a byl wyscigiem o porzadki.
  const { data: zgloszenie, error: bladZgloszenia } = await svc
    .from("inquiries")
    .insert({
      kind: "indywidualne",
      full_name: `${ZNACZNIK} Szczegol ${Date.now()}`,
      email: `isk403-szczegol-${Date.now()}@example.invalid`,
      phone: "+48 600 000 403",
      message: `Zgłoszenie testowe ${ZNACZNIK} na potrzeby pomiaru widoku szczegółu.`,
      rodo_ack: true,
      rodo_clause_version: "DRAFT-0-niezatwierdzona",
      source_path: "/kontakt",
    })
    .select("id")
    .single();
  expect(bladZgloszenia, "wstawienie zgloszenia testowego").toBeNull();

  const { data: szkolenie } = await svc
    .from("trainings")
    .select("id")
    .eq("slug", "wprowadzenie-do-ai")
    .single();
  const { data: trener } = await svc
    .from("trainers")
    .select("id")
    .eq("slug", "jan-przykladowy")
    .single();

  // Brak ktoregokolwiek identyfikatora to blad PRZYGOTOWANIA pomiaru, nie
  // defekt produktu — ma zatrzymac test, a nie cicho pominac widok.
  expect(zgloszenie?.id, "zgloszenie testowe musi istniec").toBeTruthy();
  expect(szkolenie?.id, "szkolenie 'wprowadzenie-do-ai' musi istniec").toBeTruthy();
  expect(trener?.id, "trener 'jan-przykladowy' musi istniec").toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsAdmin(page);

  const szczegoly = [
    ["panel-zgloszenie-szczegol", `/panel/zgloszenia/${zgloszenie!.id}`],
    ["panel-szkolenie-edycja", `/panel/szkolenia/${szkolenie!.id}`],
    ["panel-trener-edycja", `/panel/trenerzy/${trener!.id}`],
    ["panel-szkolenie-nowe", "/panel/szkolenia/nowe"],
  ] as const;

  for (const [klucz, sciezka] of szczegoly) {
    for (const szerokosc of SZEROKOSCI) {
      await zmierzWidok(page, klucz, sciezka, szerokosc);
    }
  }

  // Porzadki tutaj, a nie w `afterAll`: stack jest wspoldzielony z innymi
  // przebiegami, a `afterAll` per-worker usuwalby dane cudzego testu.
  await svc.from("inquiries").delete().eq("id", zgloszenie!.id);
});
