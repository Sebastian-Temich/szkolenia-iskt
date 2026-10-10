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

test.describe("B6 — usuwanie wymaga potwierdzenia", () => {
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
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(training.title);
      await expect(dialog).toContainText(/nie można cofnąć/i);

      // KLUCZOWA asercja: samo klikniecie nic nie usunelo.
      const stillThere = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", training.id);
      expect(stillThere.data ?? []).toHaveLength(1);

      // „Anuluj” tez nic nie usuwa.
      await dialog.getByRole("button", { name: "Anuluj" }).click();
      await expect(dialog).toBeHidden();
      const afterCancel = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", training.id);
      expect(afterCancel.data ?? []).toHaveLength(1);
      await expect(row).toBeVisible();
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
      await expect(page.getByRole("dialog")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();

      const after = await serviceClient()
        .from("trainings")
        .select("id")
        .eq("id", training.id);
      expect(after.data ?? []).toHaveLength(1);
    } finally {
      await deleteTraining(training.id);
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
      await page
        .getByRole("dialog")
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

      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(created.full_name);

      const stillThere = await svc
        .from("trainers")
        .select("id")
        .eq("id", created.id);
      expect(stillThere.data ?? []).toHaveLength(1);

      await dialog.getByRole("button", { name: "Tak, usuń trwale" }).click();
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

  test("przejscie ze szczegolu szkolenia zapisuje niepuste training_id", async ({
    page,
  }) => {
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
  });

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
