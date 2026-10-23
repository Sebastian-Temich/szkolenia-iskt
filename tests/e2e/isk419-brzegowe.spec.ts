/**
 * ISK-419 / M4a-uzup — POMIAR trzech brakujacych stanow brzegowych.
 *
 * ISK-403 zmierzyla: brak wynikow w katalogu, 404 szkolenia, brak dostepu do
 * panelu. Brakowalo: braku trenerow, pustej sekcji wyroznionych i stanu bledu.
 *
 * DWIE pulapki, ktore ten plik musi omijac — obie daja FALSZYWY wynik, nie
 * czerwony test (ta sama klasa bledu co w `artefakty/isk403/KOREKTA-POMIARU.md`):
 *
 *  1. ISR. `/` i `/trenerzy` maja `export const revalidate = 300`, wiec sam
 *     zapis do bazy nie zmienia strony. Naiwny pomiar zobaczylby pelna liste,
 *     zapisal „stanu pustego nie ma" i PRZESZEDL. Dlatego po przelaczeniu flag
 *     przeladowujemy strone do momentu, w ktorym stan pusty faktycznie jest —
 *     i asercja na nim jest WARUNKIEM pomiaru, a nie dodatkiem.
 *  2. Wspoldzielony stack. Flagi dotykaja WSZYSTKICH wierszy, wiec przywrocenie
 *     stanu idzie w `finally` i obejmuje tylko te id-ki, ktore naprawde byly
 *     wlaczone przed pomiarem (snapshot), a nie „wszystko na true".
 */
import { expect, test } from "@playwright/test";

import { serviceClient, withPg } from "./helpers/stack";
import { SZEROKOSCI } from "./helpers/isk403-pomiar";
import { przygotujKatalogi, zmierzWidok } from "./helpers/isk403-zbieracz";

// KAZDY test w tym pliku zmienia stan GLOBALNY (wszyscy trenerzy, wszystkie
// wyroznione, prawo SELECT roli `anon`), wiec rownolegly przebieg oznaczalby,
// ze jeden test mierzy stan wywolany przez drugi. `fullyParallel` z
// `playwright.config.ts` musi tu zostac wylaczony — i plik nalezy uruchamiac
// z `--workers=1`, osobno od pozostalych specow.
test.describe.configure({ mode: "serial" });

test.beforeAll(przygotujKatalogi);

/**
 * Przeladowuje `sciezka`, dopoki nie pojawi sie `oczekiwanyTekst`.
 *
 * Powod: wpis ISR moze byc jeszcze wazny albo odswiezany w tle, wiec pierwsze
 * zadanie po zmianie danych bywa obsluzone ze starej kopii. `page.reload` z
 * `cache: "reload"` nie przebija cache SERWERA, wiec po prostu ponawiamy.
 *
 * Limit prob MUSI przekraczac 300 s, czyli `revalidate` tych tras — i jest to
 * wniosek z POMIARU, nie ostroznosc (ISK-419). Przy 12 probach (~20 s) pomiar
 * wychodzil losowo: udawal sie, gdy wpis ISR byl juz przedawniony (zbudowany
 * dzien wczesniej), a padal zaraz po tym, jak poprzedni przebieg odswiezyl go
 * na nowo. Zmiana danych NIE uniewaznia cache — robi to tylko zapis z panelu
 * (`invalidatePublicCatalog`), wiec bez niego zostaje przeczekanie okna.
 */
