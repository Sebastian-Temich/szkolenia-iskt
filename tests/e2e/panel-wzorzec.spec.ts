/**
 * ISK-402 / M3 — panel administratora wg wzorca ISKT Greenovation.
 *
 * CO TEN PLIK MIERZY, A CZEGO NIE
 * Karta ISK-402 ostrzega wprost: defekt kontrastu `.panel-button` (1,03:1)
 * przezyl w tym repozytorium dwie rundy „poprawek", bo `getByRole(...).click()`
 * przechodzi na elemencie niewidocznym. Dlatego tutaj nie ma ani jednej
 * asercji typu „element istnieje" jako dowodu wygladu — kazda wlasnosc
 * wizualna jest czytana z COMPUTED STYLE albo z pomiaru geometrii.
 *
 * DLACZEGO JEDNO LOGOWANIE NA CALY PLIK (tryb `serial`)
 * GoTrue ma limit `sign_in_sign_ups = 30` na 5 minut na adres IP
 * (`supabase/config.toml`), a caly zestaw E2E jest blisko tego progu. Osiem
 * kolejnych logowan przez UI przepychalo go ponad i testy czerwienily sie na
 * „Nie udalo sie zalogowac", czyli na limicie, nie na defekcie — ta sama nota
 * stoi w `panel-layout.spec.ts`. Przypadki logowania ponizej NIE dotykaja
 * GoTrue: walidacja formatu odrzuca je po stronie Server Action, przed
 * `signInWithPassword`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { createInquiry, createTraining, deleteTraining } from "./helpers/data";
import {
  backgroundAlpha,
  contrastSamples,
  formatSample,
} from "./helpers/kontrast";
import { serviceClient } from "./helpers/stack";

const actionTimeout = 60_000;

/** Szerokosci z DoD karty ISK-402. */
const widths = [360, 768, 1440] as const;
const evidenceDirectory = process.env.EVIDENCE_DIR;

/**
 * Prawe krawedzie elementow potomnych, nie `document.scrollWidth`.
 *
 * Specyfikacja M0 §5 i karta ISK-402 mowia to samo: `overflow-x: hidden` na
 * kontenerze glownym MASKUJE przepelnienie, wiec `document.scrollWidth`
 * w tym layoucie zawsze wyjdzie zielony. Mierzymy wiec elementy.
 *
 * Swiadomy wyjatek: potomkowie kontenera z wlasnym `overflow-x: auto/scroll`
 * (u nas `.panel-table-wrap`) MAJA prawo wychodzic poza kadr — to jest
 * zaprojektowany afordans przewijania tabeli (ISK-364 / P8), pilnowany osobno
 * w `ux-blockers.spec.ts`. Bez tego wyjatku test karalby za rozwiazanie,
 * ktorego sam wymaga.
 */
async function elementsOutsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const out: string[] = [];

    function insideScroller(element: Element): boolean {
      let node = element.parentElement;
      while (node && node !== document.documentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
        node = node.parentElement;
      }
      return false;
    }

    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (insideScroller(element)) continue;
      // 1 px tolerancji na zaokraglenia subpikselowe.
      if (rect.right > viewport + 1 || rect.left < -1) {
        out.push(
          `${element.tagName.toLowerCase()}.${element.className || "(bez klasy)"}` +
            ` [${Math.round(rect.left)}..${Math.round(rect.right)}] > ${viewport}`,
        );
      }
    }
    return out.slice(0, 12);
  });
}

/** Wszystkie probki kontrastu z selektora musza przejsc swoj prog 1.4.3. */
async function expectContrastOk(page: Page, selector: string) {
  const samples = await contrastSamples(page, selector);
  expect(
    samples.length,
    `nie zmierzylem zadnego elementu dla \`${selector}\` — selektor albo markup sie rozjechal`,
  ).toBeGreaterThan(0);
  const failing = samples.filter((sample) => sample.ratio < sample.required);
  expect(failing.map(formatSample)).toEqual([]);
}

// ---------------------------------------------------------------------------
// Logowanie — karta wzorca, bez dotykania GoTrue
// ---------------------------------------------------------------------------

