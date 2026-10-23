/**
 * ISK-400 — bramka pomiarowa fundamentu UI.
 *
 * DLACZEGO TEN PLIK ISTNIEJE
 * Testy jednostkowe (`tests/unit/ui-komponenty.test.ts`) dowodza, ze komponent
 * wypisuje nazwe klasy. NIE dowodza, ze ta klasa cokolwiek robi. W Tailwindzie
 * v4 warstwa `utilities` wygrywa z `components`, a nazwa tokenu wpisana
 * w przestrzen utility moze PRZESLONIC wbudowana klase — projekt stracil tak
 * caly uklad strony, gdy `--spacing-container` przeslonilo `max-w-container`
 * (ISK-355). Czytanie CSS tego nie pokaze: regula jest w pliku, po prostu
 * przegrywa kaskade. Dlatego kazda wartosc nizej jest ZMIERZONA przez
 * `getComputedStyle` w prawdziwej przegladarce, z prawdziwym arkuszem.
 *
 * DLACZEGO WSTRZYKUJEMY MARKUP, A NIE DODAJEMY TRASY
 * Fundament nie ma jeszcze widokow (te buduja M2 i M3), a dodanie publicznej
 * trasy `/_ds` wymagaloby decyzji o `robots`, indeksowaniu i bramce
 * srodowiskowej — czyli powierzchni poza zakresem ISK-400. Zamiast tego
 * wchodzimy na istniejaca strone (arkusz i kroj sa wtedy te same, co
 * w produkcie) i wstrzykujemy markup WYRENDEROWANY Z TYCH SAMYCH KOMPONENTOW
 * przez `react-dom/server`. Gdyby fixture byl recznie pisanym HTML-em,
 * literowka w nazwie klasy dawalaby zielony test dla martwej reguly.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  createElement,
  type FunctionComponent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "../../components/ui/field";
import {
  FilterPillToggle,
  filterPillClassName,
} from "../../components/ui/filter-pill";
import { IconChip } from "../../components/ui/icon-chip";
import { PageHeader } from "../../components/ui/page-header";
import { SectionHeading } from "../../components/ui/section-heading";
import { SegmentedControl } from "../../components/ui/segmented-control";
import { contrastSamples, formatSample } from "./helpers/kontrast";

type AnyProps = Record<string, unknown>;

/**
 * `createElement` z dziecmi w trzecim argumencie nie zasila wymaganego
 * `children` w typie propsow (ograniczenie typow Reacta). Helper zdejmuje
 * `children` z kontraktu sprawdzanego dla `props`, zostawiajac pelne
 * sprawdzanie pozostalych propsow.
 */
function h(
  type: string,
  props?: AnyProps | null,
  ...kids: readonly ReactNode[]
): ReactElement;
function h<P extends object>(
  type: FunctionComponent<P>,
  props: Omit<P, "children"> & { children?: ReactNode },
  ...kids: readonly ReactNode[]
): ReactElement;
function h(
  type: string | FunctionComponent<AnyProps>,
  props?: AnyProps | null,
  ...kids: readonly ReactNode[]
): ReactElement {
  return createElement(
    type as FunctionComponent<AnyProps>,
    props as AnyProps,
    ...kids,
  );
}

/**
 * Makieta pomiarowa.
 *
 * Kazdy mierzony element nosi znacznik `m-*` w `className`. Znacznik NIE
 * istnieje w zadnym arkuszu — jest tylko uchwytem selektora, zeby pomiar nie
 * zalezal od nazw klas stylujacych, czyli od tego samego zalozenia, ktore
 * sprawdza. `data-m` nie przeszloby przez typy: `ComponentProps<"button">`
 * nie dopuszcza dowolnych atrybutow `data-*` poza JSX elementow wbudowanych.
 */
