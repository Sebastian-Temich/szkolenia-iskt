/**
 * ISK-400 — kontrakt komponentow wspoldzielonych.
 *
 * Co ten plik sprawdza, a czego nie:
 * - SPRAWDZA strukture i semantyke dostepnosci, czyli to, co komponent
 *   obiecuje czytnikowi ekranu i klawiaturze. To jest cala tresc punktu 5
 *   z karty i jedyna rzecz, ktora da sie zmierzyc bez przegladarki.
 * - NIE sprawdza wartosci CSS. Nazwa klasy w napisie HTML nie dowodzi, ze
 *   regula istnieje ani ze nie zostala przeslonieta przez utility Tailwinda —
 *   to mierzy `tests/e2e/fundament-ui.spec.ts` przez computed style.
 *
 * Renderujemy przez `react-dom/server`: repozytorium nie ma jsdom ani RTL,
 * projekt `unit` to `environment: "node"` i tylko pliki `.test.ts`, wiec
 * elementy skladamy `createElement`, a nie JSX.
 *
 * Atrybuty boolean asertujemy w DOKLADNEJ formie (`disabled=""`), nie jako
 * podciag: `expect(html).toContain("disabled")` przechodzi takze dla
 * `data-disabled`, `aria-disabled` i dla slowa "disabled" w tekscie.
 */
import {
  createElement,
  type FunctionComponent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Checkbox,
  Field,
  Input,
  SearchInput,
  Select,
  Textarea,
} from "@/components/ui/field";
import { FilterPillToggle } from "@/components/ui/filter-pill";
import { ButtonLink, CardLink, FilterPillLink } from "@/components/ui/links";
import { IconChip } from "@/components/ui/icon-chip";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  Eyebrow,
  SectionHeading,
  SubsectionTitle,
} from "@/components/ui/section-heading";
import { SegmentedControl } from "@/components/ui/segmented-control";

const render = renderToStaticMarkup;

/**
 * `createElement` z dziecmi w trzecim argumencie NIE zasila wymaganego
 * `children` w typie propsow — to ograniczenie typow Reacta, nie bledny
 * komponent (`IconButton`, `Notice`, `Field` i `Eyebrow` maja `children`
 * wymagane). Helper zdejmuje `children` z kontraktu sprawdzanego dla `props`,
 * zostawiajac pelne sprawdzanie pozostalych propsow, i rzutuje dopiero
 * w samym wywolaniu.
 */
type AnyProps = Record<string, unknown>;

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