async function czekajNaStan(
  page: import("@playwright/test").Page,
  sciezka: string,
  oczekiwanyTekst: string | RegExp,
  proby = 400,
): Promise<void> {
  for (let i = 0; i < proby; i += 1) {
    await page.goto(sciezka, { waitUntil: "networkidle" });
    if (await page.getByText(oczekiwanyTekst).count()) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error(
    `Po ${proby} probach ${sciezka} nadal nie pokazuje „${oczekiwanyTekst}". ` +
      `Jesli dane sa przelaczone, to znaczy, ze stan pusty jest niedostepny ` +
      `przez ISR (revalidate=300) — i to jest wynik pomiaru, nie blad testu.`,
  );
}

/**
 * Wariant czekajacy na SELEKTOR, nie na tekst.
 *
 * Potrzebny do potwierdzenia stanu PELNEGO na „/": naglowek sekcji
 * („Najczęściej wybierane", `home-sections.tsx:250`) renderuje sie TAKZE
 * w stanie pustym, wiec asercja tekstowa na nim byla pusta — przechodzilaby
 * natychmiast, rowniez wtedy, gdy sekcja nadal jest pusta. Rozroznia je
 * dopiero obecnosc samej siatki kart.
 */
async function czekajNaSelektor(
  page: import("@playwright/test").Page,
  sciezka: string,
  selektor: string,
  proby = 400,
): Promise<void> {
  for (let i = 0; i < proby; i += 1) {
    await page.goto(sciezka, { waitUntil: "networkidle" });
    if (await page.locator(selektor).count()) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error(
    `Po ${proby} probach ${sciezka} nadal nie ma elementu „${selektor}".`,
  );
}

test("stan brzegowy: brak opublikowanych trenerow @ 360/768/1440", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const svc = serviceClient();

  const { data: wlaczeni, error: bladOdczytu } = await svc
    .from("trainers")
    .select("id")
    .eq("is_published", true);
  // Odczyt snapshotu MUSI sie udac PRZED jakimkolwiek zapisem — inaczej nie
  // mielibysmy czego przywrocic.
  expect(bladOdczytu, "snapshot opublikowanych trenerow").toBeNull();
  const idki = (wlaczeni ?? []).map((r) => r.id as string);
  expect(idki.length, "zasiew demo musi miec trenerow").toBeGreaterThan(0);

  try {
    const { error } = await svc
      .from("trainers")
      .update({ is_published: false })
      .in("id", idki);
    expect(error, "wycofanie trenerow z publikacji").toBeNull();

    await czekajNaStan(
      page,
      "/trenerzy",
      "Lista trenerów jest w przygotowaniu",
    );
    for (const szerokosc of SZEROKOSCI) {
      await zmierzWidok(page, "trenerzy-brak", "/trenerzy", szerokosc);
    }
  } finally {
    await svc.from("trainers").update({ is_published: true }).in("id", idki);
  }

  // Falsyfikacja porzadkow: po przywroceniu lista znow ma trenerow. Bez tego
  // zepsute `finally` zostawiloby produkt bez trenerow dla innych przebiegow.
  const { data: po } = await svc
    .from("trainers")
    .select("id")
    .eq("is_published", true);
  expect((po ?? []).length, "trenerzy przywroceni").toBe(idki.length);

  // Przywrocenie DANYCH nie wystarcza — i to zmierzylem (ISK-419).
  // Wpis ISR trzymal nadal wersje PUSTA, wiec `isk403-regresja.spec.ts`
  // („lista trenerow pokazuje tylko opublikowanych") padal w NASTEPNYM
  // przebiegu, mimo poprawnych danych. Cache `next start` lezy na dysku
  // (`.next/cache`), wiec przezywa restart serwera i wycieka miedzy
  // przebiegami. Wymuszamy wiec odswiezenie wpisu, zanim test sie skonczy.
  await czekajNaStan(page, "/trenerzy", /Jan|Anna/);
});

test("stan brzegowy: pusta sekcja wyroznionych @ 360/768/1440", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const svc = serviceClient();

  const { data: wyroznione, error: bladOdczytu } = await svc
    .from("trainings")
    .select("id")
    .eq("is_featured", true);
  expect(bladOdczytu, "snapshot wyroznionych szkolen").toBeNull();
  const idki = (wyroznione ?? []).map((r) => r.id as string);
  expect(
    idki.length,
    "zasiew demo musi miec wyroznione szkolenia",
  ).toBeGreaterThan(0);

  try {
    const { error } = await svc
      .from("trainings")
      .update({ is_featured: false })
      .in("id", idki);
    expect(error, "odznaczenie wyroznionych").toBeNull();

    await czekajNaStan(page, "/", "Nie mamy teraz wyróżnionych szkoleń");
    for (const szerokosc of SZEROKOSCI) {
      await zmierzWidok(page, "landing-bez-wyroznionych", "/", szerokosc);
    }
  } finally {
    await svc.from("trainings").update({ is_featured: true }).in("id", idki);
  }

  const { data: po } = await svc
    .from("trainings")
    .select("id")
    .eq("is_featured", true);
  expect((po ?? []).length, "wyroznione przywrocone").toBe(idki.length);

  // Jak wyzej: wymuszamy odswiezenie wpisu ISR dla „/", zeby pusta sekcja
  // wyroznionych nie wyciekla do kolejnych przebiegow. Czekamy na SIATKE kart,
  // nie na naglowek sekcji — naglowek jest w obu stanach (patrz
  // `czekajNaSelektor`).
  await czekajNaSelektor(page, "/", ".home-featured-grid");
});