function makieta(): string {
  const opcje = [
    { value: "osoba", label: "Osoba indywidualna" },
    { value: "firma", label: "Firma" },
  ] as const;

  return renderToStaticMarkup(
    h(
      "div",
      { id: "ds", className: "ui-container" },
      // --- przyciski: cztery rozmiary x cztery warianty ---
      h(Button, { className: "m-btn-sm", size: "sm" }, "Przycisk 44"),
      h(Button, { className: "m-btn-md", size: "md" }, "Przycisk 46"),
      h(Button, { className: "m-btn-lg", size: "lg" }, "Przycisk 54"),
      h(Button, { className: "m-btn-xl", size: "xl" }, "Przycisk 56"),
      h(Button, { className: "m-btn-ghost", variant: "ghost" }, "Ghost"),
      h(
        Button,
        { className: "m-btn-neutral", variant: "neutral" },
        "Neutralny",
      ),
      h(Button, { className: "m-btn-off", disabled: true }, "Nieaktywny"),
      // --- karty ---
      h(Card, { className: "m-card" }, "Karta nieklikalna"),
      // --- chipy ---
      h(IconChip, { className: "m-chip-md", size: "md", icon: "leaf" }),
      h(IconChip, { className: "m-chip-lg", size: "lg", icon: "cpu" }),
      h(IconChip, { className: "m-chip-xl", size: "xl", icon: "award" }),
      h(IconChip, { className: "m-chip-solid", tone: "solid", icon: "search" }),
      // Nosnik `--gradient-brand`. Gradient mierzymy na ZASTOSOWANYM
      // `background-image`, a nie na tekscie tokenu — patrz komentarz przy
      // asercjach tokenow.
      h(IconChip, { className: "m-chip-brand", tone: "brand", icon: "leaf" }),
      // --- badge ---
      h(Badge, { className: "m-badge-tint", tone: "tint" }, "Dofinansowanie"),
      h(
        Badge,
        { className: "m-badge-outline", tone: "outline" },
        "Nowy termin",
      ),
      h(Badge, { className: "m-badge-soft", tone: "soft" }, "ESG"),
      h(Badge, { className: "m-badge-solid", tone: "solid" }, "AI"),
      // --- naglowki ---
      h(SectionHeading, {
        eyebrow: "Obszary kompetencji",
        title: "Kompetencje, ktore buduja przewage",
        lead: "Akapit wprowadzajacy sekcji.",
      }),
      h(PageHeader, {
        eyebrow: "Katalog szkolen",
        title: "Znajdz szkolenie dla siebie lub zespolu",
        lead: "Opis katalogu.",
      }),
      // --- pola ---
      h(
        Field,
        { id: "m-imie", label: "Imie i nazwisko", hint: "Tak jak w umowie" },
        h(Input, { className: "m-input", id: "m-imie", hint: true }),
      ),
      h(
        Field,
        { id: "m-kat", label: "Kategoria" },
        h(
          Select,
          { className: "m-select", id: "m-kat" },
          h("option", { value: "ai" }, "AI"),
        ),
      ),
      h(
        Field,
        { id: "m-msg", label: "Wiadomosc" },
        h(Textarea, { className: "m-textarea", id: "m-msg" }),
      ),
      h(Checkbox, {
        className: "m-checkbox-input",
        id: "m-rodo",
        label: "Zgadzam sie na przetwarzanie danych w celu odpowiedzi.",
      }),
      // --- przelacznik segmentowy ---
      h(SegmentedControl, {
        name: "m-aud",
        legend: "Dla kogo",
        options: opcje,
        value: "osoba",
        tone: "green",
      }),
      h(SegmentedControl, {
        name: "m-aud2",
        legend: "Typ zgloszenia",
        options: opcje,
        value: "firma",
        tone: "white",
      }),
      // --- pigulki filtra ---
      // `FilterPillLink` renderuje `next/link`, czyli `<a>` z dokladnie ta
      // klasa — a `next/link` nie da sie wczytac w loaderze Playwrighta.
      // Pomiar dotyczy CSS, wiec bierzemy element koncowy i klase z helpera;
      // ze komponent te klase wypisuje, dowodzi test jednostkowy.
      h(
        "a",
        {
          className: filterPillClassName({
            active: true,
            className: "m-pill-active",
          }),
          href: "#",
          "aria-current": "page",
        },
        "AI",
      ),
      h(FilterPillToggle, { className: "m-pill-off" }, "ESG"),
      // --- kontrola kolizji nazw z utilities Tailwinda ---
      // `max-w-max` i `max-w-container` MUSZA dalej dzialac po dodaniu
      // `--container-max` i `--container-pad`. To jest sedno ISK-355.
      h("div", { className: "m-tw-max-w-max max-w-max" }, "x"),
      h("div", { className: "m-tw-max-w-container max-w-container" }, "x"),
      h("div", { className: "m-ui-section ui-section" }, "x"),
    ),
  );
}

/**
 * Montuje makiete w dokumencie o TYM SAMYM arkuszu, co produkt.
 *
 * Dlaczego nie `insertAdjacentHTML` na zyjacej stronie: `<body>` jest
 * kontenerem Reacta, wiec wezel wstrzyknity przed hydratacja zostaje przez
 * nia usuniety jako niezgodny z drzewem wirtualnym — pierwsza wersja tego
 * testu padala na "element(s) not found" i wygladalo to na zly selektor, a nie
 * na hydratacje. Dlatego: wchodzimy na strone RAZ, zabieramy z niej arkusz
 * i budujemy z tego osobny dokument przez `setContent`.
 *
 * DLACZEGO WKLEJAMY TRESC ARKUSZA, A NIE `<link>` Z `<head>`
 * Pierwsza wersja przenosila caly `<head>`, czyli `<link rel="stylesheet">`
 * z `/_next/...`. Nowy dokument musial wtedy POBRAC arkusz ponownie, a Next
 * w trybie dev wystawia go w dwoch plikach. Przy pelnym przebiegu (osiem
 * workerow uderza w niezkompilowany serwer dev naraz) pobranie bywalo
 * niekompletne i pomiar schodzil na STYL DOMYSLNY PRZEGLADARKI — a ten czyta
 * sie jak defekt projektowy, nie jak brak arkusza. Zmierzone objawy: kontrast
 * „1,99:1" na przycisku nieaktywnym (`rgba(16,16,16,0.3)` to kolor UA dla
 * `button[disabled]`, nie nasz token) i „1:1" na pigulce aktywnej, podczas
 * gdy oba elementy mierzone pojedynczo byly poprawne (biel na green-700).
 * Zabieramy wiec REGULY, nie odnosniki: `cssText` w kolejnosci arkuszy
 * i regul, wklejone jako jeden `<style>`. Fixture nie ma juz zadnego zadania
 * sieciowego na CSS, a jeden `<style>` zachowuje kolejnosc `@layer`
 * (`theme, base, components, utilities`), od ktorej zalezy, czy `.ui-*`
 * z warstwy `components` w ogole wygrywa.
 *
 * `<script>` nie jedzie swiadomie: inaczej runtime Next.js probowalby
 * hydratowac dokument, ktory nie jest jego drzewem.
 *
 * Klasa z `<html>` jedzie razem — to na niej `next/font/local` ustawia
 * `--font-inter`, bez niej pomiar typografii leciałby krojem systemowym
 * (ten sam defekt co ISK-364 / B2). `@font-face` przychodzi z trescia
 * arkusza, a `url()` kroju jest sciezka absolutna (`/_next/static/media/...`),
 * wiec przeniesienie regul nie psuje jej rozwiazywania.
 */
