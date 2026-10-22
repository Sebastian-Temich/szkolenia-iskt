import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InquiryForm,
  type SelectedTraining,
} from "@/app/(public)/kontakt/inquiry-form";

// Techniczna bramka RODO w UI (ISK-357 P1). Gdy klauzula nie jest zatwierdzona, przycisk
// "Wyslij zgloszenie" MUSI byc nieaktywny (`disabled`). Nieaktywny submit nie wyzwala zdarzenia
// submit, wiec klikniecie nie moze wywolac `onValid` ani POST /api/inquiries — to jest wlasnie
// dowod, ze UI blokuje wyslanie, a nie tylko ostrzega. Serwer jest druga, niezalezna warstwa
// (processInquiry -> 503 clause_not_approved, pokryte w inquiry-handler.test.ts).

// Renderujemy komponent przez react-dom/server (bez jsdom) i wycinamy znacznik <button ...>.
function renderForm(
  clauseApproved: boolean,
  training: SelectedTraining | null = null,
): string {
  return renderToStaticMarkup(
    createElement(InquiryForm, {
      formToken: "test-token",
      rodoClauseText: "Placeholder klauzuli RODO.",
      clauseApproved,
      training,
    }),
  );
}

function renderSubmitButtonTag(clauseApproved: boolean): string {
  const html = renderForm(clauseApproved);
  const match = html.match(/<button[^>]*type="submit"[^>]*>/);
  if (!match) {
    throw new Error(
      `Nie znaleziono przycisku submit w wyrenderowanym HTML:\n${html}`,
    );
  }
  return match[0];
}

/** Znacznik otwierajacy pola o danym `id` — do asercji na lancuchu klas. */
function fieldTag(html: string, id: string): string {
  const match = html.match(
    new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`),
  );
  if (!match) throw new Error(`Nie znaleziono pola ${id} w HTML:\n${html}`);
  return match[0];
}

// --- ISK-401: arkusz jako zrodlo prawdy dla stylu ----------------------------
//
// DLACZEGO TEN TEST CZYTA `app/globals.css`
// Do ISK-401 asercje nizej celowaly w LANCUCH KLAS: `toContain("border-border-default")`,
// `toContain("min-h-11")`, `toContain("aria-[invalid=true]:border-error-500")`. Taka asercja
// nie wie, czy klasa cokolwiek robi — a dokladnie na tym poleglo `/kontakt`: klasa
// `text-secondary` siedziala w trzech miejscach tego formularza i kompilowala sie do ZERA
// regul (tokenu `--color-secondary` nie ma; nazwa zmiennej to `--color-text-secondary`),
// wiec tekst, ktory mial byc wyciszony, renderowal sie niemal czarnym ink-900 — przy
// zielonym zestawie testow. Styl przeniesiony do `@layer components` mierzymy wiec
// u zrodla: nazwa klasy w markupie ORAZ regula dla tej klasy w arkuszu ORAZ istnienie
// tokenu, ktory ta regula czyta. Pomiar `getComputedStyle` w prawdziwej przegladarce
// (czyli dowod na kaskade) siedzi w `tests/e2e/ux-powazne.spec.ts` i `fundament-ui.spec.ts`.

const GLOBALS_CSS = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cialo reguly CSS dla DOKLADNIE tego selektora (bez zagniezdzen i pseudoklas). */
function cssRule(selector: string): string {
  const match = GLOBALS_CSS.match(
    new RegExp(`^\\s*${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`, "m"),
  );
  if (!match) {
    throw new Error(
      `Brak reguly \`${selector}\` w app/globals.css — klasa w markupie nie ma stylu.`,
    );
  }
  return match[1]!;
}

/** Wartosc tokenu `--nazwa: <liczba>px` w px. */
function cssTokenPx(name: string): number {
  const match = GLOBALS_CSS.match(
    new RegExp(`${escapeForRegExp(name)}:\\s*([\\d.]+)px`),
  );
  if (!match) throw new Error(`Brak tokenu ${name} w app/globals.css`);
  return Number.parseFloat(match[1]!);
}

