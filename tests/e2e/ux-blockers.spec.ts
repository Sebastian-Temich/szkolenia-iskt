/**
 * ISK-364 — blokery bramki UX (ISK-349), ktore nie zostaly zamkniete przez
 * ISK-355 ani ISK-359.
 *
 * Kazdy test MIERZY, a nie oglada: `getComputedStyle` dla typografii i kroju,
 * `getBoundingClientRect` dla celow dotykowych, `scrollWidth`/`clientWidth`
 * dla przewijania, wiersz w bazie dla P4 i B6. Bramka UX i QA zlapaly juz dwa
 * defekty, ktore przechodzily przy zielonym zestawie — asercja na samym
 * "element jest widoczny" tutaj nie wystarcza.
 */
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import {
  clearThrottle,
  createInquiry,
  createTraining,
  deleteTraining,
  sfx,
} from "./helpers/data";
import { awaitFormTokenMaturity } from "./helpers/form";
import {
  backgroundAlpha,
  contrastSamples,
  formatSample,
} from "./helpers/kontrast";
import { serviceClient } from "./helpers/stack";

/** Minimum z WCAG 2.1 AA, kryterium 2.5.5 (Target Size). */
const MIN_TOUCH_PX = 44;
/** Najwezszy ekran z zakresu zlecenia — tu bramka UX robila pomiary. */
const NARROW = { width: 360, height: 720 };

type TypeMetrics = {
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
};

async function typeMetrics(page: Page, selector: string): Promise<TypeMetrics> {
  return page.$eval(selector, (element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number.parseInt(style.fontWeight, 10),
      fontFamily: style.fontFamily,
    };
  });
}

test.describe("B2 — naglowki maja hierarchie, nie 16px/400", () => {
  // Bramka UX zmierzyla 16px/400 na kazdym widoku poza szczegolem szkolenia:
  // preflight Tailwinda v4 zeruje `font-size`/`font-weight`, a jedyna regula
  // bazowa ustawiala sam `margin-top`.
  const publicViews = [
    { path: "/", label: "strona glowna" },
    { path: "/szkolenia", label: "katalog" },
    { path: "/trenerzy", label: "trenerzy" },
    { path: "/kontakt", label: "kontakt" },
  ];

  for (const view of publicViews) {
    test(`${view.label}: h1 jest wyrazniejszy od tekstu akapitowego`, async ({
      page,
    }) => {
      await page.goto(view.path);
      const h1 = await typeMetrics(page, "h1");

      // 16px/400 to dokladnie stan przed poprawka — ta asercja jest kontrola.
      expect(h1.fontSize).toBeGreaterThanOrEqual(24);
      expect(h1.fontWeight).toBeGreaterThanOrEqual(600);

      const body = await typeMetrics(page, "body");
      expect(h1.fontSize).toBeGreaterThan(body.fontSize);
    });
  }

  test("kontakt: h1 jest wyrazniejszy od eyebrow/legendy nad soba", async ({
    page,
  }) => {
    await page.goto("/kontakt");
    const h1 = await typeMetrics(page, "h1");
    const legend = await typeMetrics(page, "form legend");
    // Defekt z raportu: tytul strony byl mniej wyrazisty niz drobny tekst
    // ponad nim. Porownujemy rozmiar, nie wyglad.
    expect(h1.fontSize).toBeGreaterThan(legend.fontSize);
  });

  test("panel: h1 i h2 maja rozny rozmiar — hierarchia istnieje", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/panel/szkolenia");

    const h1 = await typeMetrics(page, "h1");
    const h2 = await typeMetrics(page, "h2");
    const eyebrow = await typeMetrics(page, ".panel-eyebrow");

    expect(h1.fontSize).toBeGreaterThanOrEqual(24);
    expect(h1.fontWeight).toBeGreaterThanOrEqual(600);
    expect(h1.fontSize).toBeGreaterThan(h2.fontSize);
    expect(h2.fontSize).toBeGreaterThan(eyebrow.fontSize);
  });
});