async function zamontuj(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 1200 });
  await page.goto("/");

  /** Tresc wszystkich arkuszy strony, w kolejnosci wystapienia. */
  const zbierzCss = () =>
    page.evaluate(() =>
      Array.from(document.styleSheets)
        .map((sheet) => {
          try {
            return Array.from(sheet.cssRules)
              .map((rule) => rule.cssText)
              .join("\n");
          } catch {
            // Arkusz z innego zrodla — `cssRules` rzuca. Nasze sa wlasne.
            return "";
          }
        })
        .join("\n"),
    );

  // Arkusz musi byc zaladowany i SPARSOWANY, zanim go zabierzemy. Sprawdzamy
  // to regula, ktora na pewno istnieje w arkuszu produktu — bez niej
  // skopiowalibysmy pusty napis i caly pomiar poszedlby na stylu domyslnym.
  await expect
    .poll(async () => (await zbierzCss()).includes(".ui-button-primary"), {
      message: "Arkusz produktu nie zawiera regul .ui-* — nie ma czego mierzyc",
    })
    .toBe(true);

  const szkielet = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    bodyClass: document.body.className,
  }));
  const css = await zbierzCss();

  await page.setContent(
    `<!doctype html><html class="${szkielet.htmlClass}"><head><style>${css}</style></head>` +
      `<body class="${szkielet.bodyClass}"><main>${makieta()}</main></body></html>`,
    { waitUntil: "load" },
  );

  // WARUNKI WSTEPNE POMIARU. Jesli ktorys nie zachodzi, to NIE jest defekt
  // projektowy — to niekompletny fixture, i ma sie zglaszac wlasnym
  // komunikatem, a nie jako „kontrast ponizej AA" piec asercji dalej.
  await expect(page.locator("#ds")).toBeVisible();
  const wstepne = await page.evaluate(() => {
    const btn = document.querySelector("#ds .m-btn-md");
    const pill = document.querySelector("#ds .m-pill-active");
    return {
      makietaKompletna: Boolean(btn) && Boolean(pill),
      promien: btn ? getComputedStyle(btn).borderTopLeftRadius : null,
      tloPrimary: btn ? getComputedStyle(btn).backgroundColor : null,
    };
  });
  expect(
    wstepne.makietaKompletna,
    "Makieta wstawila sie niekompletnie — brak .m-btn-md albo .m-pill-active",
  ).toBe(true);
  // Dwie wlasciwosci z DWOCH roznych regul warstwy `components`: sama
  // `.ui-button` (promien) i wariant `.ui-button-primary` (tlo). Zmierzony
  // przebieg mial juz stan, w ktorym promien byl poprawny, a tlo wariantu
  // zostalo przezroczyste — jedna wlasciwosc tego nie wylapuje.
  expect(
    wstepne.promien,
    "Arkusz nie zastosowal sie: .ui-button nie ma promienia",
  ).not.toBe("0px");
  expect(
    wstepne.tloPrimary,
    "Arkusz nie zastosowal sie: .ui-button-primary nie ma tla",
  ).toBe("rgb(30, 85, 29)");
}

/**
 * Wartosc bez bialych znakow — do porownywania TEKSTU wlasciwosci
 * niestandardowej, ktory arkusz produkcyjny oddaje zminifikowany
 * (`clamp(4rem, 9vw, 7.5rem)` w `next dev`, `clamp(4rem,9vw,7.5rem)`
 * po `next build`). Stosowane do OBU stron porownania, wiec tresc jest dalej
 * sprawdzana dokladnie — poza samym formatowaniem, ktore nie jest wymaganiem.
 */
const bezSpacji = (value: string) => value.replace(/\s+/g, "");

/** Zmierzone wlasciwosci jednego elementu makiety. */
async function zmierz(
  page: Page,
  marker: string,
  props: readonly string[],
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ marker, props }) => {
      const el = document.querySelector(`#ds .m-${marker}`);
      if (!el) throw new Error(`Brak elementu makiety: ${marker}`);
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const out: Record<string, string> = {
        width: String(box.width),
        height: String(box.height),
      };
      for (const p of props) out[p] = style.getPropertyValue(p);
      return out;
    },
    { marker, props },
  );
}

