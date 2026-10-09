// WCAG 2.1 AA — bramka dostepnosci E6.
//
// ADR-0005 D4 wymienia siedem widokow do skanu axe: strona glowna, katalog,
// szczegol szkolenia, trenerzy, kontakt, formularz i logowanie. "Formularz"
// traktujemy jako osobny przypadek od "kontaktu": formularz po nieudanej
// walidacji ma inne drzewo dostepnosci (aria-invalid, komunikaty bledow,
// aria-live) niz formularz czysty, a wlasnie tam naruszenia sa najczestsze.
//
// Skan automatyczny wylapuje ~30% naruszen WCAG, dlatego nizej doklejamy
// jawne testy nawigacji klawiatura i powiazania etykiet — rzeczy, ktorych axe
// nie sprawdza, a ktore decyduja o uzywalnosci dla czytnika ekranu.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { clearThrottle } from "./helpers/data";
import { awaitFormTokenMaturity } from "./helpers/form";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
}

/** Zwiezly opis naruszen — bez tego komunikat bledu to sciana JSON-a. */
function describe(violations: Awaited<ReturnType<typeof scan>>["violations"]) {
  return violations.map(
    (v) =>
      `${v.id} (${v.impact}) — ${v.help}; wezly: ${v.nodes
        .map((n) => n.target.join(" "))
        .join(", ")}`,
  );
}

const views: Array<[name: string, path: string]> = [
  ["strona glowna", "/"],
  ["katalog", "/szkolenia"],
  ["szczegol szkolenia", "/szkolenia/wprowadzenie-do-ai"],
  ["trenerzy", "/trenerzy"],
  ["kontakt", "/kontakt"],
  ["logowanie", "/panel/logowanie"],
];

for (const [name, path] of views) {
  test(`axe: ${name} (${path}) bez naruszen krytycznych`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const results = await scan(page);
    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(describe(critical)).toEqual([]);
  });
}

// Panelu nie ma na liscie siedmiu widokow z ADR-0005 D4, ale administrator tez
// korzysta z klawiatury i czytnika ekranu — a panel jest renderowany wewnatrz
// publicznego layoutu, co jest realnym zrodlem problemow z landmarkami.
// `hasKnownContrastDefect` = widok z tabela, czyli z `th` i `td small`
// malowanymi `--color-text-muted` (#7e857a). Na bialym tle daje to ~3.8:1,
// a WCAG 2.1 AA wymaga 4.5:1 dla tekstu tej wielkosci — patrz defekt POW-4
// w `docs/qa/raport-e6.md`. Naprawa nalezy do E5 (wystarczy
// `--color-text-secondary`, #5b6157 ≈ 6.4:1).
//
// Te trzy przypadki sa oznaczone `test.fail()`, a nie pominiete: defekt
// zostaje udokumentowany w kodzie, bramka jest zielona, a w chwili naprawy
// kontrastu Playwright zglosi „expected to fail but passed” i wymusi
// zdjecie adnotacji. Pominiecie (`skip`) po cichu straciloby ten sygnal.
const panelViews: Array<
  [name: string, path: string, hasKnownContrastDefect: boolean]
> = [
  ["panel — start", "/panel", false],
  ["panel — szkolenia", "/panel/szkolenia", true],
  ["panel — trenerzy", "/panel/trenerzy", true],
  ["panel — zgloszenia", "/panel/zgloszenia", true],
];

test.describe("axe: panel administratora (poza wymaganym minimum ADR-0005 D4)", () => {
  for (const [name, path, hasKnownContrastDefect] of panelViews) {
    test(`${name} bez naruszen krytycznych`, async ({ page }) => {
      test.fail(
        hasKnownContrastDefect,
        "POW-4: kontrast `th` / `td small` w tabelach panelu to ~3.8:1 (wymagane 4.5:1)",
      );
      await loginAsAdmin(page);
      await page.goto(path);
      const results = await scan(page);
      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(describe(critical)).toEqual([]);
    });
  }
});

test("axe: formularz w stanie bledu walidacji bez naruszen krytycznych", async ({
  page,
}) => {
  await page.goto("/kontakt");
  // Wymuszamy bledy: pusty formularz + brak zgody RODO.
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(page.locator("#rodoAck-error")).toBeVisible();

  const results = await scan(page);
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(describe(critical)).toEqual([]);
});

