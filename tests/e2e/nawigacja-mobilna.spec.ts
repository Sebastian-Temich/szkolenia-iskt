/**
 * ISK-411 / CR-B2 — bramka nawigacji mobilnej przy 360 px.
 *
 * DLACZEGO TEN PLIK ISTNIEJE
 * `components/site-header.tsx` ma przelacznik (`.site-nav-toggle`) i panel
 * (`.site-nav-panel`), ktore `app/globals.css` wlacza WYLACZNIE w
 * `@media (max-width: 60rem)`; poza tym zakresem oba maja `display: none`.
 * Oba projekty Playwrighta chodza na `devices["Desktop Chrome"]` (1280x720),
 * a `dostepnosc.spec.ts` nie wolal `setViewportSize` ani razu — wiec axe
 * pomijal te dwa elementy Z KONSTRUKCJI (reguly axe nie dotykaja poddrzewa
 * `display: none`, bo nie ma go w drzewie dostepnosci).
 *
 * Efekt zmierzony przed ta zmiana:
 *   grep -rn "site-nav-toggle|site-nav-panel|Nawigacja mobilna|aria-expanded" tests/
 *   -> zero trafien w calym drzewie testow.
 * Jedyny komponent serwisu istniejacy wylacznie ponizej 960 px byl tez jedynym
 * bez jakiegokolwiek pokrycia, i zaden test nigdy go nie OTWIERAL.
 *
 * CO TU JEST MIERZONE, A CZEGO NIE
 * ISK-406 potwierdzil sam komponent jako zrobiony dobrze (44x44 px, komplet
 * `aria-expanded`/`aria-controls`/nazwa, kolejnosc fokusu, CTA nieschowane do
 * panelu). Brakowalo wylacznie BRAMKI — i to ona jest trescia tego pliku, nie
 * poprawka komponentu.
 *
 * RAMIE NEGATYWNE
 * Ostatni test tego pliku psuje nazwe dostepna przelacznika i wymaga, zeby TA
 * SAMA funkcja pomiarowa, ktora wyzej oddaje zielone, zwrocila naruszenie
 * `button-name`. Bez tego ramienia zielony wynik powyzej nie dowodzi niczego:
 * dokladnie tak wygladal stan przed ISK-411, gdzie skan "przechodzil", bo nie
 * mial czego skanowac.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { contrastSamples, formatSample } from "./helpers/kontrast";
import { zmierzPrzepelnienie } from "./helpers/uklad";

/** Najwezszy ekran z zakresu zlecenia ISK-399. */
const WASKI = { width: 360, height: 900 };

/** Szerokosc, na ktorej chodza oba projekty Playwrighta — tu jako kontrola. */
const SZEROKI = { width: 1280, height: 720 };

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Minimum celu dotykowego, WCAG 2.1 AA, kryterium 2.5.5. */
const MIN_CEL_PX = 44;

/**
 * Wszystkie trasy z naglowkiem publicznym. `/panel/logowanie` nie ma
 * `SiteHeader`, wiec nie nalezy do tej bramki.
 */
const WIDOKI = [
  "/",
  "/szkolenia",
  "/szkolenia/wprowadzenie-do-ai",
  "/trenerzy",
  "/kontakt",
  "/polityka-prywatnosci",
] as const;

/** Zwiezly opis naruszen — bez tego komunikat bledu to sciana JSON-a. */
function opisz(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.map(
    (v) =>
      `${v.id} (${v.impact}) — ${v.help}; wezly: ${v.nodes
        .map((n) => n.target.join(" "))
        .join(", ")}`,
  );
}

/**
 * Skan axe zawezony do naruszen, ktorych karta zabrania. Jedna funkcja dla
 * ramienia pozytywnego i negatywnego — gdyby ramie negatywne mialo wlasny
 * pomiar, nie dowodzilo by niczego o bramce.
 */
async function naruszeniaKrytyczne(page: Page): Promise<string[]> {
  const wynik = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return opisz(
    wynik.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  );
}

const przelacznik = (page: Page) => page.locator(".site-nav-toggle");
const panel = (page: Page) => page.locator(".site-nav-panel");

/**
 * Otwiera panel mobilny i czeka, az faktycznie jest w drzewie. Panel renderuje
 * sie warunkowo (`{open ? ... : null}`), wiec `toBeVisible` jest tu asercja
 * istnienia, nie tylko widocznosci.
 */
async function otworzPanel(page: Page): Promise<void> {
  await expect(przelacznik(page)).toHaveAttribute("aria-expanded", "false");
  await przelacznik(page).click();
  await expect(przelacznik(page)).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toBeVisible();
}

/** Geometria kazdego elementu pasujacego do selektora, w pikselach CSS. */
async function pudelka(page: Page, selector: string) {
  return page.$$eval(selector, (nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        opis: `${node.tagName.toLowerCase()}.${Array.from(node.classList)
          .slice(0, 2)
          .join(".")} „${(node.textContent ?? "").trim().slice(0, 24)}”`,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    }),
  );
}

