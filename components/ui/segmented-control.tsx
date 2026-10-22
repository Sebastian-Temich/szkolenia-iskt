import type { ReactNode } from "react";

import { cx } from "./cx";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

type Props<T extends string> = {
  /** Nazwa grupy radio — musi byc unikatowa na stronie. */
  name: string;
  /**
   * Etykieta grupy. Widoczna albo tylko dla czytnika ekranu (`hideLegend`),
   * ale ZAWSZE obecna: grupa radio bez etykiety jest ogloszana jako "grupa"
   * i nie wiadomo, czego dotyczy wybor.
   */
  legend: ReactNode;
  hideLegend?: boolean;
  options: readonly SegmentedOption<T>[];
  value: T;
  /** Wariant wizualny: zielona pastylka (hero) albo biala (formularz). */
  tone?: "green" | "white";
  /** Pastylki dzielace szerokosc rodzica po rowno (formularz kontaktowy). */
  full?: boolean;
  /** Bez `onChange` kontrolka wyslalaby sie z formularzem jak zwykle radio. */
  onChange?: (value: T) => void;
  className?: string;
};

/**
 * Przelacznik segmentowy — "Dla Ciebie / Dla firm" w hero i "Osoba / Firma"
 * w formularzu kontaktowym.
 *
 * Zbudowany na `fieldset` + `legend` + `input[type=radio]`, a nie na dwoch
 * `button`ach jak wzorzec. Rozni to trzy rzeczy, wszystkie mierzalne:
 *
 * 1. Czytnik ekranu oglasza "grupa <legend>, opcja 1 z 2, zaznaczone" —
 *    wzorzec oglasza dwa niepowiazane przyciski bez informacji o stanie.
 * 2. Strzalki lewo/prawo przeskakuja miedzy opcjami, a Tab wchodzi do grupy
 *    raz, nie dwa razy. To zachowanie natywne; na `button`ach trzeba je
 *    napisac i wzorzec tego nie robi.
 * 3. Dziala bez JavaScriptu — stan niesie `:checked`, nie stan Reacta.
 *
 * `onChange` jest opcjonalne: bez niego kontrolka zachowuje sie jak zwykle
 * radio w formularzu (`name` + `value` ida w zadaniu), co jest potrzebne tam,
 * gdzie przelacznik ma byc filtrem wysylanym na serwer. Przekazanie `onChange`
 * zmienia ja w kontrolke zarzadzana przez komponent nadrzedny; `defaultValue`
 * nie jest obslugiwane swiadomie, zeby nie dalo sie zrobic kontrolki
 * polzarzadzanej, ktora rozjezdza sie po hydratacji.
 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  hideLegend = false,
  options,
  value,
  tone = "green",
  full = false,
  onChange,
  className,
}: Props<T>) {
  return (
    // `legend` stoi NAD pastylkami, nie w ich rzedzie: `legend` jest blokiem
    // i wstawiony do `display: inline-flex` zostalby trzecim elementem rzedu,
    // rozpychajac pigulke. Dlatego grupa i rzad to dwa elementy.
    <fieldset
      className={cx(
        "ui-segmented-group",
        full && "ui-segmented-full",
        className,
      )}
    >
      <legend
        className={cx(
          "ui-segmented-legend",
          hideLegend && "ui-visually-hidden",
        )}
      >
        {legend}
      </legend>
      <div
        className={cx(
          "ui-segmented",
          `ui-segmented-${tone}`,
          full && "ui-segmented-full",
        )}
      >
        {options.map((option) => (
          /*
           * ISK-401: pastylka MUSI byc `label`, nie `span`.
           *
           * M1 owijal kazde radio `span`em, a tekst opcji stawial jako jego
           * drugie dziecko. Sasiedni `span` nie jest etykieta, wiec nazwa
           * dostepna kazdego radia byla PUSTA: `getByRole("radio", { name:
           * "Firma" })` nie trafialo w nic, a axe zglaszalo krytyczna regule
           * `label` na kazdym widoku z ta kontrolka. Defekt nie byl widoczny
           * w testach M1, bo zadna asercja nie pytala o nazwe dostepna — a na
           * ekranie pastylka wygladala poprawnie.
           *
           * `label` owijajacy kontrolke daje powiazanie niejawne, czyli nazwe
           * z tresci etykiety, bez `htmlFor` i bez `id` na kazdej opcji.
           * Kliknięcie dalej trafia w input (jest rozciagniety `inset: 0`),
           * a strzalki dalej dzialaja — to zachowanie natywne grupy radio.
           */
          <label className="ui-segmented-option" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={onChange ? () => onChange(option.value) : undefined}
              // Bez `onChange` React uznaje kontrolke za tylko-do-odczytu
              // i `readOnly` wycisza ostrzezenie. Przegladarka nadal przelacza
              // zaznaczenie i nadal wysyla `name=value` z formularzem — czego
              // chcemy dla przelacznika bedacego filtrem po stronie serwera.
              readOnly={onChange ? undefined : true}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