test.describe("M3 — ekran logowania wg wzorca", () => {
  test("wycentrowana karta na `--surface-muted`, min-height 72vh, H1 wzorca", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/panel/logowanie");

    await expect(
      page.getByRole("heading", { level: 1, name: "Panel administratora" }),
    ).toBeVisible({ timeout: actionTimeout });

    // `min-height: 72vh` i tlo `--surface-muted` (#f2f8ec) — wprost z karty.
    const shell = await page.locator(".panel-login-shell").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        minHeight: Number.parseFloat(style.minHeight),
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        background: style.backgroundColor,
        viewportHeight: window.innerHeight,
      };
    });
    expect(shell.display).toBe("flex");
    expect(shell.alignItems).toBe("center");
    expect(shell.justifyContent).toBe("center");
    expect(shell.background).toBe("rgb(242, 248, 236)");
    // 72vh zmierzone, nie odczytane z CSS: tak wylapiemy token przesloniety
    // przez utility Tailwinda (pulapka ISK-355).
    expect(shell.minHeight).toBeCloseTo(shell.viewportHeight * 0.72, 0);

    // Karta 420 px wzorca i jej faktyczne wycentrowanie w kadrze.
    const card = await page.locator(".panel-login-card").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        center: Math.round(rect.left + rect.width / 2),
        viewportCenter: Math.round(window.innerWidth / 2),
      };
    });
    expect(card.width).toBe(420);
    expect(Math.abs(card.center - card.viewportCenter)).toBeLessThanOrEqual(1);

    await expectContrastOk(page, ".panel-login-card h1, .panel-login-card p");
    await expectContrastOk(page, ".panel-button");
  });

  test("walidacja wskazuje POLE, nie tylko formularz", async ({ page }) => {
    await page.goto("/panel/logowanie");

    // Puste pola: zadanie dochodzi do Server Action (formularz ma `noValidate`),
    // a ta zwraca blad przy polu. Wzorzec ma w tym miejscu jeden komunikat
    // „Nieprawidlowy e-mail lub haslo." bez wskazania pola.
    await page.getByRole("button", { name: "Zaloguj się" }).click();

    const email = page.getByLabel("E-mail");
    await expect(email).toHaveAttribute("aria-invalid", "true", {
      timeout: actionTimeout,
    });

    // `aria-describedby` musi WSKAZYWAC NIEPUSTY komunikat — sam atrybut
    // niczego nie dowodzi, jesli region, do ktorego kieruje, jest pusty.
    const describedBy = await email.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const message = page.locator(`#${describedBy!.split(/\s+/).at(-1)}`);
    await expect(message).not.toBeEmpty();

    await expect(page.getByLabel("Hasło")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    // Zly format adresu to nadal blad POLA, nie odmowa uwierzytelnienia:
    // w tej sciezce nie ma zapytania do GoTrue.
    await email.fill("to-nie-jest-adres");
    await page.getByLabel("Hasło").fill("cokolwiek");
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(email).toHaveAttribute("aria-invalid", "true", {
      timeout: actionTimeout,
    });
    await expect(page.getByLabel("Hasło")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // Odmowa uwierzytelnienia ma osobny nosnik i NIE pojawia sie przy bledzie
    // formatu — inaczej komunikat „sprawdz dane" wyswietlalby sie w sytuacji,
    // w ktorej zaden login nie zostal sprawdzony.
    //
    // Celujemy w `.panel-error`, a NIE w `getByRole("alert")`: zestaw E2E
    // chodzi po serwerze `next dev`, ktory wstrzykuje wlasny, pusty region
    // `role="alert"` razem z przyciskiem „Open Next.js Dev Tools". Asercja na
    // role liczylaby wiec nakladke narzedziowa Next.js jako komunikat
    // aplikacji i nie mogla nigdy wyjsc zerem (zmierzone na snapshocie ARIA).
    await expect(page.locator(".panel-error")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Panel — jedna sesja na caly blok
// ---------------------------------------------------------------------------

test.describe("M3 — panel wg wzorca", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  let context: BrowserContext;
  let page: Page;

  // Kontekst jawny, a nie `browser.newPage()`: przypadek stanu `pending`
  // potrzebuje DRUGIEJ karty w tej samej sesji, a `browser.newPage()` tworzy
  // kontekst niejawny, ktory `newPage()` odrzuca („Please use
  // browser.newContext()").
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('zakladki: `aria-current="page"` dokladnie na jednej, stan nie tylko kolorem', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/panel/szkolenia");

    const nav = page.getByRole("navigation", { name: "Nawigacja panelu" });
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText("Szkolenia");

    // Podstrona obszaru tez zaznacza swoja zakladke — administrator ma
    // widziec, gdzie jest, takze w edytorze.
    await page.goto("/panel/szkolenia/nowe");
    await expect(nav.locator('a[aria-current="page"]')).toHaveText("Szkolenia");

    await page.goto("/panel/zgloszenia");
    await expect(nav.locator('a[aria-current="page"]')).toHaveText(
      "Zgłoszenia",
    );

    // Pastylka aktywna ma wlasne, nieprzezroczyste tlo — stan wybrany nie moze
    // zalezec od tego, czy ktos zobaczy roznice odcienia tekstu.
    expect(
      await backgroundAlpha(page, '.panel-nav a[aria-current="page"]'),
    ).toBeGreaterThan(0.99);
    await expectContrastOk(page, ".panel-nav a");
  });

  test("tabela ma semantyke, nie tylko siatke; ostatni wiersz bez kreski", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/panel/szkolenia");
    await expect(page.locator(".panel-table tbody tr").first()).toBeVisible({
      timeout: actionTimeout,
    });

    // Wzorzec buduje te liste z `div`-ow, wiec czytnik ekranu nie dostaje ani
    // naglowkow kolumn, ani nawigacji po komorkach. U nas: prawdziwa `table`.
    const headers = page.locator('.panel-table thead th[scope="col"]');
    await expect(headers).toHaveCount(4);
    await expect(headers.nth(0)).toHaveText("Szkolenie");
    await expect(headers.last()).toHaveText("Akcje");
    await expect(
      page.locator('.panel-table tbody th[scope="row"]').first(),
    ).toBeVisible();

    // Wzorzec zostawia `border-bottom` takze na ostatnim wierszu — karta kaze
    // to poprawic, wiec mierzymy wlasnosc, nie obecnosc reguly w arkuszu.
    const borders = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll(".panel-table tbody tr"),
      );
      const cellOf = (row: Element) => row.querySelector("th, td")!;
      return {
        rows: rows.length,
        last: getComputedStyle(cellOf(rows.at(-1)!)).borderBottomWidth,
        first: getComputedStyle(cellOf(rows[0]!)).borderBottomWidth,
      };
    });
    expect(borders.last).toBe("0px");
    if (borders.rows > 1) expect(borders.first).toBe("1px");

    // Naglowki kolumn sa male (12 px), wiec AA liczy je jako tekst zwykly.
    // Wzorzec maluje je `--text-muted` (#7e857a ≈ 3,8:1) — to jest POW-4.
    await expectContrastOk(page, ".panel-table thead th");
    await expectContrastOk(page, ".panel-table-meta, .panel-table-tag");
    await expectContrastOk(page, ".panel-status");
  });

  test("icon-buttony: `aria-label`, nigdy `title`; cel dotykowy 44 px", async () => {
    const training = await createTraining({
      published: false,
      titlePrefix: "[TEST] Ikony akcji",
    });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/panel/szkolenia");

      const row = page.getByRole("row", { name: new RegExp(training.slug) });
      await expect(row).toBeVisible({ timeout: actionTimeout });

      // Nazwa dostepna z `aria-label`. Wzorzec uzywa `title`, ktorego
      // klawiatura nie pokazuje nigdy, a czytnik ekranu oglasza wtedy
      // „przycisk" i nic wiecej.
      await expect(row.getByRole("link", { name: "Edytuj" })).toBeVisible();
      await expect(row.getByRole("button", { name: "Usuń" })).toBeVisible();

      const geometry = await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll(".panel-icon-action"),
        );
        return nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.getAttribute("aria-label"),
            hasTitle: node.hasAttribute("title"),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
      });
      expect(geometry.length).toBeGreaterThan(0);
      for (const item of geometry) {
        expect(item.label, "icon-button bez `aria-label`").toBeTruthy();
        expect(item.hasTitle, `\`title\` na ${item.label}`).toBe(false);
        // Wzorzec daje 36x36; minimum WCAG 2.5.5 to 44x44 i to wygrywa
        // z wiernoscia pikselowa.
        expect(item.width).toBeGreaterThanOrEqual(44);
        expect(item.height).toBeGreaterThanOrEqual(44);
      }

      await expectContrastOk(page, ".panel-icon-action");

      // Akcje stoja w JEDNYM rzedzie, tak jak we wzorcu. Kolumna „Akcje" ma
      // u wzorca 168 px i jemu wystarcza (trzy ikony po 36 px), ale u nas
      // w tym samym rzedzie stoi takze tekstowy przycisk publikacji, a ikony
      // maja 44 px. Przy za waskiej kolumnie rzad zawijal sie do trzech pieter
      // i wiersz rosl trzykrotnie — wygladalo to na zamierzony uklad, wiec
      // mierzymy wysokosc, a nie obecnosc przyciskow.
      const actionsRow = await page.evaluate(() => {
        const node = document.querySelector(".panel-table .panel-actions")!;
        // Mierzymy KONTROLKI, nie dzieci kontenera: przycisk publikacji siedzi
        // w `<form>` z `display: contents`, a taki element nie generuje boksu
        // — `getBoundingClientRect()` zwraca dla niego zera i naiwny pomiar
        // „rozne `top`" zglaszalby zawijanie nawet przy poprawnym rzedzie.
        const controls = Array.from(node.querySelectorAll("a, button"));
        return {
          height: Math.round(node.getBoundingClientRect().height),
          tops: controls.map((control) =>
            Math.round(control.getBoundingClientRect().top),
          ),
          distinctTops: new Set(
            controls.map((control) =>
              Math.round(control.getBoundingClientRect().top),
            ),
          ).size,
          count: controls.length,
        };
      });
      expect(actionsRow.count).toBeGreaterThan(1);
      expect(
        actionsRow.distinctTops,
        `akcje wiersza zawijaja sie do kilku pieter zamiast stac w rzedzie (top: ${actionsRow.tops.join(", ")})`,
      ).toBe(1);
      expect(actionsRow.height).toBeLessThanOrEqual(56);
    } finally {
      await deleteTraining(training.id);
    }
  });

  test("zero modali: w panelu nie ma ani jednego `dialog`", async () => {
    const training = await createTraining({
      published: false,
      titlePrefix: "[TEST] Zero modali",
    });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/panel/szkolenia");
      const row = page.getByRole("row", { name: new RegExp(training.slug) });
      await expect(row).toBeVisible({ timeout: actionTimeout });

      await row.getByRole("button", { name: "Usuń" }).click();

      // Karta wymaga „zero modali" za wzorcem. Asercja jest na BRAK elementu
      // `dialog` i na brak roli `dialog` — poprzednia wersja uzywala
      // `<dialog>` z `showModal()`.
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Pytanie stoi w kadrze wiersza, a nie w warstwie nad strona: jego
      // prawa krawedz nie wychodzi poza region tabeli.
      const confirm = page.getByRole("group", {
        name: `Potwierdzenie usunięcia: ${training.title}`,
      });
      await expect(confirm).toBeVisible();
      const geometry = await confirm.evaluate((node) => {
        const own = node.getBoundingClientRect();
        const wrap = node.closest(".panel-table-wrap")!.getBoundingClientRect();
        return { right: own.right, wrapRight: wrap.right };
      });
      expect(geometry.right).toBeLessThanOrEqual(geometry.wrapRight + 1);
    } finally {
      await deleteTraining(training.id);
    }
  });

  test("notatka wewnetrzna zgloszenia: zapis, odczyt i wyczyszczenie", async () => {
    const inquiry = await createInquiry();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);

      const note = page.getByLabel("Treść notatki");
      await expect(note).toBeVisible({ timeout: actionTimeout });
      await expect(note).toHaveValue("");

      const text = "Klient prosi o kontakt po 15:00 (notatka testowa E2E).";
      await note.fill(text);
      await page.getByRole("button", { name: "Zapisz notatkę" }).click();

      // Flash po zapisie ma `role="status"` — wzorzec renderuje w tym miejscu
      // zwykly `div`, wiec czytnik ekranu nie oglasza nic.
      //
      // Lokalizujemy po KLASIE, a role sprawdzamy jako atrybut. `next dev`
      // wstrzykuje wlasne regiony `role="alert"`/`role="status"` razem
      // z nakladka Dev Tools, wiec `getByRole("status")` nie wskazuje
      // jednoznacznie bannera aplikacji (zmierzone na snapshocie ARIA).
      const flash = page.locator(".panel-flash");
      await expect(flash).toContainText("Zapisano notatkę wewnętrzną.", {
        timeout: actionTimeout,
      });
      await expect(flash).toHaveAttribute("role", "status");
      await expect(flash).toHaveAttribute("aria-live", "polite");

      // Zapis przeszedl do bazy, nie tylko do pola formularza.
      const stored = await serviceClient()
        .from("inquiries")
        .select("admin_note")
        .eq("id", inquiry.id)
        .single();
      expect(stored.data?.admin_note).toBe(text);

      // Odczyt po przeladowaniu — pole nie gubi tresci.
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);
      await expect(page.getByLabel("Treść notatki")).toHaveValue(text, {
        timeout: actionTimeout,
      });

      // Operacja zostawia slad w dzienniku audytu — BEZ tresci notatki
      // (notatka opisuje osobe, ktora zlozyla zgloszenie).
      const audit = await serviceClient()
        .from("admin_audit_log")
        .select("action, entity, actor_id, details")
        .eq("entity_id", inquiry.id)
        .eq("action", "inquiry.note_update");
      expect(audit.data).toHaveLength(1);
      expect(audit.data?.[0]?.actor_id).not.toBeNull();
      expect(audit.data?.[0]?.details).toEqual({ cleared: false });
      expect(JSON.stringify(audit.data?.[0]?.details)).not.toContain(
        "kontakt po 15:00",
      );

      // Puste pole USUWA notatke (zapisuje `null`, nie `""`).
      await page.getByLabel("Treść notatki").fill("");
      await page.getByRole("button", { name: "Zapisz notatkę" }).click();
      await expect(page.locator(".panel-flash")).toBeVisible({
        timeout: actionTimeout,
      });
      const cleared = await serviceClient()
        .from("inquiries")
        .select("admin_note")
        .eq("id", inquiry.id)
        .single();
      expect(cleared.data?.admin_note).toBeNull();
    } finally {
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });

  test("submit blokuje sie na czas wysylki (`disabled` + `aria-busy`)", async () => {
    const inquiry = await createInquiry();
    // OSOBNA karta w tym samym kontekscie (czyli z ta sama sesja): przechwycenie
    // zadania zyje na niej i nie moze przeciec do kolejnych przypadkow tego
    // bloku `serial`, ktore wspolne `page` wykonuje po tym tescie.
    const scoped = await context.newPage();
    try {
      await scoped.setViewportSize({ width: 1440, height: 900 });
      await scoped.goto(`/panel/zgloszenia/${inquiry.id}`);
      await expect(scoped.getByLabel("Treść notatki")).toBeVisible({
        timeout: actionTimeout,
      });

      // Stan `pending` jest z natury ulotny, wiec zamiast sciagac go wyscigiem
      // PRZYTRZYMUJEMY zadanie Server Action. Bez tego test albo flakuje, albo
      // — co gorsza — przechodzi, nie zobaczywszy nigdy stanu, ktorego dotyczy.
      await scoped.route("**/panel/zgloszenia/**", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Karta moze juz nie istniec, jesli test padl wczesniej — bez tego
        // `catch` blad przechwytywania zasloniłby prawdziwa przyczyne.
        await route.continue().catch(() => {});
      });

      await scoped
        .getByLabel("Treść notatki")
        .fill("Notatka do testu pending.");
      await scoped.getByRole("button", { name: "Zapisz notatkę" }).click();

      // Formularz wzorca (i nasz do ISK-402) da sie wyslac dowolna liczbe razy.
      const pendingButton = scoped.getByRole("button", {
        name: "Zapisywanie…",
      });
      await expect(pendingButton).toBeDisabled();
      await expect(pendingButton).toHaveAttribute("aria-busy", "true");

      // Czekamy, az wstrzymane zadanie sie dokonczy. Zamkniecie karty w trakcie
      // przechwytywania konczy sie „Route is already handled!", czyli bledem
      // harnessu podszywajacym sie pod defekt aplikacji.
      await expect(scoped.locator(".panel-flash")).toBeVisible({
        timeout: actionTimeout,
      });
    } finally {
      await scoped.unroute("**/panel/zgloszenia/**").catch(() => {});
      await scoped.close();
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });

  test("brak przewijania w poziomie na 360 / 768 / 1440 — mierzone na elementach", async () => {
    const inquiry = await createInquiry();
    const views = [
      "/panel",
      "/panel/szkolenia",
      "/panel/trenerzy",
      "/panel/zgloszenia",
      `/panel/zgloszenia/${inquiry.id}`,
      "/panel/szkolenia/nowe",
    ];
    try {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const view of views) {
          await page.goto(view);
          // Bez tej asercji pomiar moglby lecieć na pustym, niegotowym drzewie.
          await expect(page.locator(".panel-header")).toBeVisible({
            timeout: actionTimeout,
          });
          const overflowing = await elementsOutsideViewport(page);
          expect(
            overflowing,
            `${view} @${width}px: elementy poza kadrem`,
          ).toEqual([]);
        }
      }
    } finally {
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });

  test("nawigacja panelu miesci sie w kadrze przy 360 px i nie przewija sie", async () => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/panel/szkolenia");

    const nav = page.getByRole("navigation", { name: "Nawigacja panelu" });
    await expect(nav).toBeVisible();

    // POW-5: wzorzec nie ma nawigacji mobilnej w ogole, a `overflow-x: auto`
    // chowalo trzecia sekcje za krawedzia bez zadnego afordansu. Zawijamy.
    const metrics = await nav.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    for (const section of ["Szkolenia", "Trenerzy", "Zgłoszenia"]) {
      const link = nav.getByRole("link", { name: section, exact: true });
      const box = await link.boundingBox();
      expect(box, `link „${section}" nie ma geometrii`).not.toBeNull();
      expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(360);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  // Zrzuty 360/768/1440 z DoD karty. Pomijane bez `EVIDENCE_DIR`, zeby CI nie
  // produkowal kilkunastu plikow przy kazdym przebiegu — tak samo jak
  // `visual-evidence.spec.ts`.
  test("zrzuty 360 / 768 / 1440", async ({ browser }) => {
    test.skip(!evidenceDirectory, "ustaw EVIDENCE_DIR, aby zapisac zrzuty");
    const inquiry = await createInquiry();
    const views = [
      ["panel-start", "/panel"],
      ["panel-szkolenia", "/panel/szkolenia"],
      ["panel-trenerzy", "/panel/trenerzy"],
      ["panel-zgloszenia", "/panel/zgloszenia"],
      ["panel-zgloszenie-szczegol", `/panel/zgloszenia/${inquiry.id}`],
      ["panel-edytor-szkolenia", "/panel/szkolenia/nowe"],
    ] as const;

    // Ekran logowania MUSI isc z kontekstu BEZ sesji. `/panel/logowanie`
    // przekierowuje zalogowanego administratora na `/panel` (`LoginPage` ->
    // `redirect("/panel")`), wiec zrzut robiony wspolna karta pokazywal start
    // panelu podpisany „panel-logowanie" — i wygladal zupelnie wiarygodnie.
    // Zrzut nie jest asercja: trzeba zadbac o to, co faktycznie jest w kadrze.
    const anonymous = await browser.newContext();
    try {
      await mkdir(evidenceDirectory!, { recursive: true });
      const anonymousPage = await anonymous.newPage();
      for (const width of widths) {
        await anonymousPage.setViewportSize({ width, height: 900 });
        await anonymousPage.goto("/panel/logowanie");
        await expect(
          anonymousPage.getByRole("button", { name: "Zaloguj się" }),
        ).toBeVisible({ timeout: actionTimeout });
        await anonymousPage.screenshot({
          path: path.join(evidenceDirectory!, `panel-logowanie-${width}.png`),
          fullPage: true,
        });
      }

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, view] of views) {
          await page.goto(view);
          // Ta sama pulapka od drugiej strony: gdyby sesja wygasla, kazdy
          // widok panelu zapisalby sie jako ekran logowania.
          await expect(page.locator(".panel-header")).toBeVisible({
            timeout: actionTimeout,
          });
          await page.screenshot({
            path: path.join(evidenceDirectory!, `${name}-${width}.png`),
            fullPage: true,
          });
        }
      }
    } finally {
      await anonymous.close();
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });
});