test.describe("ISK-400 — tokeny rytmu i formy", () => {
  test("tokeny maja zmierzone wartosci wzorca", async ({ page }) => {
    await zamontuj(page);

    const tokeny = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const read = (name: string) => root.getPropertyValue(name).trim();
      return {
        sectionPadY: read("--section-pad-y"),
        containerMax: read("--container-max"),
        containerPad: read("--container-pad"),
        radiusCard: read("--radius-card"),
        radiusPanel: read("--radius-panel"),
        radiusPill: read("--radius-pill"),
        focusRingWidth: read("--focus-ring-width"),
        focusRingOffset: read("--focus-ring-offset"),
        controlSm: read("--control-h-sm"),
        fieldH: read("--field-h"),
      };
    });

    // Rytm — wartosci z `_ds/tokens/spacing.css`.
    //
    // Porownanie bez bialych znakow, bo wartosc wlasciwosci niestandardowej
    // to TEKST tokenu, oddawany tak, jak stoi w arkuszu — a arkusz
    // produkcyjny jest zminifikowany. Zmierzone: `next dev` daje
    // „clamp(4rem, 9vw, 7.5rem)", `next build` to samo bez spacji. Tresc
    // (kazda liczba i jednostka) jest dalej sprawdzana dokladnie; nie
    // sprawdzamy wylacznie formatowania, ktore nie jest wymaganiem.
    expect(bezSpacji(tokeny.sectionPadY)).toBe(
      bezSpacji("clamp(4rem, 9vw, 7.5rem)"),
    );
    expect(bezSpacji(tokeny.containerPad)).toBe(
      bezSpacji("clamp(1.25rem, 5vw, 3rem)"),
    );
    // 75rem = 1200 px. Token trzymamy w `rem`, bo cala skala promieni
    // i odstepow w `@theme` jest w `rem`.
    expect(tokeny.containerMax).toBe("75rem");
    // Promienie: karty 16 px, panele 32 px, pastylka.
    expect(tokeny.radiusCard).toBe("1rem");
    expect(tokeny.radiusPanel).toBe("2rem");
    expect(tokeny.radiusPill).toBe("999px");
    // Pierscien focusu: 3 px + offset 2 px.
    expect(tokeny.focusRingWidth).toBe("3px");
    expect(tokeny.focusRingOffset).toBe("2px");
    // 44 px to minimum celu dotykowego — token, nie liczba w regule.
    expect(tokeny.controlSm).toBe("44px");
    expect(tokeny.fieldH).toBe("46px");
  });

  /**
   * Cien marki i gradient marki — mierzone na ZASTOSOWANEJ wlasciwosci,
   * nie na tekscie tokenu.
   *
   * Tekst tokenu niesie kolor w zapisie z arkusza, a minifikacja go
   * przepisuje: `--shadow-brand` to w `next dev`
   * `... rgb(30 85 29 / 0.35)`, a po `next build` `... #1e551d59`. Asercja
   * `toContain("30 85 29")` przechodzila wiec lokalnie i padala na artefakcie
   * produkcyjnym — czyli dokladnie tam, gdzie mierzy CI (`PLAYWRIGHT_USE_BUILD`).
   * Wlasciwosci `box-shadow` i `background-image` sa inne: przegladarka
   * NORMALIZUJE w nich kolor do `rgb()/rgba()`. Zmierzone w obu trybach —
   * wynik identyczny co do znaku. Dlatego mierzymy skutek, a nie zapis;
   * to przy okazji mocniejsza asercja, bo dowodzi, ze token zostal
   * ZASTOSOWANY, a nie tylko zadeklarowany.
   */
  test("cien i gradient marki sa zielone w zastosowanej wlasciwosci", async ({
    page,
  }) => {
    await zamontuj(page);

    const zastosowane = await page.evaluate(() => {
      const btn = document.querySelector("#ds .m-btn-md")!;
      const chip = document.querySelector("#ds .m-chip-brand")!;
      return {
        boxShadow: getComputedStyle(btn).boxShadow,
        backgroundImage: getComputedStyle(chip).backgroundImage,
      };
    });

    // Cien CTA jest zielono-podbarwiony (green-700), nie czarny — to byl
    // wymog karty, a czarny cien jest najczestszym odstepstwem od wzorca.
    expect(zastosowane.boxShadow).toContain("rgba(30, 85, 29");
    expect(zastosowane.boxShadow).not.toContain("rgba(0, 0, 0");
    // ...i naprawde jest cieniem, a nie samym kolorem.
    expect(zastosowane.boxShadow).toContain("12px 30px -10px");

    // Gradient marki: green-500 -> green-700 (60%) -> green-900, 120deg.
    // ISK-410: pierwszy stopien to `rgb(82, 128, 28)` (#52801c), nie
    // `rgb(84, 132, 29)` (#54841d). Stara wartosc dawala bieli 4,4726:1 przy
    // wymaganych 4,5:1, wiec token zostal przyciemniony — ta asercja celowo
    // trzyma konkretne liczby, zeby zmiana tokenu nie przeszla niezauwazona.
    expect(zastosowane.backgroundImage).toContain("120deg");
    expect(zastosowane.backgroundImage).toContain("rgb(82, 128, 28) 0%");
    expect(zastosowane.backgroundImage).toContain("rgb(30, 85, 29) 60%");
    expect(zastosowane.backgroundImage).toContain("rgb(10, 52, 0) 100%");
  });

  /**
   * ISK-418 ODWRACA kontrakt tego testu.
   *
   * Do ISK-418 test wymagal, zeby `--focus-ring` BYL polprzezroczysty
   * (alfa 0,4..0,7) — i wlasnie ta cecha byla defektem F9: kolor pierscienia
   * zalezal wtedy od tla i na wszystkich czterech rodzinach powierzchni
   * wychodzil ponizej progu 3:1 z WCAG 2.1 SC 1.4.11 (biel 2,11, ink-900
   * 2,07, green-700 1,45, green-50 2,04). Test byl zielony przez caly ten
   * czas, bo mierzyl ZGODNOSC Z ZAMYSLEM, a nie widocznosc wskaznika.
   *
   * Nowy kontrakt jest odwrotny: oba tony sa NIEPRZEZROCZYSTE, wiec ich
   * kontrast nie zalezy od tego, na czym leza. Same wartosci kontrastu
   * mierza `tests/unit/pierscien-focusu.test.ts` (dowolne tlo, arytmetycznie)
   * i `tests/e2e/pierscien-focusu.spec.ts` (faktyczne przystanki Tab).
   */
  test("`--focus-ring` i `--focus-ring-contrast` sa nieprzezroczyste", async ({
    page,
  }) => {
    await zamontuj(page);

    const tony = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      // Alfa czytana z canvasa, nie parsowana z napisu: przegladarka potrafi
      // oddac kolor jako `color(srgb ...)`, ktorego regexp na `rgb(...)`
      // nie zlapie (pulapka zapisana na ISK-399).
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const czytaj = (nazwa: string) => {
        const value = root.getPropertyValue(nazwa).trim();
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return { value, rgb: [d[0]!, d[1]!, d[2]!], alpha: d[3]! / 255 };
      };
      return {
        rdzen: czytaj("--focus-ring"),
        obwodka: czytaj("--focus-ring-contrast"),
      };
    });

    expect(tony.rdzen.alpha).toBe(1);
    expect(tony.obwodka.alpha).toBe(1);
    // Rdzen to ciemna zielen marki (green-800), obwodka to biel.
    expect(tony.rdzen.rgb).toEqual([18, 63, 20]);
    expect(tony.obwodka.rgb).toEqual([255, 255, 255]);
  });

  test("nowe tokeny NIE przeslonily utilities Tailwinda (regresja ISK-355)", async ({
    page,
  }) => {
    await zamontuj(page);

    // `--container-max` w `@theme` wygenerowaloby `max-w-max`, przeslaniajac
    // wbudowane `max-width: max-content`. Dlatego token siedzi w `:root`.
    const twMax = await zmierz(page, "tw-max-w-max", ["max-width"]);
    expect(twMax["max-width"]).toBe("max-content");

    // Istniejace `max-w-container` (= `--container-container`, 75rem) dalej zyje.
    const twContainer = await zmierz(page, "tw-max-w-container", ["max-width"]);
    expect(twContainer["max-width"]).toBe("1200px");

    // ...a nasza wlasna klasa daje te sama szerokosc i padding wzorca.
    const kontener = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector("#ds")!);
      return { maxWidth: style.maxWidth, padLeft: style.paddingLeft };
    });
    expect(kontener.maxWidth).toBe("1200px");
    // clamp(1.25rem, 5vw, 3rem) @1440 px -> 48 px (gorna granica).
    expect(kontener.padLeft).toBe("48px");

    // Rytm sekcji @1440 px: clamp(64, 129.6, 120) -> 120 px.
    const sekcja = await zmierz(page, "ui-section", ["padding-top"]);
    expect(sekcja["padding-top"]).toBe("120px");
  });
});