test("stan brzegowy: granica bledu aplikacji @ 360/768/1440", async ({
  page,
}) => {
  test.setTimeout(1_200_000);

  // `app/error.tsx` to KLIENCKA granica bledu — nie ma do niej trasy ani
  // przelacznika. Sonda (ISK-419) pokazala, ze niepoprawny UUID w trasach
  // panelu daje uczciwe 404 („Nie znaleźliśmy tej strony"), a NIE granice
  // bledu, wiec tamta sciezka nie nadaje sie do pomiaru.
  //
  // Wywolujemy ja wiec przez prawdziwa awarie odczytu: `getCatalog()`
  // (`lib/public-catalog.ts:166`) rzuca na bledzie zapytania, a `/szkolenia`
  // czyta `searchParams`, wiec renderuje sie na ZADANIE (ISR jej nie zasloni).
  // Odebranie `anon` prawa SELECT jest zmiana RUNTIME i w pelni odwracalna —
  // nie wymaga przebudowy, bo `NEXT_PUBLIC_SUPABASE_URL` jest wkompilowane
  // w bundel (`lib/env.ts:114`) i podmiana adresu w env nic by nie dala.
  let odebrane = false;
  try {
    await withPg(async (c) => {
      await c.query("revoke select on public.trainings from anon");
    });
    odebrane = true;

    await czekajNaStan(
      page,
      `/szkolenia?q=isk419-${Date.now()}`,
      "Nie udało się wczytać strony",
    );
    // Granica musi dawac wyjscie, nie tylko komunikat.
    await expect(
      page.getByRole("button", { name: /Spróbuj ponownie/ }),
    ).toBeVisible();

    for (const szerokosc of SZEROKOSCI) {
      await zmierzWidok(
        page,
        "stan-bledu",
        `/szkolenia?q=isk419-${Date.now()}`,
        szerokosc,
      );
    }
  } finally {
    if (odebrane) {
      await withPg(async (c) => {
        await c.query("grant select on public.trainings to anon");
      });
    }
  }

  // Falsyfikacja porzadkow: katalog znow sie czyta. To jest asercja o STANIE
  // WSPOLDZIELONEGO STACKU — bez niej nieudane `finally` zostawiloby
  // niedzialajacy katalog kolejnym przebiegom.
  await czekajNaStan(
    page,
    `/szkolenia?q=isk419-po-${Date.now()}`,
    /Szkolenia/i,
  );
  const { data, error } = await serviceClient()
    .from("trainings")
    .select("id")
    .limit(1);
  expect(error, "katalog czytelny po przywroceniu").toBeNull();
  expect((data ?? []).length).toBeGreaterThan(0);
});