describe("InquiryForm — techniczna bramka RODO w UI (ISK-357 P1)", () => {
  // Uwaga: w className jest wariant Tailwind `disabled:opacity-60`, wiec sprawdzamy atrybut
  // boolowski w jego dokladnej postaci `disabled=""` (nie samo slowo "disabled").
  it("przycisk wysylki jest nieaktywny, gdy klauzula nie jest zatwierdzona", () => {
    const button = renderSubmitButtonTag(false);
    expect(button).toContain('disabled=""');
  });

  it("przycisk wysylki jest aktywny, gdy klauzula jest zatwierdzona (kontrapunkt)", () => {
    const button = renderSubmitButtonTag(true);
    // W stanie idle, bez trwajacego submitu, przycisk nie moze byc zablokowany.
    expect(button).not.toContain('disabled=""');
  });
});

// --- ISK-373: P2, P5 (przycisk), P12 -----------------------------------------
//
// Te asercje pilnuja taniej i szybko tego, co najlatwiej zgubic przy nastepnej
// edycji JSX: oprawy pola, oznaczenia bledu niezaleznego od fokusu i wysokosci
// celow dotykowych.

describe("InquiryForm — krawedzie pol uzywaja tokenu (ISK-373 / P2)", () => {
  const html = renderForm(true);

  it.each(["fullName", "email", "phone", "interestArea", "message"])(
    "pole %s jest kontrolka fundamentu, a jej krawedz ma kolor z tokenu",
    (id) => {
      // BYLO: `expect(tag).toContain("border-border-default")` — czyli dowod, ze
      // w atrybucie `class` stoi pewien napis. TERAZ: pole nosi klase warstwy
      // komponentow, ta klasa MA regule, regula ustawia krawedz z tokenu, a token
      // jest zdefiniowany. To trzy ogniwa wiecej i zadne z nich nie da sie spelnic
      // martwa nazwa klasy (defekt `text-secondary`).
      const tag = fieldTag(html, id);
      expect(tag).toMatch(/class="[^"]*\bui-field-control\b/);

      const rule = cssRule(".ui-field-control");
      expect(rule).toMatch(/border:\s*1px solid var\(--color-border-default\)/);
      expect(GLOBALS_CSS).toMatch(/--color-border-default:\s*\S/);
    },
  );

  it("zadne pole nie zostaje przy golym `border` bez koloru", () => {
    // BYLO: dla kazdej klasy z golym `border` wymagane bylo `border-(border-default|warning-500)`
    // w tym samym atrybucie. Po przejsciu na `.ui-field-control` grubosc i kolor krawedzi
    // daje JEDNA deklaracja w arkuszu, wiec gole utility `border` w widoku jest juz zawsze
    // defektem — i tak brzmi asercja. Mocniejsza, bo nie dopuszcza wyjatkow.
    const bare = html.match(/class="[^"]*\bborder\b(?![-\w])[^"]*"/g) ?? [];
    expect(bare).toEqual([]);
  });
});