test.describe("ISK-400 — komponenty: zmierzone wymiary i kolory", () => {
  test("przyciski maja cztery wysokosci i pastylkowy promien", async ({
    page,
  }) => {
    await zamontuj(page);

    for (const [marker, oczekiwana] of [
      ["btn-sm", 44],
      ["btn-md", 46],
      ["btn-lg", 54],
      ["btn-xl", 56],
    ] as const) {
      const m = await zmierz(page, marker, ["border-radius"]);
      expect(Number(m.height), `${marker} ma inna wysokosc`).toBeCloseTo(
        oczekiwana,
        1,
      );
      // Pastylka: promien >= polowa wysokosci. 999px jest clampowane
      // przez przegladarke do realnej geometrii, wiec mierzymy relacje.
      expect(parseFloat(m["border-radius"]!)).toBeGreaterThanOrEqual(
        oczekiwana / 2,
      );
    }
  });

  test("primary jest green-700 z cieniem marki, ghost ma krawedz 1.5px", async ({
    page,
  }) => {
    await zamontuj(page);

    const primary = await zmierz(page, "btn-md", [
      "background-color",
      "color",
      "box-shadow",
    ]);
    expect(primary["background-color"]).toBe("rgb(30, 85, 29)");
    expect(primary.color).toBe("rgb(255, 255, 255)");
    expect(primary["box-shadow"]).not.toBe("none");
    // Cien jest zielono-podbarwiony, nie czarny.
    expect(primary["box-shadow"]).toContain("30, 85, 29");

    const ghost = await zmierz(page, "btn-ghost", [
      "border-top-width",
      "border-top-color",
      "background-color",
      "color",
    ]);
    // UWAGA, zmierzone zachowanie platformy: Chromium podlogowuje szerokosc
    // krawedzi do pelnego piksela URZADZENIA, wiec `border-width: 1.5px`
    // computed style zwraca przy DPR 1 jako `1px`. To nie jest defekt CSS —
    // sama wartosc 1,5 px jest w tokenie (sprawdza ja test tokenow) i widac ja
    // na ekranie HiDPI (test "krawedz marki ma 1,5 px przy DPR 2" nizej).
    // Asercja na `"1.5px"` przy DPR 1 byla po prostu bledna.
    expect(parseFloat(ghost["border-top-width"]!)).toBeGreaterThanOrEqual(1);
    expect(ghost["border-top-color"]).toBe("rgb(30, 85, 29)");
    expect(ghost.color).toBe("rgb(30, 85, 29)");
    // Tlo przezroczyste — inaczej ghost nie bylby ghostem.
    expect(ghost["background-color"]).toBe("rgba(0, 0, 0, 0)");
  });

  test("przycisk nieaktywny jest wyciszony i bez cienia", async ({ page }) => {
    await zamontuj(page);
    const off = await zmierz(page, "btn-off", ["opacity", "box-shadow"]);
    expect(parseFloat(off.opacity!)).toBeLessThan(0.7);
    expect(off["box-shadow"]).toBe("none");
  });

  test("karta ma promien 16 px, krawedz subtle i cien spoczynkowy", async ({
    page,
  }) => {
    await zamontuj(page);
    const card = await zmierz(page, "card", [
      "border-radius",
      "border-top-width",
      "border-top-color",
      "background-color",
      "box-shadow",
      "transition-property",
    ]);
    expect(card["border-radius"]).toBe("16px");
    expect(card["border-top-width"]).toBe("1px");
    expect(card["border-top-color"]).toBe("rgb(231, 234, 226)"); // neutral-200
    expect(card["background-color"]).toBe("rgb(255, 255, 255)");
    expect(card["box-shadow"]).not.toBe("none");
    // Karta NIEKLIKALNA nie animuje sie — wzorzec podnosi tez takie karty.
    expect(card["transition-property"]).toBe("all");
  });

  test("chipy ikon maja zmierzone krawedzie 40/48/56 px", async ({ page }) => {
    await zamontuj(page);
    for (const [marker, px] of [
      ["chip-md", 40],
      ["chip-lg", 48],
      ["chip-xl", 56],
    ] as const) {
      const m = await zmierz(page, marker, ["border-radius"]);
      expect(Number(m.width), marker).toBeCloseTo(px, 1);
      expect(Number(m.height), marker).toBeCloseTo(px, 1);
      // Zaokraglony kwadrat (12 px), nie krazek.
      expect(m["border-radius"]).toBe("12px");
    }

    const solid = await zmierz(page, "chip-solid", [
      "background-color",
      "color",
    ]);
    expect(solid["background-color"]).toBe("rgb(30, 85, 29)");
    expect(solid.color).toBe("rgb(255, 255, 255)");
  });

  test("pola maja 46 px, promien 12 px i krawedz default", async ({ page }) => {
    await zamontuj(page);
    const input = await zmierz(page, "input", [
      "border-radius",
      "border-top-width",
      "border-top-color",
    ]);
    expect(Number(input.height)).toBeCloseTo(46, 1);
    expect(input["border-radius"]).toBe("12px");
    expect(input["border-top-width"]).toBe("1px");
    expect(input["border-top-color"]).toBe("rgb(212, 217, 205)"); // neutral-300

    // Textarea rosnie, ale dziedziczy promien i krawedz.
    const ta = await zmierz(page, "textarea", ["border-radius", "resize"]);
    expect(Number(ta.height)).toBeGreaterThan(46);
    expect(ta["border-radius"]).toBe("12px");
    expect(ta.resize).toBe("vertical");
  });

  test("Select zdejmuje karet systemowy i rysuje wlasny", async ({ page }) => {
    await zamontuj(page);
    const select = await zmierz(page, "select", [
      "appearance",
      "padding-right",
    ]);
    // `appearance: none` bez narysowanej strzalki to wada wzorca.
    expect(select.appearance).toBe("none");
    expect(select["padding-right"]).toBe("40px");

    // Strzalka istnieje, ma wymiar i NIE przechwytuje klikniecia.
    const caret = await page.evaluate(() => {
      const el = document.querySelector("#ds .ui-select-caret");
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return {
        pointerEvents: getComputedStyle(el).pointerEvents,
        width: box.width,
        height: box.height,
      };
    });
    expect(caret).not.toBeNull();
    expect(caret!.width).toBeGreaterThan(0);
    expect(caret!.height).toBeGreaterThan(0);
    expect(caret!.pointerEvents).toBe("none");
  });

  test("focus pola podmienia outline na widoczny pierscien", async ({
    page,
  }) => {
    await zamontuj(page);
    await page.locator("#ds .m-input").focus();

    // `border-color` ma przejscie `--dur-fast` (130 ms). Pomiar natychmiast po
    // `focus()` lapie klatke posrednia — pierwsza wersja tego testu zmierzyla
    // `rgb(102, 137, 98)`, czyli kolor w polowie animacji, i wygladalo to na
    // zly token. Czekamy wiec na ustalenie sie wartosci, nie na staly czas.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(document.querySelector("#ds .m-input")!)
              .borderTopColor,
        ),
      )
      .toBe("rgb(30, 85, 29)");

    const focus = await zmierz(page, "input", [
      "outline-style",
      "outline-width",
      "box-shadow",
      "border-top-color",
    ]);
    // `outline: none` jest tu dopuszczalne WYLACZNIE dlatego, ze zastepuje go
    // mierzalny pierscien — i to wlasnie mierzymy.
    expect(focus["outline-style"]).toBe("none");
    expect(focus["box-shadow"]).not.toBe("none");
    expect(focus["box-shadow"]).not.toBe("");
    // Pierscien ma 3 px, tak jak outline bazowy.
    expect(focus["box-shadow"]).toContain("3px");
    // Krawedz pola przechodzi na green-700.
    expect(focus["border-top-color"]).toBe("rgb(30, 85, 29)");
  });

  test("naglowek sekcji: kreska 22x2 px i H2 o wadze 800", async ({ page }) => {
    await zamontuj(page);

    const dash = await page.evaluate(() => {
      const el = document.querySelector("#ds .ui-eyebrow-dash");
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        hidden: el.getAttribute("aria-hidden"),
      };
    });
    expect(dash).not.toBeNull();
    expect(dash!.width).toBeCloseTo(22, 1);
    expect(dash!.height).toBeCloseTo(2, 1);
    expect(dash!.hidden).toBe("true");

    const eyebrow = await page.evaluate(() => {
      const style = getComputedStyle(
        document.querySelector("#ds .ui-eyebrow")!,
      );
      return {
        transform: style.textTransform,
        tracking: style.letterSpacing,
        color: style.color,
        size: style.fontSize,
      };
    });
    expect(eyebrow.transform).toBe("uppercase");
    // 0.08em przy 13px = 1.04px.
    expect(parseFloat(eyebrow.tracking)).toBeCloseTo(1.04, 1);
    expect(eyebrow.color).toBe("rgb(46, 107, 30)"); // green-600

    const h2 = await page.evaluate(() => {
      const style = getComputedStyle(
        document.querySelector("#ds .ui-section-title")!,
      );
      return {
        weight: style.fontWeight,
        tracking: style.letterSpacing,
        size: parseFloat(style.fontSize),
      };
    });
    // Preflight Tailwinda zeruje wage naglowkow — mierzymy, ze nasza regula
    // wygrywa (ISK-364 / B2 to ten sam defekt).
    expect(h2.weight).toBe("800");
    expect(parseFloat(h2.tracking)).toBeLessThan(0);
    // clamp(2rem, 3.4vw, 2.6rem) @1440 px -> 2.6rem = 41.6 px.
    expect(h2.size).toBeCloseTo(41.6, 1);
  });

  test("PageHeader ma jedna szerokosc kolumny dla wszystkich podstron", async ({
    page,
  }) => {
    await zamontuj(page);
    const header = await page.evaluate(() => {
      const style = getComputedStyle(
        document.querySelector("#ds .ui-page-header")!,
      );
      const h1 = getComputedStyle(
        document.querySelector("#ds .ui-page-title")!,
      );
      return {
        maxWidth: style.maxWidth,
        marginBottom: style.marginBottom,
        h1Weight: h1.fontWeight,
      };
    });
    // Wzorzec ma 680 px w katalogu i 720 px u trenerow — zostaje jedna wartosc.
    expect(header.maxWidth).toBe("720px");
    expect(header.marginBottom).toBe("40px");
    expect(header.h1Weight).toBe("800");
  });
});