test.describe("nawigacja klawiatura (WCAG 2.1.1, 2.4.3, 2.4.7)", () => {
  test("katalog: Tab dociera do pol filtra i do pierwszego wyniku, focus jest widoczny", async ({
    page,
  }) => {
    await page.goto("/szkolenia");

    // Przechodzimy Tabem i zbieramy kolejnosc elementow interaktywnych.
    const order: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute("name"),
          text: (el.textContent ?? "").trim().slice(0, 40),
          // Focus musi byc widoczny: albo outline, albo wyrazny box-shadow.
          outlineWidth: parseFloat(style.outlineWidth || "0"),
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });
      if (!info) continue;
      order.push(`${info.tag}:${info.name ?? info.text}`);

      const focusVisible =
        (info.outlineStyle !== "none" && info.outlineWidth > 0) ||
        (info.boxShadow !== "none" && info.boxShadow !== "");
      expect(
        focusVisible,
        `Element ${info.tag} (${info.name ?? info.text}) nie ma widocznego focusu`,
      ).toBe(true);
    }

    // Pola filtra musza byc osiagalne z klawiatury, w kolejnosci dokumentu.
    const q = order.findIndex((o) => o === "input:q");
    const category = order.findIndex((o) => o === "select:category");
    expect(q, `Nie dotarlem Tabem do pola szukania. Kolejnosc: ${order.join(" > ")}`).toBeGreaterThanOrEqual(0);
    expect(category).toBeGreaterThan(q);
  });

  test("formularz: calosc da sie wypelnic i wyslac bez myszy", async ({
    page,
  }) => {
    // Ten test realnie wysyla zgloszenie, wiec liczy sie do limitu 3/10 min.
    await clearThrottle();
    await page.goto("/kontakt");

    // Focus na pierwszym polu i dalej wylacznie klawiatura.
    await page.getByLabel("Imię i nazwisko").focus();
    await page.keyboard.type("[TEST] Klawiatura Testowa");
    await page.keyboard.press("Tab");
    await page.keyboard.type("klawiatura@example.invalid");

    // Nie zakladamy sztywnej kolejnosci pozostalych pol — sprawdzamy to, co
    // jest istotne dla WCAG 2.1.1: kazde pole jest osiagalne i edytowalne
    // z klawiatury, a zgoda RODO da sie zaznaczyc Spacja.
    await page.getByLabel("Telefon").focus();
    await page.keyboard.type("+48 600 100 200");
    await page.getByLabel("Interesujące szkolenie lub obszar").focus();
    await page.keyboard.type("[TEST] Obszar");
    await page.getByLabel("Wiadomość").focus();
    await page.keyboard.type("Zgloszenie wypelnione wylacznie klawiatura.");

    const consent = page.getByRole("checkbox", {
      name: /Potwierdzam zapoznanie się z informacją RODO/,
    });
    await consent.focus();
    await page.keyboard.press("Space");
    await expect(consent).toBeChecked();

    // Przycisk wysylki jest osiagalny i reaguje na Enter.
    const submit = page.getByRole("button", { name: "Wyślij zgłoszenie" });
    await submit.focus();
    await expect(submit).toBeFocused();
    // Token czasowy (ADR-0004 §3) odrzuca wyslanie szybsze niz 3 s — i robi to
    // "cicho", oddajac ekran sukcesu. Bez tego czekania test przeszedlby,
    // nie zapisawszy niczego.
    await awaitFormTokenMaturity(page);
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status")).toContainText(
      "Dziękujemy za zgłoszenie",
    );
  });

  test("brak pulapki focusu: z formularza da sie wyjsc Tabem do konca dokumentu", async ({
    page,
  }) => {
    await page.goto("/kontakt");
    await page.getByLabel("Imię i nazwisko").focus();

    // Po dostatecznej liczbie Tabow focus musi opuscic formularz
    // (trafic do stopki/nawigacji albo wyjsc do chrome przegladarki).
    let leftForm = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const insideForm = await page.evaluate(() =>
        Boolean(document.activeElement?.closest("form")),
      );
      if (!insideForm) {
        leftForm = true;
        break;
      }
    }
    expect(leftForm, "Focus nie opuscil formularza — pulapka focusu").toBe(
      true,
    );
  });
});

test.describe("semantyka tresci", () => {
  for (const [name, path] of views) {
    test(`${name}: dokladnie jeden h1 i brak przeskokow w hierarchii naglowkow`, async ({
      page,
    }) => {
      await page.goto(path);
      const levels = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
          Number(h.tagName.slice(1)),
        ),
      );

      expect(
        levels.filter((l) => l === 1).length,
        `Oczekuje dokladnie jednego h1, jest: ${levels.filter((l) => l === 1).length}`,
      ).toBe(1);

      // WCAG 1.3.1: poziom nie moze przeskoczyc o wiecej niz 1 w dol.
      for (let i = 1; i < levels.length; i++) {
        expect(
          levels[i]! - levels[i - 1]!,
          `Przeskok h${levels[i - 1]} -> h${levels[i]} w ${path}; cala hierarchia: ${levels.join(",")}`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  test("trenerzy: brak zdjecia nie zostawia obrazka bez alt", async ({
    page,
  }) => {
    // W modelu danych `trainers.photo_url` moze byc NULL. Widok musi wtedy
    // albo pominac <img>, albo podac sensowny tekst alternatywny — nigdy
    // nie renderowac pustego src z pustym alt.
    await page.goto("/trenerzy");
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter(
          (img) =>
            !img.getAttribute("src") ||
            img.getAttribute("alt") === null ||
            (img.getAttribute("alt") === "" &&
              img.getAttribute("role") !== "presentation" &&
              img.getAttribute("aria-hidden") !== "true"),
        )
        .map((img) => img.outerHTML.slice(0, 120)),
    );
    expect(broken).toEqual([]);
  });
});