describe("InquiryForm — oznaczenie bledu i wymagalnosci (ISK-373 / P12)", () => {
  const html = renderForm(true);

  it.each(["fullName", "email", "phone", "interestArea", "message"])(
    "pole %s ma oznaczenie bledu niezalezne od fokusu",
    (id) => {
      // BYLO: trzy asercje `toContain("aria-[invalid=true]:…")` na lancuchu klas.
      // TERAZ: kolor krawedzi stanu bledu jest REGULA warstwy komponentow
      // (`.ui-field-control[aria-invalid="true"]`), a nie-kolorowe nosniki
      // (grubosc + tlo) zostaja wariantami Tailwinda, bo fundament ich nie ma.
      // Sprawdzamy jedno i drugie, plus to, ze kontrolka w ogole raportuje stan
      // (`aria-invalid` jest obecne takze jako "false" — tego wymaga pomiar P12
      // w `ux-powazne.spec.ts`, ktory czyta atrybut, nie klase).
      const tag = fieldTag(html, id);
      expect(tag).toContain('aria-invalid="false"');
      expect(tag).toContain("aria-[invalid=true]:border-2");
      expect(tag).toContain("aria-[invalid=true]:bg-error-50");

      // Wariant kompiluje sie do `.klasa[aria-invalid="true"]`, wiec dziala bez
      // fokusu i wygrywa specyficznoscia, nie kolejnoscia w arkuszu.
      const invalid = cssRule('.ui-field-control[aria-invalid="true"]');
      expect(invalid).toMatch(/border-color:\s*var\(--color-error-500\)/);
      expect(GLOBALS_CSS).toMatch(/--color-error-500:\s*\S/);
    },
  );

  it.each(["fullName", "email", "phone", "message"])(
    "pole %s jest oznaczone jako wymagane",
    (id) => {
      expect(fieldTag(html, id)).toContain('aria-required="true"');
    },
  );

  it("formularz objasnia, co znaczy gwiazdka", () => {
    expect(html).toContain("Pola oznaczone gwiazdką");
  });

  it("gwiazdka jest `aria-hidden` i ma wlasna regule koloru", () => {
    // BYLO: `/<span aria-hidden="true" class="[^"]*">\*<\/span>/` — regex zalezny od
    // KOLEJNOSCI atrybutow emitowanej przez Reacta (czyli od kolejnosci propsow w JSX
    // komponentu `Field`, nie od zadnego wymogu produktu). TERAZ sprawdzamy kontrakt:
    // kazda gwiazdka oznaczajaca pole wymagane jest `aria-hidden` (bez tego czytnik
    // ekranu oglasza wymagalnosc dwa razy — raz z etykiety, raz z `aria-required`)
    // i nosi klase, ktora ma w arkuszu kolor. Kolejnosc atrybutow jest dowolna.
    const stars = html.match(/<span[^>]*>\*<\/span>/g) ?? [];
    const marks = stars.filter((tag) => tag.includes("ui-field-required"));
    // Pieć pol wymaganych bezwarunkowo (`fullName`, `email`, `phone`,
    // `interestArea` bez wskazanego szkolenia, `message`) + zgoda RODO.
    expect(marks).toHaveLength(6);
    for (const mark of marks) {
      expect(mark).toContain('aria-hidden="true"');
    }
    expect(cssRule(".ui-field-required")).toMatch(
      /color:\s*var\(--color-error-500\)/,
    );
    // Objasnienie gwiazdki tez nie moze byc czytane jako znak.
    expect(html).toMatch(
      /Pola oznaczone gwiazdką \(<span aria-hidden="true">\*<\/span>\)/,
    );
  });

  it("„Interesujące szkolenie” nie jest wymagane, gdy szkolenie jest wskazane", () => {
    // `inquirySchema.superRefine` wymaga tego pola tylko wtedy, gdy zgloszenie
    // nie nosi `trainingId` — oznaczenie musi isc za regula, inaczej klamie.
    const withTraining = renderForm(true, {
      id: "11111111-1111-4111-8111-111111111111",
      title: "[TEST] Szkolenie wskazane",
      slug: "test-szkolenie-wskazane",
    });
    expect(fieldTag(withTraining, "interestArea")).toContain(
      'aria-required="false"',
    );
    expect(fieldTag(html, "interestArea")).toContain('aria-required="true"');
    // Gwiazdka idzie za `aria-required`: przy wskazanym szkoleniu etykieta pola
    // jej nie ma (bramka czyta `label[for="interestArea"]`).
    const label = withTraining.match(
      /<label[^>]*for="interestArea"[^>]*>.*?<\/label>/s,
    );
    expect(label).not.toBeNull();
    expect(label![0]).not.toContain("ui-field-required");
  });
});