test.describe("CR-B2 — nawigacja mobilna przy 360 px", () => {
  /**
   * Fundament calej reszty pliku: dowodzi, ze przy 360 px mierzymy komponent,
   * ktory ISTNIEJE, a przy 1280 px (czyli tam, gdzie stala dotychczasowa
   * bramka) go NIE MA. To jest wyjasnienie, dlaczego poprzedni skan axe byl
   * zielony, nie znajac tego przycisku.
   */
  test("przelacznik zyje tylko ponizej 60 rem — przy 1280 px bramka nie ma czego mierzyc", async ({
    page,
  }) => {
    await page.setViewportSize(SZEROKI);
    await page.goto("/");

    const szeroki = await page.evaluate(() => ({
      toggle: getComputedStyle(document.querySelector(".site-nav-toggle")!)
        .display,
      nav: getComputedStyle(document.querySelector(".site-nav")!).display,
    }));
    expect(
      szeroki.toggle,
      "Przy 1280 px przelacznik ma byc zdjety z drzewa — na tym polegal brak pokrycia",
    ).toBe("none");
    expect(szeroki.nav).not.toBe("none");

    await page.setViewportSize(WASKI);
    const waski = await page.evaluate(() => ({
      toggle: getComputedStyle(document.querySelector(".site-nav-toggle")!)
        .display,
      nav: getComputedStyle(document.querySelector(".site-nav")!).display,
    }));
    expect(waski.toggle).toBe("inline-flex");
    expect(
      waski.nav,
      "Nawigacja desktopowa musi zniknac, inaczej landmark nawigacji jest zdublowany",
    ).toBe("none");

    // Dokladnie jeden ujawniony landmark nawigacji — komentarz w komponencie
    // obiecuje to wprost (defekt POW-1), a nikt tego nie mierzyl.
    await otworzPanel(page);
    await expect(
      page.getByRole("navigation", { name: "Nawigacja mobilna" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Główna nawigacja" }),
    ).toBeHidden();
  });

  test("przelacznik ma nazwe dostepna, stan i powiazanie z panelem", async ({
    page,
  }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");

    // Nazwa dostepna liczona przez przegladarke, nie czytana z atrybutu —
    // `toHaveAccessibleName` przechodzi tym samym algorytmem co czytnik ekranu.
    await expect(przelacznik(page)).toHaveAccessibleName("Otwórz menu");
    await otworzPanel(page);
    await expect(przelacznik(page)).toHaveAccessibleName("Zamknij menu");

    // `aria-controls` musi wskazywac NA ISTNIEJACY panel. Samo obecnosc
    // atrybutu nic nie znaczy, jesli id nie ma odpowiednika w dokumencie.
    const controls = await przelacznik(page).getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    await expect(panel(page)).toHaveAttribute("id", controls!);

    // Panel wnosi wlasny landmark z nazwa — inaczej czytnik oglasza
    // "nawigacja" dwa razy bez rozroznienia.
    await expect(panel(page)).toHaveAttribute(
      "aria-label",
      "Nawigacja mobilna",
    );
  });

  /**
   * UX-D2 (ISK-406): panelu nie dalo sie zamknac klawiatura. Escape musi go
   * zamknac I oddac fokus przelacznikowi — panel znika z drzewa, wiec fokus
   * nie moze zostac na elemencie, ktorego juz nie ma.
   */
  test("Escape zamyka panel i oddaje fokus przelacznikowi (UX-D2)", async ({
    page,
  }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");
    await otworzPanel(page);

    await page.keyboard.press("Escape");

    await expect(przelacznik(page)).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page)).toHaveCount(0);
    await expect(
      przelacznik(page),
      "Po Escape fokus musi wrocic na przelacznik — panel wyszedl z drzewa",
    ).toBeFocused();

    // Escape z fokusem na linku panelu, nie tylko na przelaczniku: zdarzenie
    // musi dobabelkowac z wnetrza panelu.
    await otworzPanel(page);
    await panel(page).getByRole("link").first().focus();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(przelacznik(page)).toBeFocused();
  });

  test("przelacznik i linki otwartego panelu maja cel dotykowy 44x44 px", async ({
    page,
  }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");
    await otworzPanel(page);

    // SZEROKOSC I WYSOKOSC. Bramka w `fundament-ui.spec.ts` mierzyla do
    // ISK-411 tylko wysokosc, wiec kontrolka 20x44 przechodzila test nazwany
    // „co najmniej 44 px".
    const male = (
      await pudelka(page, ".site-nav-toggle, .site-nav-panel-link")
    ).filter((b) => b.width < MIN_CEL_PX - 0.5 || b.height < MIN_CEL_PX - 0.5);

    expect(
      male,
      `Cele dotykowe ponizej ${MIN_CEL_PX} px: ${male
        .map((m) => `${m.opis} ${m.width}x${m.height}`)
        .join("; ")}`,
    ).toEqual([]);

    // Pomiar musi miec na czym stac — pusty zestaw przeszedlby powyzej.
    expect(await przelacznik(page).count()).toBe(1);
    expect(await panel(page).getByRole("link").count()).toBeGreaterThan(1);
  });

  test("linki otwartego panelu spelniaja kontrast AA", async ({ page }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");
    await otworzPanel(page);

    const probki = await contrastSamples(page, ".site-nav-panel-link");
    expect(
      probki.length,
      "Brak probek — panel nie byl otwarty",
    ).toBeGreaterThan(1);

    const zaslabe = probki.filter((s) => s.ratio < s.required);
    expect(
      zaslabe,
      `Linki panelu ponizej progu AA:\n${zaslabe.map(formatSample).join("\n")}`,
    ).toEqual([]);
  });

  test("otwarty panel nie wypycha niczego poza kadr przy 360 px", async ({
    page,
  }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");
    await otworzPanel(page);

    // Pomiar na dzieciach, nie `document.scrollWidth` — patrz `helpers/uklad.ts`.
    const metryki = await zmierzPrzepelnienie(page);
    expect(
      metryki.winowajcy,
      `Otwarty panel @ 360px: elementy poza kadrem (${metryki.winowajcy.length}):\n${metryki.winowajcy.join(
        "\n",
      )}`,
    ).toEqual([]);
  });

  /**
   * CTA nie moze schowac sie do panelu — ukrycie glownej sciezki konwersji na
   * telefonie bylo juz raz defektem. `ux-blockers.spec.ts` mierzy to przy
   * ZAMKNIETYM panelu; tu dokladamy stan otwarty, bo panel wsuwa sie pod pasek
   * i mogl by go przykryc.
   */
  test("CTA zostaje widoczne takze przy otwartym panelu", async ({ page }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");
    await otworzPanel(page);

    const cta = page.locator(".site-header-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toBeInViewport();
  });

  for (const path of WIDOKI) {
    test(`${path} @ 360px z otwartym panelem: axe bez naruszen i dokladnie jeden h1`, async ({
      page,
    }) => {
      await page.setViewportSize(WASKI);
      const response = await page.goto(path);
      // Skan strony bledu nie dowodzilby niczego o ukladzie.
      expect(response?.status()).toBe(200);

      await otworzPanel(page);

      expect(await naruszeniaKrytyczne(page)).toEqual([]);

      // Panel nie moze wnosic drugiego `h1` ani lamac hierarchii naglowkow.
      const poziomy = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
          Number(h.tagName.slice(1)),
        ),
      );
      expect(
        poziomy.filter((l) => l === 1).length,
        `Oczekuje dokladnie jednego h1, jest: ${poziomy.filter((l) => l === 1).length}`,
      ).toBe(1);
      for (let i = 1; i < poziomy.length; i++) {
        expect(
          poziomy[i]! - poziomy[i - 1]!,
          `Przeskok h${poziomy[i - 1]} -> h${poziomy[i]} w ${path}; hierarchia: ${poziomy.join(",")}`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  /**
   * RAMIE NEGATYWNE — wymagane przez DoD karty.
   *
   * Dowodzi, ze skan wyzej jest FALSYFIKOWALNY. Zdejmujemy przyciskowi nazwe
   * dostepna dokladnie tak, jak opisuje scenariusz awarii z karty, i zadamy,
   * zeby ta sama funkcja `naruszeniaKrytyczne` zwrocila `button-name`.
   *
   * Psujemy OBA mozliwe nosniki nazwy — `aria-label` (stan po ISK-411) oraz
   * tekst w `.ui-visually-hidden` (stan przed) — wiec ramie zostaje wazne
   * takze wtedy, gdy ktos wroci do poprzedniej konstrukcji.
   */
  test("ramie negatywne: zdjecie nazwy dostepnej przelacznika wywraca skan", async ({
    page,
  }) => {
    await page.setViewportSize(WASKI);
    await page.goto("/");
    await otworzPanel(page);

    // Punkt odniesienia: w stanie produktu bramka jest zielona.
    expect(
      await naruszeniaKrytyczne(page),
      "Bramka musi byc zielona PRZED wstrzyknieciem defektu",
    ).toEqual([]);

    await page.evaluate(() => {
      const toggle = document.querySelector(".site-nav-toggle")!;
      toggle.removeAttribute("aria-label");
      toggle.removeAttribute("title");
      // Nosnik sprzed ISK-411: tekst dla czytnika ekranu w ukrytym spanie.
      for (const el of toggle.querySelectorAll(".ui-visually-hidden")) {
        el.textContent = "";
      }
    });

    // Najpierw sam fakt: przycisk nie ma juz nazwy.
    await expect(przelacznik(page)).toHaveAccessibleName("");

    // I teraz to, o co chodzi — bramka to WIDZI.
    const naruszenia = await naruszeniaKrytyczne(page);
    expect(
      naruszenia.join("\n"),
      "Po zdjeciu nazwy skan MUSI zglosic button-name — inaczej bramka nic nie pilnuje",
    ).toContain("button-name");
  });
});