test.describe("B3 — przyciski panelu maja czytelny kontrast, nie tylko nazwe", () => {
  // Defekt: `.panel-button` wewnatrz `.panel-actions` tracil wlasne tlo przez
  // regule `.panel-actions button` (0,1,1 wobec 0,1,0), a `color: white
  // !important` zostawial bialy tekst. Na szczegole zgloszenia dawalo to
  // 1,03:1 — przycisk "Ustaw: W toku" dzialal, ale byl niewidoczny.
  //
  // Ustalenie przezylo ISK-359 i ISK-364 wlasnie dlatego, ze testy sprawdzaly
  // ISTNIENIE przycisku (`getByRole`), a nie jego WIDOCZNOSC. Tutaj mierzymy
  // kontrast wobec tla efektywnego i porownujemy z progiem WCAG 1.4.3.

  /** Widoki panelu, na ktorych `.panel-button` wystepuje bez danych z seeda. */
  const buttonViews = [
    ["szkolenia", "/panel/szkolenia"],
    ["trenerzy", "/panel/trenerzy"],
  ] as const;

  test("szczegol zgloszenia: przycisk zmiany statusu jest czytelny", async ({
    page,
  }) => {
    const inquiry = await createInquiry();
    try {
      await loginAsAdmin(page);
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);

      // Sciezka D5.8 (ADR-0005 D5): zgloszenie "nowe" musi dac sie przestawic
      // na "w toku", wiec przycisk przejscia MUSI tu byc. Bez tej asercji
      // pomiar ponizej przechodzilby na pustym zbiorze.
      const button = page.getByRole("button", { name: "Ustaw: W toku" });
      await expect(button).toBeVisible();

      const samples = await contrastSamples(
        page,
        ".panel-actions .panel-button",
      );
      expect(
        samples.length,
        "nie zmierzylem zadnego `.panel-button` w `.panel-actions` — selektor albo markup sie rozjechal",
      ).toBeGreaterThan(0);

      for (const sample of samples) {
        expect(sample.ratio, formatSample(sample)).toBeGreaterThanOrEqual(
          sample.required,
        );
      }

      // Druga, niezalezna asercja na sam mechanizm defektu: przycisk pelny ma
      // miec WLASNE tlo. Gdyby kolejna regula znow zdjela `background`, a
      // kolor tekstu przypadkiem wyszedl czytelny, pomiar wyzej moglby
      // przejsc — ta asercja nie.
      const alpha = await backgroundAlpha(page, ".panel-actions .panel-button");
      expect(
        alpha,
        "`.panel-button` nie ma wlasnego tla — wrocila kolizja z `.panel-actions button`",
      ).toBeGreaterThan(0.99);

      // Przycisk nadal dziala — poprawka dotyczy wygladu, nie zachowania.
      await button.click();
      await expect(page.locator(".panel-status")).toHaveText("W toku");
      // ISK-374 / BL-B: mapa przejsc ma teraz `nowe: [w_toku, zamkniete]`, wiec
      // "Ustaw: Zamkniete" jest widoczne JUZ PRZED klikniecieciem — asercja na
      // jego widocznosc po przejsciu przestalaby cokolwiek dowodzic. Dowodem,
      // ze maszyna stanow faktycznie ruszyla, jest ZNIKNIECIE przejscia do
      // "w toku" (`w_toku: [zamkniete]`), a nie pojawienie sie tego drugiego.
      await expect(button).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Ustaw: Zamknięte" }),
      ).toBeVisible();
    } finally {
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });

  for (const [name, path] of buttonViews) {
    test(`${name}: kazdy przycisk i akcja w tabeli przechodzi prog 1.4.3`, async ({
      page,
    }) => {
      await loginAsAdmin(page);
      await page.goto(path);
      await expect(page.locator(".panel-button").first()).toBeVisible();

      // Oba warianty naraz: przycisk pelny (`.panel-button`) i akcja-tekst
      // (`.panel-actions a`, `.panel-chip button`). DoD pkt 4 — ta sama
      // kolizja nie moze dotykac pozostalych wystapien.
      const samples = await contrastSamples(
        page,
        ".panel-button, .panel-link-button, .panel-actions a, .panel-actions button, .panel-chip a, .panel-chip button",
      );
      expect(samples.length).toBeGreaterThan(0);

      const failing = samples.filter(
        (sample) => sample.ratio < sample.required,
      );
      expect(failing.map(formatSample)).toEqual([]);
    });
  }
});