describe("Button", () => {
  it("domyslnie jest type=button, nie submit", () => {
    // HTML domyslnie daje `submit`, co w formularzu zamienia kazdy przycisk
    // pomocniczy ("Wyczysc filtry") w wysylke calego zgloszenia.
    expect(render(h(Button, {}, "Zapisz sie"))).toContain('type="button"');
  });

  it("submit trzeba podac jawnie i wtedy nim jest", () => {
    expect(render(h(Button, { type: "submit" }, "Wyslij"))).toContain(
      'type="submit"',
    );
  });

  it("pending blokuje wysylke i oglasza zajetosc", () => {
    const html = render(
      h(Button, { type: "submit", pending: true }, "Wysylam"),
    );
    // Forma dokladna atrybutu boolean — nie podciag.
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it("bez pending nie ma ani disabled, ani aria-busy", () => {
    // Kontrapunkt: inaczej test powyzej przechodzilby dla komponentu, ktory
    // blokuje przycisk zawsze.
    const html = render(h(Button, { type: "submit" }, "Wyslij"));
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("aria-busy");
  });

  it("warianty i rozmiary trafiaja do klas", () => {
    const html = render(
      h(Button, { variant: "ghost", size: "xl", block: true }, "Katalog"),
    );
    expect(html).toContain("ui-button-ghost");
    expect(html).toContain("ui-button-xl");
    expect(html).toContain("ui-button-block");
  });

  it("ButtonLink jest linkiem z href, a nie przyciskiem z onClick", () => {
    // Granica ISK-399: karty i CTA wzorca sa `button`ami, co odbiera nawigacje
    // klawiatura, deep-linki i SEO. Tego nie przenosimy.
    const html = render(h(ButtonLink, { href: "/szkolenia" }, "Katalog"));
    expect(html).toContain('href="/szkolenia"');
    expect(html.startsWith("<a")).toBe(true);
    expect(html).not.toContain("<button");
  });

  it("IconButton wymusza aria-label, nie title", () => {
    const html = render(
      h(IconButton, { label: "Usun szkolenie" }, h("span", null, "x")),
    );
    expect(html).toContain('aria-label="Usun szkolenie"');
    expect(html).not.toContain("title=");
    expect(html).toContain("ui-button-icon");
  });
});

describe("Card", () => {
  it("karta nieklikalna NIE dostaje stanu hover", () => {
    // Wzorzec podnosi w hover takze karty bez akcji, czyli obiecuje
    // interakcje, ktorej nie ma.
    const html = render(h(Card, {}, "tresc"));
    expect(html).toContain("ui-card");
    expect(html).not.toContain("ui-card-interactive");
  });

  it("CardLink jest linkiem i dostaje stan hover", () => {
    const html = render(h(CardLink, { href: "/szkolenia/x" }, "tresc"));
    expect(html).toContain("ui-card-interactive");
    expect(html).toContain('href="/szkolenia/x"');
    expect(html.startsWith("<a")).toBe(true);
  });

  it("tony i padding sa rozlaczne od klasy bazowej", () => {
    const html = render(h(Card, { tone: "glass", padding: "flush" }, "x"));
    expect(html).toContain("ui-card-glass");
    expect(html).toContain("ui-card-flush");
    // `plain`/`normal` nie dokladaja klasy — inaczej kazda karta nosilaby
    // `ui-card-plain`, ktorej w CSS nie ma.
    expect(render(h(Card, {}, "x"))).not.toContain("ui-card-plain");
  });
});

describe("IconChip", () => {
  it("skaluje ikone proporcjonalnie do chipa", () => {
    // 0,45 krawedzi, zaokraglone do parzystej: 40 -> 18, 48 -> 22, 56 -> 26.
    expect(render(h(IconChip, { size: "md", icon: "leaf" }))).toContain(
      'width="18"',
    );
    expect(render(h(IconChip, { size: "lg", icon: "leaf" }))).toContain(
      'width="22"',
    );
    expect(render(h(IconChip, { size: "xl", icon: "leaf" }))).toContain(
      'width="26"',
    );
  });

  it("chip z ikona jest ukryty przed czytnikiem ekranu", () => {
    const html = render(h(IconChip, { icon: "cpu" }));
    expect(html).toContain('aria-hidden="true"');
  });

  it("chip z trescia wlasna NIE jest ukryty", () => {
    // Inicjaly i numer kroku to tresc, a nie ornament — ukrycie ich zabraloby
    // czytnikowi ekranu numer kroku w sekcji procesu.
    const html = render(h(IconChip, { tone: "solid" }, "01"));
    expect(html).toContain("01");
    expect(html).not.toContain("aria-hidden");
  });

  it("warianty tonu z karty sa dostepne", () => {
    expect(render(h(IconChip, { tone: "soft", icon: "leaf" }))).toContain(
      "ui-iconchip-soft",
    );
    expect(render(h(IconChip, { tone: "solid", icon: "leaf" }))).toContain(
      "ui-iconchip-solid",
    );
  });
});

describe("Badge", () => {
  it("renderuje span z tonem", () => {
    const html = render(h(Badge, { tone: "outline" }, "Dofinansowanie"));
    expect(html).toContain("ui-badge-outline");
    expect(html.startsWith("<span")).toBe(true);
  });
});

describe("Eyebrow i SectionHeading", () => {
  it("kreska eyebrow jest ornamentem, nie trescia", () => {
    const html = render(h(Eyebrow, {}, "Katalog szkolen"));
    expect(html).toContain('class="ui-eyebrow-dash" aria-hidden="true"');
  });

  it("eyebrow jest akapitem, nie naglowkiem", () => {
    // Nadtytul wstawiony jako `h*` tworzy pusty poziom nad tytulem sekcji.
    const html = render(h(Eyebrow, {}, "Obszary"));
    expect(html.startsWith("<p")).toBe(true);
    expect(html).not.toContain("<h");
  });

  it("SectionHeading daje H2, a na zadanie H3", () => {
    expect(render(h(SectionHeading, { title: "Obszary" }))).toContain(
      '<h2 class="ui-section-title">Obszary</h2>',
    );
    expect(render(h(SectionHeading, { title: "Program", as: "h3" }))).toContain(
      "<h3",
    );
  });

  it("akcja po prawej przelacza uklad na rzad i owija tekst", () => {
    const html = render(
      h(SectionHeading, {
        title: "Najczesciej wybierane",
        action: h("a", { href: "/szkolenia" }, "Caly katalog"),
      }),
    );
    expect(html).toContain("ui-section-heading-row");
    expect(html).toContain("ui-section-heading-text");
  });

  it("bez akcji nie ma ani klasy rzedu, ani owijki", () => {
    const html = render(h(SectionHeading, { title: "Obszary" }));
    expect(html).not.toContain("ui-section-heading-row");
    expect(html).not.toContain("ui-section-heading-text");
  });

  it("SubsectionTitle ma jedna skale dla kursu i trenera", () => {
    // ISK-400 punkt 4: wzorzec ma 1,6rem na kursie i 1,5rem u trenera.
    const kurs = render(h(SubsectionTitle, {}, "Czego sie nauczysz"));
    const trener = render(h(SubsectionTitle, {}, "Wyksztalcenie"));
    expect(kurs).toContain("ui-subsection-title");
    expect(trener).toContain("ui-subsection-title");
  });
});

describe("PageHeader", () => {
  it("jest jeden dla katalogu i trenerow", () => {
    // Wzorzec ma `max-width` 680 px w katalogu i 720 px u trenerow —
    // obie strony dostaja teraz ten sam blok.
    const katalog = render(
      h(PageHeader, { eyebrow: "Katalog szkolen", title: "Znajdz szkolenie" }),
    );
    const trenerzy = render(
      h(PageHeader, {
        eyebrow: "Nasi Trenerzy",
        title: "Ekspertki i eksperci",
      }),
    );
    expect(katalog).toContain("ui-page-header");
    expect(trenerzy).toContain("ui-page-header");
    expect(katalog).toContain('<h1 class="ui-page-title">');
    expect(trenerzy).toContain('<h1 class="ui-page-title">');
  });

  it("renderuje header z H1, lead i trescia dodatkowa", () => {
    const html = render(
      h(
        PageHeader,
        { title: "Katalog", lead: "Opis" },
        h("p", null, "badge'y"),
      ),
    );
    expect(html.startsWith("<header")).toBe(true);
    expect(html).toContain("ui-page-lead");
    expect(html).toContain("badge&#x27;y");
  });
});

describe("Field i kontrolki", () => {
  it("etykieta jest powiazana z polem przez htmlFor i id", () => {
    // Wzorzec owija kontrolke etykieta bez `htmlFor` albo stawia luzny `span`:
    // klikniecie w etykiete nie ustawia focusu, a pole jest nieopisane.
    const html = render(
      h(
        Field,
        { id: "imie", label: "Imie i nazwisko" },
        h(Input, { id: "imie" }),
      ),
    );
    expect(html).toContain('for="imie"');
    expect(html).toContain('id="imie"');
  });

  it("region bledu jest w DOM takze gdy bledu nie ma", () => {
    // `aria-live` oglasza tylko zmiany w regionie, ktory ISTNIAL wczesniej.
    // Region wstawiony razem z tekstem czesto nie zostaje ogloszony.
    const bez = render(
      h(Field, { id: "e", label: "E-mail" }, h(Input, { id: "e" })),
    );
    expect(bez).toContain('id="e-error"');
    expect(bez).toContain('aria-live="polite"');
    // ...i jest pusty, wiec nic nie widac.
    expect(bez).toContain(
      '<p class="ui-field-error" id="e-error" aria-live="polite"></p>',
    );
  });

  it("blad ustawia aria-invalid i aria-describedby na kontrolce", () => {
    const html = render(
      h(
        Field,
        { id: "e", label: "E-mail", error: "Podaj poprawny adres" },
        h(Input, { id: "e", error: "Podaj poprawny adres" }),
      ),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="e-error"');
    expect(html).toContain("Podaj poprawny adres");
  });

  it("podpowiedz i blad razem trafiaja do aria-describedby w tej kolejnosci", () => {
    const html = render(
      h(Input, { id: "tel", hint: "Format +48", error: "Zly numer" }),
    );
    expect(html).toContain('aria-describedby="tel-hint tel-error"');
  });

  it("bez bledu kontrolka nie ma aria-invalid", () => {
    const html = render(h(Input, { id: "x" }));
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });

  it("gwiazdka pola wymaganego jest ornamentem", () => {
    const html = render(
      h(
        Field,
        { id: "z", label: "Zgoda", required: true },
        h(Input, { id: "z", required: true }),
      ),
    );
    expect(html).toContain('class="ui-field-required" aria-hidden="true"');
    // Wymog niesie atrybut, nie znak.
    expect(html).toContain('required=""');
  });

  it("Select rysuje wlasna strzalke, bo zdejmuje karet systemowy", () => {
    // Wzorzec ustawia `appearance: none` i nie rysuje nic — pole wyglada wtedy
    // jak zwykly input i nie podpowiada, ze da sie je rozwinac.
    const html = render(
      h(Select, { id: "kat" }, h("option", { value: "ai" }, "AI")),
    );
    expect(html).toContain("ui-select-caret");
    expect(html).toContain("ui-select");
    expect(html).toContain("<svg");
  });

  it("Textarea ma rows i resize pionowy przez klase", () => {
    const html = render(h(Textarea, { id: "msg", rows: 6 }));
    expect(html).toContain('rows="6"');
    expect(html).toContain("ui-textarea");
  });

  it("SearchInput ma type=search i ikone lupy", () => {
    const html = render(h(SearchInput, { id: "q", name: "q" }));
    expect(html).toContain('type="search"');
    expect(html).toContain("ui-search-icon");
    expect(html).toContain('name="q"');
  });

  it("Checkbox wiaze etykiete z polem i ma wlasny region bledu", () => {
    const html = render(
      h(Checkbox, {
        id: "rodo",
        label: "Zgadzam sie na przetwarzanie danych",
        error: "Zgoda jest wymagana",
      }),
    );
    expect(html).toContain('for="rodo"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="rodo-error"');
    expect(html).toContain("Zgoda jest wymagana");
  });
});

describe("SegmentedControl", () => {
  const opcje = [
    { value: "osoba", label: "Osoba indywidualna" },
    { value: "firma", label: "Firma" },
  ] as const;

  it("jest grupa radio, nie dwoma przyciskami", () => {
    // Wzorzec ma tu dwa niepowiazane `button`y: czytnik ekranu nie wie ani ze
    // to jedna kontrolka, ani ktora opcja jest wybrana, a strzalki nie dzialaja.
    const html = render(
      h(SegmentedControl, {
        name: "audytorium",
        legend: "Dla kogo",
        options: opcje,
        value: "osoba",
      }),
    );
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain('type="radio"');
    expect(html).not.toContain("<button");
  });

  it("zaznaczenie niesie :checked, a nie tylko tlo", () => {
    const html = render(
      h(SegmentedControl, {
        name: "aud",
        legend: "Dla kogo",
        options: opcje,
        value: "firma",
      }),
    );
    // Dokladnie jeden input jest zaznaczony — forma `checked=""`.
    expect(html.match(/checked=""/g)).toHaveLength(1);
    // ...i jest to ten o wartosci `firma`. Tniemy po calych znacznikach
    // `<input>`, bo React serializuje `checked` PRZED `value` — szukanie
    // `checked` za pozycja `value="firma"` dawaloby falszywy wynik negatywny.
    const inputy = html.match(/<input[^>]*>/g) ?? [];
    expect(inputy).toHaveLength(2);
    const zaznaczone = inputy.filter((tag) => tag.includes('checked=""'));
    expect(zaznaczone).toHaveLength(1);
    expect(zaznaczone[0]).toContain('value="firma"');
  });

  it("legenda da sie ukryc wizualnie, ale nie da sie jej usunac", () => {
    const html = render(
      h(SegmentedControl, {
        name: "aud",
        legend: "Dla kogo szukasz szkolenia",
        options: opcje,
        value: "osoba",
        hideLegend: true,
      }),
    );
    // Ukryta klasa, ale tekst jest w drzewie dostepnosci.
    expect(html).toContain("ui-visually-hidden");
    expect(html).toContain("Dla kogo szukasz szkolenia");
    // `display: none` wyrzucilby ja z drzewa — klasa uzywa clip-path.
    expect(html).not.toContain("display:none");
  });

  it("warianty pastylki: zielona i biala", () => {
    const zielona = render(
      h(SegmentedControl, {
        name: "a",
        legend: "L",
        options: opcje,
        value: "osoba",
        tone: "green",
      }),
    );
    const biala = render(
      h(SegmentedControl, {
        name: "b",
        legend: "L",
        options: opcje,
        value: "osoba",
        tone: "white",
      }),
    );
    expect(zielona).toContain("ui-segmented-green");
    expect(biala).toContain("ui-segmented-white");
  });
});

describe("FilterPill", () => {
  it("link aktywny niesie aria-current, nie tylko kolor tla", () => {
    const html = render(
      h(FilterPillLink, { href: "/szkolenia?category=ai", active: true }, "AI"),
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("ui-filterpill-active");
  });

  it("link nieaktywny nie ma aria-current", () => {
    const html = render(h(FilterPillLink, { href: "/szkolenia" }, "Wszystkie"));
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("ui-filterpill-active");
  });

  it("przelacznik niesie aria-pressed w obu stanach", () => {
    // `aria-pressed` musi byc obecne takze gdy jest `false` — jego brak czyta
    // sie jak zwykly przycisk, a nie jak przelacznik.
    expect(render(h(FilterPillToggle, { active: true }, "ESG"))).toContain(
      'aria-pressed="true"',
    );
    expect(render(h(FilterPillToggle, {}, "ESG"))).toContain(
      'aria-pressed="false"',
    );
  });
});

describe("Notice", () => {
  it("jest regionem ogloszanym przez czytnik ekranu", () => {
    // Wzorzec renderuje tu zwykly div: po wyslaniu formularza uzytkownik
    // niewidzacy nie wie, czy zgloszenie poszlo.
    const html = render(h(Notice, { tone: "success" }, "Zgloszenie przyjete"));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("ui-notice-success");
  });

  it("blad NIE uzywa role=alert", () => {
    // `alert` przerywa biezaca wypowiedz czytnika, co przy bledzie walidacji
    // kasuje informacje o polu, w ktorym uzytkownik wlasnie jest.
    const html = render(h(Notice, { tone: "error" }, "Nie udalo sie zapisac"));
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('role="status"');
  });

  it("tylko potwierdzenie ma ikone domyslna", () => {
    expect(render(h(Notice, { tone: "success" }, "ok"))).toContain("<svg");
    expect(render(h(Notice, { tone: "error" }, "zle"))).not.toContain("<svg");
    // ...a jawnie podana ikona dziala w kazdym tonie.
    expect(
      render(h(Notice, { tone: "error", icon: "mail-x" }, "zle")),
    ).toContain("<svg");
  });
});
