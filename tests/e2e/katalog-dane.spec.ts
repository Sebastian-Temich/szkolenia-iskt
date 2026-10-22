/**
 * ISK-401 / M2 — trzy kolumny, ktore BYLY w bazie, a nie dochodzily do widoku.
 *
 * DLACZEGO TO WYMAGA WLASNEJ BRAMKI
 * `trainings.price_net_pln`, `categories.icon` i `training_trainers.sort_order`
 * istnieja od migracji E2 i sa wypelnione w zasiewie. Do M2 nie czytal ich ani
 * jeden widok: cena nie byla nawet w typie `Training`, sekcja "Obszary"
 * rysowala numer porzadkowy, a karta "Prowadzacy" ustawiala ludzi w kolejnosci,
 * ktora nie jest czescia kontraktu PostgREST. Zaden test tego nie zauwazyl,
 * bo testy jednostkowe sprawdzaja FUNKCJE MAPUJACE (`formatPriceNet`,
 * `categoryIconName`), a te sa poprawne — pusta zostaje LISTA KOLUMN
 * w zapytaniu. To jest dokladnie klasa defektu "zielona bramka, martwa dana"
 * i mierzy sie ja tylko tak: wartosc z bazy obok wartosci z ekranu.
 *
 * ISK-399 / D1 (decyzja zatwierdzona): cena w UI to WYLACZNIE `price_net_pln`.
 * Wzorzec liczy `pelna x 0.2` i reklamuje "dofinansowanie nawet do 80%" —
 * jedno i drugie jest tu zabronione, wiec jedno i drugie ma wlasny negatyw.
 */
import { expect, test, type Page } from "@playwright/test";

import { createTraining, deleteTraining } from "./helpers/data";
import { serviceClient } from "./helpers/stack";

/** Szkolenie z zasiewu [DEMO], na ktorym mierzymy cene. */
const SLUG = "wprowadzenie-do-ai";

/**
 * Usuwa WSZYSTKIE odmiany spacji — `\s` w JS obejmuje U+00A0 i U+202F.
 * `Intl` dla `pl-PL` grupuje tysiace waska spacja nierozdzielajaca (U+202F
 * w nowszym ICU, U+00A0 w starszym) i taka sama spacja stoi przed "zl".
 * Porownanie napisow bez tej normalizacji zalezaloby od wersji ICU
 * w przegladarce, czyli bramka padalaby po aktualizacji Chromium — i czytaloby
 * sie to jak defekt cennika.
 */
function bezSpacji(text: string): string {
  return text.replace(/\s/g, "");
}

async function cenaZBazy(slug: string): Promise<number> {
  const { data, error } = await serviceClient()
    .from("trainings")
    .select("price_net_pln")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  const kwota = Number(data.price_net_pln);
  expect(Number.isFinite(kwota), `brak ceny w bazie dla ${slug}`).toBe(true);
  return kwota;
}

