import Link from "next/link";

import { Badge, Icon, IconChip } from "@/components/ui";
import { categoryIconName } from "@/lib/category-icon";
import {
  formatDurationHours,
  formatLevel,
  formatPriceNet,
} from "@/lib/format";
import type { Training } from "@/lib/public-catalog";

type Props = {
  training: Training;
  /**
   * `band` to wariant wzorca z pasmem gradientu 96 px — sekcja "Szkolenia,
   * ktore wyrozniamy" na stronie glownej. `plain` to wariant katalogu, ktory
   * zamiast pasma otwiera chip ikony obszaru.
   */
  variant?: "plain" | "band";
  /**
   * Poziom naglowka tytulu. Katalog nie ma H2 nad siatka, wiec karta musi byc
   * H2; sekcja wyroznionych na stronie glownej ma wlasne H2, wiec karta jest
   * tam H3. Bez tego konspekt skakalby o dwa poziomy (WCAG 1.3.1) — bramka
   * `tests/e2e/dostepnosc.spec.ts` mierzy to na kazdym widoku.
   */
  headingLevel?: "h2" | "h3";
};

/**
 * Karta szkolenia.
 *
 * DLACZEGO `Link`, A NIE `button`
 * Wzorzec renderuje cala karte jako `<button onClick>` i nie ma zadnego adresu
 * per zasob — nawigacja idzie przez `setState`. Produkt tego nie przenosi
 * (granica ISK-399): bez adresu nie da sie wkleic linku do szkolenia, otworzyc
 * go w nowej karcie ani zindeksowac.
 *
 * TYTUL ZOSTAJE NAGLOWKIEM
 * Wzorzec musi uzywac `span`, bo elementy blokowe w `button` sa niepoprawne —
 * traci przez to konspekt dokumentu. Tutaj tytul jest prawdziwym naglowkiem
 * wewnatrz linku.
 *
 * `aria-label` JEST TU KONIECZNE, NIE OZDOBNE
 * Nazwa dostepna linku domyslnie sklada sie z CALEJ jego tresci, czyli
 * "Dofinansowanie [tytul] [opis] 16 godz. podstawowy 1 990 zl netto Zobacz
 * szczegóły" — nieuzyteczne na liscie linkow czytnika ekranu i niemozliwe do
 * wskazania w tescie. `aria-label` zawiera dokladnie widoczny tytul, wiec
 * spelnia tez WCAG 2.5.3 (etykieta w nazwie).
 *
 * W KARCIE NIE MA DRUGIEGO LINKU
 * Cala karta jest jednym linkiem, wiec "Zobacz szczegóły" to `span`, nie `a`:
 * zagniezdzony element interaktywny to niepoprawny HTML i drugi przystanek
 * Tabem po tej samej tresci. Poprzednia wersja miala dwa linki do tego samego
 * adresu (tytul i stopka karty).
 *
 * CENA BEZ MNOZNIKA
 * ISK-399 / D1: pokazujemy `price_net_pln`, bez reguly `pelna x 0.2`, bez
 * dopisku "z dofinansowaniem" i bez progu procentowego. Informacja
 * o dofinansowaniu jest warunkowa i pochodzi z `funding_available`.
 */
export function TrainingCard({
  training,
  variant = "plain",
  headingLevel: Heading = "h2",
}: Props) {
  const icon = categoryIconName(training.category?.icon);
  const duration = formatDurationHours(training.duration_hours);
  const price = formatPriceNet(training.price_net_pln);
  // Slownik `level` jest ASCII w bazie (check + enum), etykieta ma diakrytyki.
  const level = formatLevel(training.level);

  return (
    <Link
      aria-label={training.title}
      className={`training-card training-card-${variant} ui-card ui-card-flush ui-card-interactive`}
      href={`/szkolenia/${training.slug}`}
    >
      {variant === "band" ? (
        <span aria-hidden="true" className="training-card-band">
          <Icon name={icon} size={34} />
        </span>
      ) : null}

      <span className="training-card-body">
        <span className="training-card-topline">
          {variant === "plain" ? (
            <IconChip icon={icon} size="md" tone="soft" />
          ) : null}
          {/* ISK-409: zastepnik brzmial kiedys "[DEMO] Szkolenie" i znacznik
              byl tam CELOWY. Usuniecie go jest swiadome, nie przeoczeniem:
              1. Sciezka jest nieosiagalna w produkcie. `trainings.category_id`
                 jest `not null`, a `getTrainings()`/`getTraining()` lacza
                 kategorie przez `!inner`, wiec wiersz bez kategorii nie
                 przechodzi przez zapytanie. Zastepnik chroni wylacznie przed
                 bledem w liscie kolumn embeda.
              2. Gdyby mimo to wypadl, "[DEMO]" byloby FALSZYWE: oznaczaloby
                 jako dane przykladowe karte, ktora moze pochodzic z realnego
                 wiersza administratora. Znacznik ma oznaczac fikcje, a nie
                 brakujacy embed.
              3. Sygnal o srodowisku demonstracyjnym jest teraz podawany RAZ,
                 w pasku nad naglowkiem (`app/(public)/layout.tsx`), wiec
                 nazwy wlasne i ich zastepniki go nie powtarzaja. */}
          <span className="training-card-category">
            {training.category?.name ?? "Szkolenie"}
          </span>
          {/* Badge "Bestseller/Nowosc/Popularne" ze wzorca nie wchodzi
              (ISK-399 / D1): nie ma go w modelu danych, a wpisany na sztywno
              bylby zmyslona ocena. Jedyny badge to fakt z kolumny
              `funding_available`; tresc szczegolu bierze `funding_note`. */}
          {training.funding_available ? (
            <Badge tone="tint">Dofinansowanie</Badge>
          ) : null}
        </span>

        <Heading className="training-card-title">{training.title}</Heading>
        <span className="training-card-summary">{training.summary}</span>

        <span className="training-card-meta">
          {duration ? (
            <span className="training-card-meta-item">
              <Icon name="clock" size={15} />
              {duration}
            </span>
          ) : null}
          {level ? (
            <span className="training-card-meta-item">
              <Icon name="gauge" size={15} />
              {level}
            </span>
          ) : null}
        </span>

        <span className="card-footer training-card-footer">
          <span className="training-card-price">
            {price ?? "Wycena indywidualna"}
            {price ? (
              <span className="training-card-price-note">netto</span>
            ) : null}
          </span>
          <span className="training-card-cta">
            Zobacz szczegóły
            <Icon name="arrow-right" size={18} />
          </span>
        </span>
      </span>
    </Link>
  );
}