test.describe("P1 — kroj Inter jest faktycznie wczytany", () => {
  test("rodzina z next/font jest pierwsza w stosie i plik jest zaladowany", async ({
    page,
  }) => {
    await page.goto("/");

    const body = await typeMetrics(page, "body");
    // Przed poprawka `--font-sans` zaczynalo sie od golego `Inter`, ktorego
    // nikt nie wczytywal — strona leciala krojem systemowym. Teraz pierwsza
    // pozycja stosu to rodzina wygenerowana przez `next/font/local`.
    const firstFamily = body.fontFamily
      .split(",")[0]!
      .trim()
      .replace(/^['"]|['"]$/g, "");
    expect(firstFamily).toBe("interVariable");

    // Deklaracja nie wystarcza — face musi byc w `document.fonts` ze statusem
    // `loaded`, czyli plik faktycznie zostal pobrany i sparsowany.
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts).map((face) => ({
        family: face.family,
        weight: face.weight,
        status: face.status,
      }));
    });
    const loaded = faces.find(
      (face) => face.family === "interVariable" && face.status === "loaded",
    );
    expect(loaded, `faces: ${JSON.stringify(faces)}`).toBeDefined();
    // Wariant zmienny — jedno zadanie pokrywa cala skale wag z `@theme`.
    expect(loaded!.weight).toBe("100 900");
  });

  test("tekst renderuje sie wczytanym krojem, nie systemowym zastepnikiem", async ({
    page,
  }) => {
    await page.goto("/");

    const measured = await page.evaluate(async () => {
      await document.fonts.ready;
      const family = getComputedStyle(document.body).fontFamily;
      const first = family
        .split(",")[0]!
        .trim()
        .replace(/^['"]|['"]$/g, "");

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      // Polskie znaki diakrytyczne — jesli plik ich nie zawiera, przegladarka
      // podmienia kroj per glif i szerokosc zrowna sie z systemowym.
      const sample = "Ćwiczenia: zażółć gęślą jaźń — ĄĆĘŁŃÓŚŹŻ";

      ctx.font = `400 32px "${first}"`;
      const withFont = ctx.measureText(sample).width;
      ctx.font = "400 32px monospace";
      const withMono = ctx.measureText(sample).width;

      return {
        first,
        withFont,
        withMono,
        available: document.fonts.check(`32px "${first}"`),
      };
    });

    expect(measured.available).toBe(true);
    expect(measured.withFont).toBeGreaterThan(0);
    // Gdyby kroj nie byl wczytany, pomiar spadlby na kroj zastepczy — tu
    // dowodzimy, ze wybrana rodzina ma wlasne metryki.
    expect(measured.withFont).not.toBeCloseTo(measured.withMono, 0);
  });

  test("kroj obsluguje polskie diakrytyki — glify nie spadaja na zastepnik", async ({
    page,
  }) => {
    await page.goto("/");
    const widths = await page.evaluate(async () => {
      await document.fonts.ready;
      const family = getComputedStyle(document.body).fontFamily;
      const first = family
        .split(",")[0]!
        .trim()
        .replace(/^['"]|['"]$/g, "");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.font = `400 48px "${first}"`;
      // Litera bazowa i jej wersja z ogonkiem/kreska. W kroju z pelnym
      // zestawem lacinskim rozszerzonym maja bardzo zblizona szerokosc;
      // przy podmianie na kroj systemowy roznica jest wyrazna.
      return {
        a: ctx.measureText("a").width,
        aOgonek: ctx.measureText("ą").width,
        l: ctx.measureText("l").width,
        lKreska: ctx.measureText("ł").width,
      };
    });
    expect(widths.aOgonek).toBeGreaterThan(0);
    expect(Math.abs(widths.aOgonek - widths.a)).toBeLessThan(widths.a * 0.25);
    expect(widths.lKreska).toBeGreaterThan(0);
  });
});

/**
 * B6 — usuwanie wymaga potwierdzenia.
 *
 * ISK-402 / M3: potwierdzenie przestalo byc natywnym `<dialog>` z
 * `showModal()` i jest teraz INLINE, w miejscu przyciskow wiersza — karta
 * wymaga „zero modali" za wzorcem. Dlatego `getByRole("dialog")` ustepuje
 * miejsca grupie `Potwierdzenie usuniecia: <nazwa>`.
 *
 * CZEGO TA ZMIANA NIE DOTKNELA: ani jednej asercji BEZPIECZENSTWA. Samo
 * klikniecie „Usun" nadal nic nie usuwa, „Anuluj" nadal nic nie usuwa,
 * Escape nadal nic nie usuwa, a potwierdzenie usuwa WYLACZNIE wskazany
 * wiersz. Egzekwuje to serwer: `deleteCatalogItem` odrzuca zadanie bez pola
 * `confirmDeleteId` rownego `id`, wiec pominiecie pytania (skrypt, wylaczony
 * JavaScript, recznie zlozone zadanie) tez niczego nie usuwa.
 */
test.describe("B6 — usuwanie wymaga potwierdzenia", () => {
  /** Pytanie inline — grupa nazwana usuwana pozycja. */
  function confirmFor(page: Page, name: string) {
    return page.getByRole("group", {
      name: `Potwierdzenie usunięcia: ${name}`,
    });
  }

  test("klikniecie „Usun” nie usuwa nic; pyta i nazywa pozycje", async ({
    page,
  }) => {
    const training = await createTraining({
      published: false,
      titlePrefix: "[TEST] Do potwierdzenia",
    });
    try {
      await loginAsAdmin(page);
      await page.goto("/panel/szkolenia");

      const row = page.getByRole("row", { name: new RegExp(training.slug) });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Usuń" }).click();

      // Pytanie nazywa usuwana pozycje — administrator widzi, co usuwa.
      const confirm = confirmFor(page, training.title);
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText(training.title);
      await expect(confirm).toContainText(/nie można cofnąć/i);

      // Potwierdzenie podmienia rzad akcji, a nie staje w nim obok: dopoki
      // pytanie jest otwarte, nie ma czym przypadkowo kliknac „Usun" ponownie.
      //
      // `exact: true` jest tu KONIECZNE. `getByRole` dopasowuje nazwe dostepna
      // jako PODCIAG, bez rozroznienia wielkosci liter — bez tego „Usun"
      // trafia takze w „Tak, usun trwale" z samego pytania, czyli asercja
      // mierzylaby przycisk potwierdzenia i nie moglaby nigdy przejsc.
      await expect(
        row.getByRole("button", { name: "Usuń", exact: true }),
      ).toHaveCount(0);

      // KLUCZOWA asercja: samo klikniecie nic nie usunelo.
      const stillThere = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", training.id);
      expect(stillThere.data ?? []).toHaveLength(1);

      // „Anuluj” tez nic nie usuwa.
      await confirm.getByRole("button", { name: "Anuluj" }).click();
      await expect(confirm).toHaveCount(0);
      const afterCancel = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", training.id);
      expect(afterCancel.data ?? []).toHaveLength(1);
      await expect(row).toBeVisible();

      // Fokus wraca na przycisk, ktory otworzyl pytanie. `<dialog>` dawal to
      // gratis; przy potwierdzeniu inline trzeba bylo dopisac to samemu, wiec
      // ma wlasna asercje — bez niej klawiatura gubi miejsce w tabeli.
      await expect(row.getByRole("button", { name: "Usuń" })).toBeFocused();
    } finally {
      await deleteTraining(training.id);
    }
  });

  test("Escape zamyka pytanie i nie usuwa pozycji", async ({ page }) => {
    const training = await createTraining({
      published: false,
      titlePrefix: "[TEST] Escape",
    });
    try {
      await loginAsAdmin(page);
      await page.goto("/panel/szkolenia");

      const row = page.getByRole("row", { name: new RegExp(training.slug) });
      await row.getByRole("button", { name: "Usuń" }).click();
      const confirm = confirmFor(page, training.title);
      await expect(confirm).toBeVisible();

      // Po otwarciu fokus stoi na „Anuluj" (nie na przycisku niszczacym),
      // wiec Escape ma gdzie trafic — to warunek dzialania tej sciezki.
      await expect(
        confirm.getByRole("button", { name: "Anuluj" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(confirm).toHaveCount(0);

      const after = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", training.id);
      expect(after.data ?? []).toHaveLength(1);
    } finally {
      await deleteTraining(training.id);
    }
  });

  /**
   * ISK-414 — zamkniecie fokusu, ktore dawal `<dialog>` z `showModal()`.
   *
   * Przy potwierdzeniu inline Escape wisial na samej GRUPIE, a „Anuluj" byl
   * w niej ostatnim elementem fokusowalnym: Tab wychodzil na „Edytuj"
   * nastepnego wiersza i zostawial wiersz uzbrojony oraz nieodwolywalny
   * Escapem. Tu mierzymy jedno i drugie — krazenie Tab w pytaniu oraz to, ze
   * uzbrojony moze byc najwyzej JEDEN wiersz.
   *
   * Bezpieczenstwo stoi osobno (serwer porownuje `confirmDeleteId`), wiec kazdy
   * krok konczy sie sprawdzeniem, ze nic nie zostalo usuniete.
   */
  test("pytanie zamyka fokus: Tab krazy, Escape dziala, uzbrojony jest jeden wiersz", async ({
    page,
  }) => {
    const armed = await createTraining({
      published: false,
      titlePrefix: "[TEST] Fokus uzbrojony",
    });
    const neighbour = await createTraining({
      published: false,
      titlePrefix: "[TEST] Fokus sasiad",
    });
    try {
      await loginAsAdmin(page);
      await page.goto("/panel/szkolenia");

      const row = page.getByRole("row", { name: new RegExp(armed.slug) });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Usuń", exact: true }).click();

      const confirm = confirmFor(page, armed.title);
      const cancel = confirm.getByRole("button", { name: "Anuluj" });
      const destroy = confirm.getByRole("button", { name: "Tak, usuń trwale" });
      await expect(cancel).toBeFocused();

      // Tab z „Anuluj" (ostatni element pytania) wraca na poczatek pytania,
      // zamiast wyjsc na „Edytuj" nastepnego wiersza.
      await page.keyboard.press("Tab");
      await expect(destroy).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      // I w druga strone.
      await page.keyboard.press("Shift+Tab");
      await expect(destroy).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(cancel).toBeFocused();

      // Escape dalej zamyka — fokus nigdy nie wyszedl z pytania.
      await page.keyboard.press("Escape");
      await expect(confirm).toHaveCount(0);
      await expect(
        row.getByRole("button", { name: "Usuń", exact: true }),
      ).toBeFocused();

      // Przeniesienie fokusu POZA pytanie wycofuje je, wiec dwa wiersze nie
      // beda uzbrojone naraz (`showModal()` tego nie dopuszczal).
      // Fokus przestawiamy programowo, a nie klikajac: wycofanie pytania
      // zmienia wysokosc wiersza, wiec klikniecie myszka mierzyloby stabilnosc
      // layoutu, a nie zamkniecie fokusu.
      await row.getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(confirmFor(page, armed.title)).toBeVisible();

      const otherRow = page.getByRole("row", {
        name: new RegExp(neighbour.slug),
      });
      await otherRow.getByRole("button", { name: "Usuń", exact: true }).focus();
      await expect(confirmFor(page, armed.title)).toHaveCount(0);
      await page.keyboard.press("Enter");
      await expect(confirmFor(page, neighbour.title)).toBeVisible();
      await expect(confirmFor(page, armed.title)).toHaveCount(0);

      // Escape na uzbrojonym sasiedzie — i nadal nic nie usuniete.
      await page.keyboard.press("Escape");
      await expect(confirmFor(page, neighbour.title)).toHaveCount(0);
      const survived = await serviceClient()
        .from("trainings")
        .select("id")
        .in("id", [armed.id, neighbour.id]);
      expect(survived.data ?? []).toHaveLength(2);
    } finally {
      await deleteTraining(armed.id);
      await deleteTraining(neighbour.id);
    }
  });

  test("dopiero potwierdzenie usuwa — i tylko wskazana pozycje", async ({
    page,
  }) => {
    const target = await createTraining({
      published: false,
      titlePrefix: "[TEST] Do usuniecia",
    });
    const neighbour = await createTraining({
      published: false,
      titlePrefix: "[TEST] Sasiad",
    });
    try {
      await loginAsAdmin(page);
      await page.goto("/panel/szkolenia");

      const row = page.getByRole("row", { name: new RegExp(target.slug) });
      await row.getByRole("button", { name: "Usuń" }).click();
      await confirmFor(page, target.title)
        .getByRole("button", { name: "Tak, usuń trwale" })
        .click();

      await expect(row).toHaveCount(0);

      const gone = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", target.id);
      expect(gone.data ?? []).toHaveLength(0);

      // Sasiedni wiersz przezyl — potwierdzenie nosi identyfikator pozycji.
      const survived = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", neighbour.id);
      expect(survived.data ?? []).toHaveLength(1);
    } finally {
      await deleteTraining(target.id);
      await deleteTraining(neighbour.id);
    }
  });

  test("usuwanie trenera tez przechodzi przez potwierdzenie", async ({
    page,
  }) => {
    const svc = serviceClient();
    const slug = `test-trener-${sfx()}`;
    const { data: created, error } = await svc
      .from("trainers")
      .insert({
        slug,
        full_name: `[TEST] Trener ${slug}`,
        is_published: false,
      })
      .select("id,full_name")
      .single();
    if (error) throw error;

    try {
      await loginAsAdmin(page);
      await page.goto("/panel/trenerzy");

      const row = page.getByRole("row", { name: new RegExp(slug) });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Usuń" }).click();

      const confirm = confirmFor(page, created.full_name);
      await expect(confirm).toContainText(created.full_name);

      const stillThere = await svc
        .from("trainers")
        .select("id")
        .eq("id", created.id);
      expect(stillThere.data ?? []).toHaveLength(1);

      await confirm.getByRole("button", { name: "Tak, usuń trwale" }).click();
      await expect(row).toHaveCount(0);

      const gone = await svc.from("trainers").select("id").eq("id", created.id);
      expect(gone.data ?? []).toHaveLength(0);
    } finally {
      await svc.from("trainers").delete().eq("id", created.id);
    }
  });
});

test.describe("P4 — /kontakt?szkolenie= wiaze zgloszenie ze szkoleniem", () => {
  test.beforeEach(async () => {
    await clearThrottle();
  });

  test(
    "przejscie ze szczegolu szkolenia zapisuje niepuste training_id",
    { tag: "@form-submit" },
    async ({ page }) => {
      const training = await createTraining({
        published: true,
        titlePrefix: "[TEST] Powiazanie",
      });
      const email = `powiazanie-${sfx()}@example.invalid`;
      try {
        // Pelna sciezka uzytkownika: szczegol szkolenia -> CTA -> formularz.
        await page.goto(`/szkolenia/${training.slug}`);
        await page.getByRole("link", { name: /Skontaktuj się/ }).click();
        // Nawigacja App Routera nie zmienia adresu, dopoki serwer nie odda
        // payloadu RSC. W trybie dev pierwsze wejscie w `/kontakt` placi za
        // kompilacje trasy, wiec domyslne 30 s z `expect` bywa za ciasne i czyta
        // sie jak niedzialajace CTA. Czekamy jawnie, z limitem calego testu.
        await page.waitForURL(
          new RegExp(`/kontakt\\?szkolenie=${training.slug}$`),
          { timeout: 90_000 },
        );

        // Formularz pokazuje, o ktore szkolenie pyta.
        const marker = page.getByTestId("selected-training");
        await expect(marker).toBeVisible();
        await expect(marker).toContainText(training.title);
        await expect(marker).toHaveAttribute("data-training-id", training.id);

        await page.getByLabel("Imię i nazwisko").fill("[TEST] Jan Powiazany");
        await page.getByLabel("Adres e-mail").fill(email);
        await page.getByLabel("Telefon").fill("+48 600 100 200");
        await page
          .getByLabel("Wiadomość")
          .fill("Fikcyjna tresc zapytania o konkretne szkolenie (E2E).");
        await page
          .getByRole("checkbox", {
            name: /Potwierdzam zapoznanie się z informacją RODO/,
          })
          .check();
        await awaitFormTokenMaturity(page);
        await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

        await expect(page.getByRole("status")).toContainText(
          "Dziękujemy za zgłoszenie",
        );

        // Ekran potwierdzenia nic nie dowodzi (warstwy antyspamowe zwracaja 200
        // takze przy cichym odrzuceniu) — dowodem jest wiersz w bazie.
        const { data } = await serviceClient()
          .from("inquiries")
          .select("training_id,interest_area")
          .eq("email", email)
          .single();
        expect(data?.training_id).toBe(training.id);
        expect(data?.training_id).not.toBeNull();
        // Temat zostaje tez tekstem — lista zgloszen czyta sie bez joinu.
        expect(data?.interest_area).toBe(training.title);
      } finally {
        await serviceClient().from("inquiries").delete().eq("email", email);
        await deleteTraining(training.id);
      }
    },
  );

  test("panel pokazuje nazwe powiazanego szkolenia w szczegole zgloszenia", async ({
    page,
  }) => {
    const training = await createTraining({
      published: true,
      titlePrefix: "[TEST] Temat w panelu",
    });
    const svc = serviceClient();
    const email = `temat-${sfx()}@example.invalid`;
    const { data: inquiry, error } = await svc
      .from("inquiries")
      .insert({
        kind: "osoba",
        full_name: "[TEST] Zglaszajacy z powiazaniem",
        email,
        phone: "+48 600 000 000",
        training_id: training.id,
        message: "Fikcyjna tresc zgloszenia powiazanego ze szkoleniem (E2E).",
        rodo_ack: true,
        rodo_clause_version: "draft-2026-10",
        status: "nowe",
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      await loginAsAdmin(page);
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);
      await expect(page.getByText(training.title)).toBeVisible();
    } finally {
      await svc.from("inquiries").delete().eq("id", inquiry.id);
      await deleteTraining(training.id);
    }
  });

  test("nieznany slug nie wiaze niczego i nie psuje strony", async ({
    page,
  }) => {
    await page.goto("/kontakt?szkolenie=nie-ma-takiego-szkolenia-364");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("selected-training")).toHaveCount(0);
    // Pole tekstowe pozostaje droga wskazania tematu (kryterium §12).
    await expect(
      page.getByLabel("Interesujące szkolenie lub obszar"),
    ).toBeVisible();
  });

  test("slug nieopublikowanego szkolenia nie jest wiazany", async ({
    page,
  }) => {
    const draft = await createTraining({
      published: false,
      titlePrefix: "[TEST] Szkic",
    });
    try {
      await page.goto(`/kontakt?szkolenie=${draft.slug}`);
      await expect(page.getByTestId("selected-training")).toHaveCount(0);
    } finally {
      await deleteTraining(draft.id);
    }
  });
});

test.describe("P5 — cele dotykowe maja co najmniej 44x44 px", () => {
  test.use({ viewport: NARROW });

  async function assertTargets(page: Page, scope: string, label: string) {
    const small = await page.$$eval(
      `${scope} a, ${scope} button`,
      (nodes, min) =>
        nodes
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              text: (node.textContent ?? "").trim().slice(0, 40),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          // Elementy niewidoczne (0x0) nie sa celami dotykowymi.
          .filter((box) => box.width > 0 && box.height > 0)
          .filter((box) => box.width < min || box.height < min),
      MIN_TOUCH_PX,
    );
    expect(small, `${label}: cele ponizej ${MIN_TOUCH_PX}px`).toEqual([]);
  }

  // Naglowek pochodzi z `app/(public)/layout.tsx`, wiec mierzymy go na
  // `/kontakt`: ta trasa nie czyta katalogu, wiec asercja o celach dotykowych
  // nie zalezy od dostepnosci danych.
  test("nawigacja i CTA strony publicznej", async ({ page }) => {
    await page.goto("/kontakt");
    await assertTargets(page, "header", "naglowek publiczny");
  });

  test("akcje w tabeli panelu", async ({ page }) => {
    const training = await createTraining({
      published: false,
      titlePrefix: "[TEST] Cele dotykowe",
    });
    try {
      await loginAsAdmin(page);
      await page.goto("/panel/szkolenia");
      await assertTargets(page, ".panel-actions", "akcje w tabeli");
      await assertTargets(page, ".panel-header", "naglowek panelu");
    } finally {
      await deleteTraining(training.id);
    }
  });
});

test.describe("P6 — glowne CTA jest widoczne na waskim ekranie", () => {
  test.use({ viewport: NARROW });

  // Jak wyzej: naglowek jest wspolny dla calej grupy `(public)`, a `/kontakt`
  // nie zalezy od katalogu.
  test("„Zapytaj o szkolenie” w naglowku nie jest ukryte", async ({ page }) => {
    await page.goto("/kontakt");
    const cta = page
      .locator("header")
      .getByRole("link", { name: /Zapytaj o szkolenie/ });

    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    // Przed poprawka regula `display: none` ponizej 800 px chowala CTA.
    const display = await cta.evaluate(
      (node) => getComputedStyle(node).display,
    );
    expect(display).not.toBe("none");

    // Jest nie tylko widoczne, ale i uzywalne.
    await cta.click();
    await expect(page).toHaveURL(/\/kontakt$/);
  });

  test("CTA jest widoczne takze przy 800 px, na granicy regulowanej media query", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 720 });
    await page.goto("/kontakt");
    await expect(
      page.locator("header").getByRole("link", { name: /Zapytaj o szkolenie/ }),
    ).toBeVisible();
  });
});

test.describe("P8 — tabela panelu ma afordans przewijania", () => {
  test.use({ viewport: NARROW });

  test("region jest etykietowany, osiagalny z klawiatury i przewijalny", async ({
    page,
  }) => {
    const training = await createTraining({
      published: false,
      titlePrefix: "[TEST] Afordans przewijania",
    });
    try {
      await loginAsAdmin(page);
      await page.goto("/panel/szkolenia");

      const region = page.getByRole("region", {
        name: /tabela przewijana w poziomie/,
      });
      await expect(region).toBeVisible();
      // WCAG 2.1.1: obszar przewijany musi byc osiagalny bez myszki.
      await expect(region).toHaveAttribute("tabindex", "0");

      // Podpowiedz tekstowa jest widoczna dokladnie tam, gdzie przewijanie
      // faktycznie wystepuje.
      await expect(page.locator(".panel-table-hint")).toBeVisible();

      // Kolumna „Akcje” jest osiagalna: region daje sie przewinac do konca.
      const scrolled = await region.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
        return {
          scrollLeft: Math.round(node.scrollLeft),
          overflow: node.scrollWidth - node.clientWidth,
        };
      });
      if (scrolled.overflow > 0) {
        expect(scrolled.scrollLeft).toBeGreaterThan(0);
      }

      await expect(
        page.getByRole("columnheader", { name: "Akcje" }),
      ).toBeAttached();
    } finally {
      await deleteTraining(training.id);
    }
  });

  test("podpowiedz nie zasmieca szerokiego ekranu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsAdmin(page);
    await page.goto("/panel/szkolenia");
    await expect(page.locator(".panel-table-hint")).toBeHidden();
  });
});