test.describe("ISK-400 — dostepnosc zmierzona", () => {
  /**
   * ISK-411: ta bramka mierzyla WYLACZNIE wysokosc (`box.height < 44 - 0.5`).
   * Szerokosc byla zbierana do komunikatu bledu i nigdy nie asertowana, wiec
   * pigulka 20x44 przechodzila test nazwany „co najmniej 44 px". WCAG 2.1 AA
   * 2.5.5 mowi o OBU wymiarach celu dotykowego.
   *
   * Drugi brak: filtry i kontrolka segmentowa byly mierzone tylko tutaj, i to
   * przy 1440 px. `.ui-segmented-option` ma `flex: 1 1 auto`, a `.ui-filterpill`
   * zawija sie — czyli oba moga zwezic sie dopiero na waskim ekranie, gdzie
   * nikt ich nie mierzyl. Dlatego ten sam pomiar chodzi teraz na 1440 i 360 px.
   */
  for (const szerokosc of [1440, 360]) {
    test(`kazda kontrolka ma co najmniej 44x44 px celu trafienia @ ${szerokosc}px`, async ({
      page,
    }) => {
      await zamontuj(page, szerokosc);

      const male = await page.evaluate(() => {
        const selektory = [
          "#ds .ui-button",
          "#ds .ui-filterpill",
          "#ds .ui-segmented-option",
          "#ds .ui-checkbox",
          "#ds .ui-field-control",
        ];
        const out: {
          selektor: string;
          text: string;
          w: number;
          h: number;
          wymiar: string;
        }[] = [];
        for (const s of selektory) {
          for (const el of document.querySelectorAll(s)) {
            const box = el.getBoundingClientRect();
            if (box.width === 0 && box.height === 0) continue;
            // Pola tekstowe maja 46 px z tokenu; pozostale kontrolki 44 px.
            const zaNiski = box.height < 44 - 0.5;
            const zaWaski = box.width < 44 - 0.5;
            if (zaNiski || zaWaski) {
              out.push({
                selektor: s,
                text: (el.textContent ?? "").trim().slice(0, 40),
                w: Math.round(box.width * 10) / 10,
                h: Math.round(box.height * 10) / 10,
                wymiar: [zaWaski && "szerokosc", zaNiski && "wysokosc"]
                  .filter(Boolean)
                  .join(" i "),
              });
            }
          }
        }
        return out;
      });

      expect(
        male,
        `Kontrolki ponizej 44 px @ ${szerokosc}px: ${male
          .map((m) => `${m.selektor} „${m.text}” ${m.w}x${m.h} (${m.wymiar})`)
          .join("; ")}`,
      ).toStrictEqual([]);

      // Pomiar musi miec na czym stac: gdyby harness przestal montowac
      // kontrolki, petla wyzej oddalaby pusta tablice i test bylby zielony.
      const zmierzone = await page.evaluate(
        () =>
          document.querySelectorAll(
            "#ds .ui-button, #ds .ui-filterpill, #ds .ui-segmented-option, #ds .ui-checkbox, #ds .ui-field-control",
          ).length,
      );
      expect(zmierzone, "Harness nie zamontowal kontrolek").toBeGreaterThan(10);
    });
  }

  test("przelacznik segmentowy ma semantyke grupy i stan zaznaczenia", async ({
    page,
  }) => {
    await zamontuj(page);

    const grupa = await page.evaluate(() => {
      const fs = document.querySelector("#ds fieldset.ui-segmented-group");
      if (!fs) return null;
      const radia = [...fs.querySelectorAll('input[type="radio"]')];
      return {
        legenda: fs.querySelector("legend")?.textContent ?? null,
        liczbaRadiow: radia.length,
        // Wzorzec ma tu `button`y — brak roli radio i brak stanu.
        zaznaczone: radia.filter((r) => (r as HTMLInputElement).checked).length,
        nazwy: new Set(radia.map((r) => (r as HTMLInputElement).name)).size,
      };
    });

    expect(grupa).not.toBeNull();
    expect(grupa!.legenda).toBe("Dla kogo");
    expect(grupa!.liczbaRadiow).toBe(2);
    expect(grupa!.zaznaczone).toBe(1);
    expect(grupa!.nazwy).toBe(1);
  });

  test("strzalki przechodza miedzy opcjami, Tab wchodzi do grupy raz", async ({
    page,
  }) => {
    await zamontuj(page);

    // Zachowanie natywne radiogrupy, ktorego wzorzec na `button`ach nie ma.
    await page.locator('#ds input[name="m-aud"]').first().focus();
    const przed = await page.evaluate(
      () => (document.activeElement as HTMLInputElement).value,
    );
    await page.keyboard.press("ArrowRight");
    const po = await page.evaluate(
      () => (document.activeElement as HTMLInputElement).value,
    );

    expect(przed).toBe("osoba");
    expect(po).toBe("firma");
    // Strzalka nie tylko przenosi focus — zmienia tez zaznaczenie.
    expect(
      await page.locator('#ds input[name="m-aud"][value="firma"]').isChecked(),
    ).toBe(true);
  });

  test("etykieta pola ustawia focus na kontrolce", async ({ page }) => {
    await zamontuj(page);

    // To dowodzi dzialania `label htmlFor` + `id`. We wzorcu etykieta jest
    // luznym `span`em albo owija pole bez `htmlFor`.
    await page.locator('#ds label[for="m-imie"]').click();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      "m-imie",
    );

    await page.locator('#ds label[for="m-rodo"]').click();
    expect(await page.locator("#m-rodo").isChecked()).toBe(true);
  });

  test("kontrast AA dla kazdego nowego tonu", async ({ page }) => {
    await zamontuj(page);

    const probki = [
      ...(await contrastSamples(page, "#ds .ui-button")),
      ...(await contrastSamples(page, "#ds .ui-badge")),
      ...(await contrastSamples(page, "#ds .ui-eyebrow")),
      ...(await contrastSamples(page, "#ds .ui-filterpill")),
      ...(await contrastSamples(page, "#ds .ui-segmented-option")),
      ...(await contrastSamples(page, "#ds .ui-field-label")),
      // Podpowiedz pola: wzorzec uzywa tu `--text-muted` (~3,8:1), czyli
      // ponizej AA. Bierzemy `secondary` — ten sam defekt co POW-4.
      ...(await contrastSamples(page, "#ds .ui-field-hint")),
      ...(await contrastSamples(page, "#ds .ui-checkbox")),
    ];

    // Probki musza istniec — pusty zbior dalby zielony test bez pomiaru.
    expect(probki.length).toBeGreaterThan(15);

    const zaNiskie = probki.filter((s) => s.ratio < s.required);
    expect(
      zaNiskie,
      `Kontrast ponizej AA: ${zaNiskie.map(formatSample).join(" | ")}`,
    ).toStrictEqual([]);
  });

  test("przycisk nieaktywny oglasza stan, nie tylko wyglada na wyciszony", async ({
    page,
  }) => {
    await zamontuj(page);
    const stan = await page.evaluate(() => {
      const el = document.querySelector("#ds .m-btn-off") as HTMLButtonElement;
      // `el.tabIndex` to atrybut IDL i dla `button` zwraca 0 NIEZALEZNIE od
      // `disabled` — asercja na -1 byla bledna. Mierzymy wiec skutek, czyli
      // czy focus da sie na elemencie postawic.
      el.focus();
      return {
        disabled: el.disabled,
        dostalFocus: document.activeElement === el,
      };
    });
    expect(stan.disabled).toBe(true);
    // Element nieaktywny wypada z kolejnosci Tab natywnie.
    expect(stan.dostalFocus).toBe(false);
  });
});