/** Cala widoczna tresc strony — do asercji negatywnych. */
async function trescStrony(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

test.describe("price_net_pln dochodzi do widoku i nie jest przeliczane", () => {
  test("katalog i szczegol pokazuja DOKLADNIE kwote z bazy, po polsku", async ({
    page,
  }) => {
    const kwota = await cenaZBazy(SLUG);
    // Dokumentuje zasiew (`supabase/seed.sql`): 1990.00 PLN netto. Gdyby zasiew
    // sie zmienil, ta linia pokaze to wprost, zamiast dac mylacy blad nizej.
    expect(kwota).toBe(1990);
    const oczekiwana = bezSpacji(`${kwota} zł`);

    await page.goto("/szkolenia");
    const karta = page.locator(`a.training-card[href="/szkolenia/${SLUG}"]`);
    await expect(karta).toBeVisible();

    const cenaKarty = await karta.locator(".training-card-price").innerText();
    expect(bezSpacji(cenaKarty)).toContain(oczekiwana);
    // "netto" MUSI stac przy kwocie: cena netto podana bez tego zastrzezenia
    // jest wprowadzaniem w blad, a nie skrotem.
    expect(cenaKarty).toMatch(/netto/i);
    // Grupowanie tysiecy zwykla spacja (tak robi wzorzec) pozwala zlamac cene
    // w pol przy waskiej kolumnie — `Intl` daje spacje nierozdzielajaca.
    expect(cenaKarty).not.toMatch(/\d \d/);

    await page.goto(`/szkolenia/${SLUG}`);
    const cenaPanelu = await page.locator(".detail-price-value").innerText();
    expect(bezSpacji(cenaPanelu)).toBe(oczekiwana);
    // Ta sama kwota stoi tez w tabelce faktow — dwa miejsca, jedno zrodlo.
    const faktCeny = page
      .locator(".detail-fact")
      .filter({ hasText: "Cena netto" })
      .locator(".detail-fact-value");
    expect(bezSpacji(await faktCeny.innerText())).toBe(oczekiwana);
  });

  test("nigdzie nie ma ceny po mnozniku 0,2 ani progu „do 80%”", async ({
    page,
  }) => {
    const { data, error } = await serviceClient()
      .from("trainings")
      .select("price_net_pln")
      .eq("is_published", true);
    if (error) throw error;
    const zakazane = (data as Array<{ price_net_pln: number | string }>)
      .map((row) => Number(row.price_net_pln))
      .filter((kwota) => Number.isFinite(kwota) && kwota > 0)
      // `Math.round` jest konieczne, nie kosmetyczne: `1990 * 0.2` daje
      // w IEEE-754 `398.00000000000006`, a napisu z takim ogonem nie ma na
      // zadnej stronie — negatyw bylby zielony zawsze i nie mierzylby niczego.
      .map((kwota) => bezSpacji(`${Math.round(kwota * 0.2)} zł`));
    expect(zakazane.length).toBeGreaterThan(0);

    for (const path of ["/", "/szkolenia", `/szkolenia/${SLUG}`]) {
      await page.goto(path);
      const tresc = await trescStrony(page);
      const scisniete = bezSpacji(tresc);

      // Cena "z dofinansowaniem" we wzorcu to `pelna x 0.2` — czyli 398 zl przy
      // katalogowych 1990 zl. To nie jest dana, to regula marketingowa
      // prototypu; D1 zabrania jej pokazywac.
      for (const kwota of zakazane) {
        expect(
          scisniete,
          `${path}: cena po mnozniku 0,2 (${kwota})`,
        ).not.toContain(kwota);
      }
      // Prog procentowy dofinansowania — zabroniony bez wzgledu na formatowanie.
      expect(tresc, `${path}: prog procentowy dofinansowania`).not.toMatch(
        /80\s*%/,
      );
      expect(tresc, `${path}: obietnica „do 80”`).not.toMatch(/do\s+80\b/i);
    }
  });
});

test("categories.icon steruje ikona obszaru — nie wszystkie chipy sa takie same", async ({
  page,
}) => {
  const { data, error } = await serviceClient()
    .from("categories")
    .select("slug,icon")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw error;
  const kategorie = data as Array<{ slug: string; icon: string | null }>;

  // Pomiar ma sens tylko wtedy, gdy kolumna w bazie jest ZROZNICOWANA. Zasiew
  // ma piec kategorii i piec roznych nazw ikon (`cpu`, `leaf`, `languages`,
  // `code`, `flask`).
  expect(kategorie.length).toBeGreaterThan(1);
  expect(new Set(kategorie.map((k) => k.icon)).size).toBeGreaterThan(1);

  await page.goto("/");
  const ksztalty = await page
    .locator("#obszary a.home-area .ui-iconchip svg")
    .evaluateAll((nodes) => nodes.map((node) => node.innerHTML));

  // Kazda karta obszaru ma ikone — chip bez `svg` oznacza, ze sekcja wrocila do
  // rysowania numeru porzadkowego.
  expect(ksztalty.length).toBe(kategorie.length);

  // SEDNO: rozne wartosci w kolumnie musza dac ROZNE ksztalty. Gdyby zapytanie
  // nie pobieralo kolumny `icon` (albo embed kategorii ja pomijal),
  // `categoryIconName(undefined)` oddalby dla wszystkich ikone zastepcza
  // `layers` — pieć identycznych chipow, widok "dziala", a kolumna dalej jest
  // martwa. Test jednostkowy mapowania tego nie wykryje: mapowanie jest dobre,
  // puste jest wejscie.
  expect(
    new Set(ksztalty).size,
    "wszystkie obszary renderuja TEN SAM ksztalt ikony — `categories.icon` nie dociera do widoku (sprawdz liste kolumn w `getCategories()`)",
  ).toBeGreaterThan(1);
});

test.describe("training_trainers.sort_order ustala kolejnosc prowadzacych", () => {
  let szkolenieA: Awaited<ReturnType<typeof createTraining>>;
  let szkolenieB: Awaited<ReturnType<typeof createTraining>>;
  let pierwszy: { id: string; full_name: string };
  let drugi: { id: string; full_name: string };

  test.beforeAll(async () => {
    const svc = serviceClient();
    const { data, error } = await svc
      .from("trainers")
      .select("id,full_name,slug")
      .in("slug", ["jan-przykladowy", "anna-testowa"]);
    if (error) throw error;
    const trenerzy = data as Array<{
      id: string;
      full_name: string;
      slug: string;
    }>;
    const jan = trenerzy.find((t) => t.slug === "jan-przykladowy");
    const anna = trenerzy.find((t) => t.slug === "anna-testowa");
    expect(jan, "brak trenera jan-przykladowy w zasiewie").toBeDefined();
    expect(anna, "brak trenerki anna-testowa w zasiewie").toBeDefined();
    // Kolejnosc z `sort_order` jest CELOWO odwrotna do alfabetycznej: Anna
    // stoi w alfabecie przed Janem. Dzieki temu asercja rozroznia "czytamy
    // `sort_order`" od "trafilismy w kolejnosc alfabetyczna przez przypadek".
    pierwszy = { id: jan!.id, full_name: jan!.full_name };
    drugi = { id: anna!.id, full_name: anna!.full_name };

    szkolenieA = await createTraining({
      published: true,
      titlePrefix: "[TEST] Kolejnosc prowadzacych A",
    });
    szkolenieB = await createTraining({
      published: true,
      titlePrefix: "[TEST] Kolejnosc prowadzacych B",
    });

    // Te same dwa powiazania, wstawione w PRZECIWNEJ kolejnosci wierszy. Gdyby
    // widok pokazywal kolejnosc zwracania wierszy przez PostgREST (a nie
    // `sort_order`), te dwa szkolenia renderowalyby sie roznie — i wlasnie to
    // odroznia prawdziwe sortowanie od przypadku, ktorego dwa wejscia na ten
    // sam adres nigdy nie zlapia.
    const wstaw = async (trainingId: string, kolejnosc: string[]) => {
      for (const trainerId of kolejnosc) {
        const { error: linkError } = await svc
          .from("training_trainers")
          .insert({
            training_id: trainingId,
            trainer_id: trainerId,
            sort_order: trainerId === pierwszy.id ? 10 : 20,
          });
        if (linkError) throw linkError;
      }
    };
    await wstaw(szkolenieA.id, [pierwszy.id, drugi.id]);
    await wstaw(szkolenieB.id, [drugi.id, pierwszy.id]);
  });

  test.afterAll(async () => {
    const svc = serviceClient();
    for (const szkolenie of [szkolenieA, szkolenieB]) {
      if (!szkolenie?.id) continue;
      await svc
        .from("training_trainers")
        .delete()
        .eq("training_id", szkolenie.id);
      await deleteTraining(szkolenie.id);
    }
  });

  test("kolejnosc idzie z kolumny, nie z alfabetu ani z kolejnosci wierszy", async ({
    page,
  }) => {
    const nazwiska = async (slug: string) => {
      await page.goto(`/szkolenia/${slug}`);
      await expect(page.locator(".detail-leads-list")).toBeVisible();
      return page.locator(".detail-lead-name").allInnerTexts();
    };

    const oczekiwana = [pierwszy.full_name, drugi.full_name];
    // Kontrola zalozenia: `sort_order` NIE zgadza sie z alfabetem, wiec zgodnosc
    // z `oczekiwana` nie moze byc zbiegiem okolicznosci.
    expect(oczekiwana).not.toEqual(
      [...oczekiwana].sort((a, b) => a.localeCompare(b, "pl")),
    );

    expect(await nazwiska(szkolenieA.slug)).toEqual(oczekiwana);
    expect(await nazwiska(szkolenieB.slug)).toEqual(oczekiwana);
  });

  test("dwa wejscia na ten sam adres daja te sama kolejnosc", async ({
    page,
  }) => {
    // Wymog z karty wprost. Sam w sobie jest SLABSZY niz test wyzej: trasa ma
    // `revalidate = 300`, wiec drugie wejscie moze przyjsc z cache ISR i nie
    // powtorzyc zapytania. Zostaje jako kontrola spojnosci (gdyby kolejnosc
    // ustalal kod klienta, roznica wyszlaby tutaj), a dowodem czytania kolumny
    // jest test poprzedni.
    await page.goto(`/szkolenia/${szkolenieA.slug}`);
    const pierwszeWejscie = await page
      .locator(".detail-lead-name")
      .allInnerTexts();
    expect(pierwszeWejscie.length).toBe(2);

    await page.goto("/szkolenia");
    await page.goto(`/szkolenia/${szkolenieA.slug}`);
    expect(await page.locator(".detail-lead-name").allInnerTexts()).toEqual(
      pierwszeWejscie,
    );
  });
});