test.describe("P10 — brak przewijania w poziomie na 360 px", () => {
  test.use({ viewport: NARROW });

  test("szczegol zgloszenia nie wychodzi poza kadr", async ({ page }) => {
    const inquiry = await createInquiry();
    try {
      await loginAsAdmin(page);
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      // Raport bramki: scrollWidth 390 > clientWidth 360. Zostawiamy 1 px
      // tolerancji na zaokraglenia subpikselowe.
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    } finally {
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });

  test("dlugi adres e-mail nie rozpycha karty", async ({ page }) => {
    const svc = serviceClient();
    // Adres dluzszy niz szerokosc karty — dokladnie ten przypadek wywolywal
    // przepelnienie przy stalej kolumnie etykiet 7rem.
    const email = `bardzo-dlugi-adres-kontaktowy-${sfx()}@przyklad-domeny-testowej.example.invalid`;
    const { data: inquiry, error } = await svc
      .from("inquiries")
      .insert({
        kind: "osoba",
        full_name: "[TEST] Dlugi adres",
        email,
        phone: "+48 600 000 000",
        interest_area: "[TEST] Obszar",
        message: "Fikcyjna tresc zgloszenia z dlugim adresem e-mail (E2E).",
        rodo_ack: true,
        rodo_clause_version: "draft-2026-10",
        status: "nowe",
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      await loginAsAdmin(page);
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    } finally {
      await svc.from("inquiries").delete().eq("id", inquiry.id);
    }
  });

  test("widoki publiczne tez nie przewijaja sie w poziomie", async ({
    page,
  }) => {
    for (const path of ["/", "/szkolenia", "/trenerzy", "/kontakt"]) {
      await page.goto(path);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        metrics.scrollWidth,
        `${path}: scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}`,
      ).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
  });
});