test.describe("ISK-400 — fundament nie przepelnia waskiego ekranu", () => {
  // `document.scrollWidth` NIE dowodzi braku przewijania: `overflow-x: hidden`
  // na kontenerze maskuje przepelnienie (pomiar z ISK-399 / M0 — wzorzec ma
  // przy 360 px dwanascie elementow poza viewportem). Mierzymy wiec prawe
  // krawedzie elementow potomnych.
  for (const width of [360, 768]) {
    test(`przy ${width} px zaden element fundamentu nie wychodzi za krawedz`, async ({
      page,
    }) => {
      await zamontuj(page, width);

      const poza = await page.evaluate((w) => {
        const out: { klasa: string; prawa: number; szerokosc: number }[] = [];
        for (const el of document.querySelectorAll("#ds *")) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.right > w + 1) {
            out.push({
              klasa: el.className.toString().slice(0, 60),
              prawa: Math.round(box.right),
              szerokosc: Math.round(box.width),
            });
          }
        }
        return out;
      }, width);

      expect(
        poza,
        `Elementy poza viewportem ${width} px: ${poza
          .map((p) => `${p.klasa} (prawa ${p.prawa}, szer. ${p.szerokosc})`)
          .join("; ")}`,
      ).toStrictEqual([]);
    });
  }
});