describe("InquiryForm — cel dotykowy przycisku wysylki (ISK-373 / P5)", () => {
  it("przycisk wysylki ma wysokosc z tokenu >= 44 px", () => {
    // BYLO: `toContain("min-h-11")` + `not.toMatch(/\bpy-2\b/)`. Obie asercje mowily
    // o jednej konkretnej klasie Tailwinda, nie o wysokosci: `min-h-11` moglo zostac
    // przeslonione przez `h-*` albo wygrac z nim i tak (bramka zmierzyla 173,1 x 40 px
    // wlasnie dlatego, ze wysokosc brala sie z paddingu). TERAZ: przycisk jest
    // `.ui-button` z jednym z czterech rozmiarow, regula tego rozmiaru czyta token,
    // token ma >= 44 px, a na przycisku nie ma ZADNEGO utility wysokosci ani paddingu
    // pionowego, ktore moglo by to zepsuc. To scisle wiecej niz dwie poprzednie linie.
    const button = renderSubmitButtonTag(true);
    expect(button).toMatch(/class="[^"]*\bui-button\b/);

    const size = button.match(/\bui-button-(sm|md|lg|xl)\b/);
    expect(size, `brak klasy rozmiaru na przycisku: ${button}`).not.toBeNull();
    const token = `--control-h-${size![1]}`;
    expect(cssRule(`.ui-button-${size![1]}`)).toMatch(
      new RegExp(`height:\\s*var\\(${escapeForRegExp(token)}\\)`),
    );
    expect(cssTokenPx(token)).toBeGreaterThanOrEqual(44);
    // `sm` jest podloga calej skali fundamentu — jesli ktos zejdzie z 44 px tam,
    // upada tutaj, a nie dopiero w bramce e2e.
    expect(cssTokenPx("--control-h-sm")).toBeGreaterThanOrEqual(44);
    expect(button).not.toMatch(/\b(?:h|min-h|py|p)-\d/);
  });

  it("wiersze kontrolek radio i checkbox tez maja 44 px", () => {
    // BYLO: `labels.filter((l) => l.includes("min-h-11"))` o dlugosci 3. Liczylo
    // wystapienia napisu w atrybucie. TERAZ: liczymy rzedy po klasie warstwy
    // komponentow I sprawdzamy, ze KAZDA z tych dwoch klas ma w arkuszu
    // `min-height` czytana z tokenu 44 px. Ta sama liczba (2 radio + checkbox),
    // ale dowod dotyczy wysokosci, nie napisu.
    const html = renderForm(true);
    const labels = html.match(/<label[^>]*>/g) ?? [];
    const segmented = labels.filter((label) =>
      label.includes("ui-segmented-option"),
    );
    const checkbox = labels.filter((label) => label.includes("ui-checkbox"));
    expect(segmented).toHaveLength(2);
    expect(checkbox).toHaveLength(1);

    for (const selector of [".ui-segmented-option", ".ui-checkbox"]) {
      expect(cssRule(selector)).toMatch(/min-height:\s*var\(--control-h-sm\)/);
    }
    expect(cssTokenPx("--control-h-sm")).toBeGreaterThanOrEqual(44);
  });

  it("kazde radio rodzaju zgloszenia siedzi w `label` — inaczej nie ma nazwy dostepnej", () => {
    // Asercja NOWA, zapisuje zmierzony fakt platformy. `SegmentedControl` z ISK-400
    // owija pastylke `<span>`, nie `<label>`: w chromium radio zostaje wtedy BEZ
    // nazwy dostepnej (`getByRole("radio", { name: "Firma" })` daje 0 trafien),
    // a axe-core zglasza regule `label` z waga *critical*. Nazwy tych dwoch opcji
    // sa kontraktem trzech bramek (`formularz-zgloszenia.spec.ts` D5.3/D5.4,
    // `ux-powazne.spec.ts` P5, `dostepnosc.spec.ts`), wiec rzad musi byc `label`.
    const html = renderForm(true);
    const rows =
      html.match(/<label[^>]*ui-segmented-option[^>]*>.*?<\/label>/gs) ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatch(/<input[^>]*type="radio"/);
    expect(rows[0]).toContain("Osoba indywidualna");
    expect(rows[1]).toContain("Firma");
    // Grupa ma etykiete: `legend` jest tez wymagany przez `ux-blockers.spec.ts`
    // (porownanie wielkosci h1 i `form legend`).
    expect(html).toMatch(/<legend[^>]*>Rodzaj zgłoszenia<\/legend>/);
  });
});

describe("InquiryForm — afordancja wysylki w stanie idle (ISK-373 / P13)", () => {
  it("w stanie idle nie ma ani `aria-busy=true`, ani wskaznika", () => {
    // Kontrapunkt do testow e2e: afordancja musi byc stanem, nie dekoracja
    // widoczna zawsze. SSR renderuje wylacznie stan `idle`.
    const html = renderForm(true);
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("Wysyłanie…");
    expect(html).toContain("Wyślij zgłoszenie");
    // Region ogloszeniowy wysylki istnieje TYLKO w trakcie wysylki — dzieki temu
    // po sukcesie na stronie jest dokladnie jeden `role="status"`.
    expect(html).not.toContain('role="status"');
  });

  it("rodzaj zgloszenia jest zaznaczony juz w odpowiedzi serwera", () => {
    // Bez `defaultChecked` zadna pastylka nie byla zaznaczona w HTML pierwszej
    // odpowiedzi — stan pojawial sie dopiero po hydratacji (mrugniecie ukladu
    // i formularz bez wybranego rodzaju przy wylaczonym JS).
    const html = renderForm(true);
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    const checked = radios.filter((tag) => tag.includes('checked=""'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="osoba"');
  });
});