/**
 * ZAPIS ZMIERZONEGO FAKTU PLATFORMY — nie zmieniac bez decyzji bramki UX.
 *
 * Wzorzec daje przyciskom ghost, pigulkom filtra i chipom kompetencji
 * `border: 1.5px`, a przyciskom primary `1px` — zamysl byl wiec taki, ze
 * krawedz marki jest wyrazniej widoczna. W Chromium NIE JEST: Blink
 * podlogowuje szerokosc krawedzi do pelnego piksela CSS (minimum 1 px, jesli
 * wartosc jest niezerowa), i robi to niezaleznie od `deviceScaleFactor` —
 * sprawdzilismy osobno przy DPR 2, wynik ten sam. Ghost i primary maja wiec
 * w naszej przegladarce testowej IDENTYCZNA krawedz 1 px.
 *
 * Co z tym zrobiono: token `--border-width-brand` zostaje przy 1,5 px, bo
 * taka jest wartosc wzorca i bo Firefox i Safari ja honoruja. Pytanie, czy
 * krawedz marki ma byc 2 px (`--border-width-strong` z `_ds/tokens/effects.css`),
 * zeby roznica byla realna takze w Chromium, jest decyzja PROJEKTOWA i nalezy
 * do bramki UX (M4d) — nie do fundamentu.
 *
 * Jesli ten test zacznie padac, to NIE znaczy "popraw asercje". Znaczy, ze
 * platforma zmienila zachowanie albo ktos zmienil token — i jedno, i drugie
 * wymaga wrocenia do tej decyzji.
 */
test.describe("ISK-400 — krawedz marki: token a wartosc uzyta", () => {
  test("token ma 1,5 px, a Chromium uzywa 1 px i zrownuje ghost z primary", async ({
    page,
  }) => {
    await zamontuj(page);

    const token = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--border-width-brand")
        .trim(),
    );
    expect(token).toBe("1.5px");

    const ghost = await zmierz(page, "btn-ghost", ["border-top-width"]);
    const primary = await zmierz(page, "btn-md", ["border-top-width"]);
    expect(ghost["border-top-width"]).toBe("1px");
    expect(primary["border-top-width"]).toBe("1px");

    // Sedno zapisu: deklaracje SA rozne, a wartosci uzyte identyczne.
    expect(ghost["border-top-width"]).toBe(primary["border-top-width"]);
  });
});
