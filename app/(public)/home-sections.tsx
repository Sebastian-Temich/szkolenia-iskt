"use client";

import { useState } from "react";

import { TrainingCard } from "@/components/training-card";
import {
  ButtonLink,
  Card,
  CardLink,
  Eyebrow,
  Icon,
  IconChip,
  SectionHeading,
  SegmentedControl,
} from "@/components/ui";
import {
  AUDIENCES,
  AUDIENCE_COPY,
  AUDIENCE_DEFAULT,
  AUDIENCE_FORM_LABELS,
  AUDIENCE_SWITCH_LABELS,
  type Audience,
} from "@/lib/audience";
import { categoryIconName } from "@/lib/category-icon";
import type { Category, Training } from "@/lib/public-catalog";

type Props = {
  categories: Category[];
  featured: Training[];
};

/**
 * Trzy sekcje strony glownej, ktore czytaja JEDEN stan audytorium (hero, proces,
 * naglowek kontaktu), oraz sekcje statyczne pomiedzy nimi.
 *
 * DLACZEGO CALA STRONA JEST JEDNYM KOMPONENTEM KLIENCKIM
 * Wzorzec trzyma `audience` w stanie korzenia i czyta go w trzech miejscach
 * rozdzielonych sekcjami statycznymi. Alternatywy to kontekst Reacta (ten sam
 * koszt, jeden plik wiecej) albo stan w adresie (`?dla=firma`), ktory zamienilby
 * przelacznik tresci w nawigacje i wymusil pelny render przy kazdym przelaczeniu.
 * Dane przychodza z serwera przez propsy, wiec zapytania do bazy zostaja po
 * stronie serwera, a widok pozostaje preranderowany (ISR) — co jest warunkiem
 * profilu CSP tras publicznych (`tests/e2e/naglowki-bezpieczenstwa.spec.ts`:
 * trasy publiczne NIE dostaja nonce, bo sa preranderowane).
 *
 * PRZELACZNIK NIE FILTRUJE DANYCH
 * Zmienia wylacznie tresc: nadtytul, H1, lead, etykiete CTA, tytul i cztery
 * kroki procesu oraz naglowek sekcji kontaktu. Katalog, obszary, ceny i karty
 * wyroznione sa w obu stanach identyczne. Zadne zapytanie i zadna kolumna nie
 * zalezy od tego stanu — dlatego model danych zostaje nietkniety.
 */
export function HomeSections({ categories, featured }: Props) {
  const [audience, setAudience] = useState<Audience>(AUDIENCE_DEFAULT);
  const copy = AUDIENCE_COPY[audience];

  return (
    <>
      {/* ---------------------------------------------------------- hero A -- */}
      {/* ISK-399 / D2: wariantem aktywnym jest hero A. Hero B nie wchodzi do V1,
          wiec nie ma go tez w kodzie — martwy wariant za flaga to dlug. */}
      <section className="home-hero">
        {/* Dwie poswiaty radialne. `aria-hidden` + `pointer-events: none`:
            ornament nie moze trafic do czytnika ekranu ani lapac klikniec. */}
        <span aria-hidden="true" className="home-hero-glow home-hero-glow-a" />
        <span aria-hidden="true" className="home-hero-glow home-hero-glow-b" />

        <div className="home-hero-inner ui-container">
          <SegmentedControl
            className="home-hero-switch"
            hideLegend
            legend="Dla kogo szukasz szkolenia"
            name="audience-hero"
            onChange={(value) => setAudience(value as Audience)}
            options={AUDIENCES.map((value) => ({
              value,
              label: AUDIENCE_SWITCH_LABELS[value],
            }))}
            tone="green"
            value={audience}
          />

          <Eyebrow>{copy.heroEyebrow}</Eyebrow>
          <h1 className="home-hero-title">{copy.heroTitle}</h1>
          <p className="home-hero-lead">{copy.heroLead}</p>

          <div className="home-hero-actions">
            <ButtonLink
              href={`/kontakt?rodzaj=${audience}`}
              size="xl"
              variant="primary"
            >
              {copy.heroCta}
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
            <ButtonLink href="/szkolenia" size="xl" variant="ghost">
              Przeglądaj katalog
            </ButtonLink>
          </div>

          {/* Trzy pozycje z ikona `check`. Wzorzec ma tu "Dofinansowanie do 80%"
              i "Certyfikat ISKT" — ISK-399 / D1 zabrania progu procentowego,
              a potwierdzenia ukonczenia ISKT nie potwierdzilo.
              ISK-409 / CR-I2: poprzednia wersja tego komentarza twierdzila, ze
              tresc jest "oznaczona jako demonstracyjna" — nie byla. Trzy punkty
              brzmialy "Praktyczne programy" (ocena jakosci, ktorej nikt nie
              wystawil), "Online i stacjonarnie" (MODEL DANYCH NIE MA KOLUMNY
              FORMATU DOSTAWY — ten sam commit przyznaje to w
              `app/(public)/szkolenia/[slug]/page.tsx`, gdzie pozycja "format"
              jest celowo pominieta) i "Prowadzenie przez ekspertów" (ocena
              kompetencji).
              ROZWIAZANIE: nie dopisujemy `[DEMO]` do marketingu, tylko
              zamieniamy twierdzenia na FAKTY O KATALOGU. Kazdy z trzech
              punktow wskazuje sekcje, ktora realnie istnieje w widoku
              szczegolu i stoi na kolumnie z bazy: `program` ->
              "Program szkolenia", `training_trainers` -> "Prowadzący",
              `funding_available` -> badge "Dofinansowanie". Dlatego NIE nosza
              `[DEMO]`: nie ma tu nic fikcyjnego do oznaczenia. */}
          <ul className="home-hero-points">
            {[
              "Program i efekty kształcenia w opisie szkolenia",
              "Prowadzący wskazani przy szkoleniu",
              "Dofinansowanie oznaczone w katalogu",
            ].map((point) => (
              <li className="home-hero-point" key={point}>
                <Icon name="check" size={18} />
                {point}
              </li>
            ))}
          </ul>

          {/* Dwie karty sciezek. Sa wewnatrz sekcji hero, bo we wzorcu dziela
              z nia tlo i poswiaty; `max-width` 960 px wezszy niz kontener. */}
          <div className="home-paths">
            <Card className="home-path" padding="roomy">
              <IconChip icon="graduation-cap" size="xl" tone="soft" />
              <h2 className="home-path-title">Dla osób indywidualnych</h2>
              <p className="home-path-text">
                [DEMO] Rozwijaj kompetencje w swoim tempie. Elastyczne terminy i
                dostęp online.
              </p>
              <ul className="home-path-list">
                {[
                  "Zajęcia prowadzone przez praktyków",
                  "Materiały do pracy własnej",
                  "Zapis przez formularz zgłoszenia",
                ].map((item) => (
                  <li className="home-path-item" key={item}>
                    <Icon name="check" size={14} />
                    {item}
                  </li>
                ))}
              </ul>
              <ButtonLink
                className="home-path-cta"
                href="/szkolenia"
                size="sm"
                variant="ghost"
              >
                Szkolenia otwarte
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            </Card>

            <Card className="home-path" padding="roomy">
              <IconChip icon="building-2" size="xl" tone="soft" />
              <h2 className="home-path-title">Dla firm i zespołów</h2>
              <p className="home-path-text">
                [DEMO] Program dopasowany do celów organizacji. Szkolenia
                zamknięte, stacjonarnie lub online.
              </p>
              <ul className="home-path-list">
                {[
                  "Program na zamówienie",
                  "Ustalany harmonogram",
                  "Podsumowanie przebiegu",
                ].map((item) => (
                  <li className="home-path-item" key={item}>
                    <Icon name="check" size={14} />
                    {item}
                  </li>
                ))}
              </ul>
              <ButtonLink
                className="home-path-cta"
                href="/kontakt?rodzaj=firma"
                size="sm"
                variant="ghost"
              >
                Szkolenie zamknięte
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            </Card>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- #obszary -- */}
      <section className="ui-section ui-section-tint" id="obszary">
        <div className="ui-container">
          <SectionHeading
            align="center"
            eyebrow="Obszary szkoleń"
            lead="[DEMO] Obszary szkoleniowe dla osób indywidualnych i zespołów — od sztucznej inteligencji po język angielski."
            title="Kompetencje, które budują przewagę"
          />

          {categories.length > 0 ? (
            <ul className={areaGridClassName(categories.length)}>
              {categories.map((category) => (
                <li className="home-area-cell" key={category.id}>
                  <CardLink
                    aria-label={category.name}
                    className="home-area"
                    href={`/szkolenia?category=${encodeURIComponent(category.slug)}`}
                    padding="roomy"
                  >
                    <IconChip
                      icon={categoryIconName(category.icon)}
                      size="xl"
                      tone="soft"
                    />
                    <h3 className="home-area-title">{category.name}</h3>
                    {category.description ? (
                      <span className="home-area-text">
                        {category.description}
                      </span>
                    ) : null}
                    <span className="home-area-cta">
                      Zobacz szkolenia
                      <Icon name="arrow-right" size={18} />
                    </span>
                  </CardLink>
                </li>
              ))}
            </ul>
          ) : (
            /* Stanu pustego wzorzec nie ma — przy wycofaniu wszystkich kategorii
               z publikacji zostawalby naglowek nad pusta siatka. */
            <Card className="empty-state" padding="roomy">
              <h3 className="empty-state-title">
                Obszary szkoleń są w przygotowaniu
              </h3>
              <p>Napisz do nas — dobierzemy temat do Twoich potrzeb.</p>
              <ButtonLink href="/kontakt" size="sm" variant="primary">
                Zapytaj o szkolenie
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            </Card>
          )}
        </div>
      </section>

      {/* ------------------------------------------- wyroznione szkolenia -- */}
      {/* ISK-409 / CR-I1: tytul brzmial "Najczęściej wybierane" — twierdzenie
          o zachowaniu uzytkownikow, podczas gdy zawartosc sekcji pochodzi
          w calosci z RECZNEJ flagi `is_featured`, odhaczanej w panelu. Nie ma
          w produkcie ani jednego licznika wyswietlen, zgloszen czy sprzedazy,
          wiec "najczesciej" nie bylo oparte na niczym. Funkcjonalnie byl to
          zakazany przez D1 badge "Popularne", tylko przeniesiony do `<h2>`.
          Nowy tytul mowi dokladnie to, co robi flaga, i w pierwszej osobie —
          to redakcyjny wybor administratora, a nie statystyka. Nadtytul
          "Wyróżnione szkolenia" byl juz prawdziwy i zostaje bez zmian. */}
      <section className="ui-section">
        <div className="ui-container">
          <SectionHeading
            action={
              <ButtonLink href="/szkolenia" size="md" variant="ghost">
                Cały katalog
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            }
            eyebrow="Wyróżnione szkolenia"
            title="Szkolenia, które wyróżniamy"
          />

          {featured.length > 0 ? (
            <div className={featuredGridClassName(featured.length)}>
              {featured.map((training) => (
                <TrainingCard
                  headingLevel="h3"
                  key={training.id}
                  training={training}
                  variant="band"
                />
              ))}
            </div>
          ) : (
            /* Wzorzec renderuje tu naglowek nad pusta siatka, gdy nic nie jest
               wyroznione. Panel potrafi odznaczyc `is_featured` wszystkim. */
            <Card className="empty-state" padding="roomy">
              <h3 className="empty-state-title">
                Nie mamy teraz wyróżnionych szkoleń
              </h3>
              <p>Cały katalog jest dostępny bez zmian.</p>
              <ButtonLink href="/szkolenia" size="sm" variant="primary">
                Przejdź do katalogu
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            </Card>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ #jak -- */}
      <section className="ui-section ui-section-subtle" id="jak">
        <div className="ui-container">
          <SectionHeading
            align="center"
            eyebrow="Jak to działa"
            lead={copy.processLead}
            title={copy.processTitle}
          />
          <ol className="home-steps">
            {copy.processSteps.map((step, index) => (
              <li className="home-step ui-card" key={step.title}>
                <span className="home-step-top">
                  <IconChip icon={step.icon} size="lg" tone="solid" />
                  {/* Wzorzec maluje numer kroku na `--green-200` na bialym tle
                      (~1,6:1) — nieczytelny. Kolor jest tu `--color-green-600`;
                      kontrast mierzy `tests/e2e/dostepnosc.spec.ts`. */}
                  <span aria-hidden="true" className="home-step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </span>
                <h3 className="home-step-title">{step.title}</h3>
                <p className="home-step-text">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- #dofinansowania -- */}
      {/* ISK-399 / D1 "struktura tak, liczby nie": panel zostaje, ale bez
          "Zaplac nawet o 80% mniej", bez progow procentowych i bez
          bezwarunkowego zdania o KFS/BUR. Tresc zastepcza jest oznaczona
          [DEMO] do czasu dostarczenia tresci przez ISKT (D3). */}
      <section className="ui-section" id="dofinansowania">
        <div className="ui-container">
          <div className="ui-panel ui-panel-brand">
            <span aria-hidden="true" className="ui-panel-glow" />
            <div className="ui-panel-body">
              <SectionHeading
                className="home-funding-heading"
                eyebrow="Dofinansowania"
                lead="[DEMO] Część szkoleń może kwalifikować się do publicznych źródeł finansowania. Sprawdzimy dostępne możliwości i pomożemy przejść przez formalności."
                onDark
                title="Sprawdź możliwość dofinansowania"
              />

              <ul className="home-funding-grid">
                {[
                  {
                    icon: "banknote" as const,
                    title: "Źródła publiczne",
                    text: "[DEMO] Lista programów i warunków zostanie uzupełniona po zatwierdzeniu treści przez ISKT.",
                  },
                  {
                    icon: "clipboard-list" as const,
                    title: "Formalności",
                    text: "[DEMO] Wspieramy w przygotowaniu dokumentów wymaganych przez wybrany program.",
                  },
                  {
                    icon: "shield-check" as const,
                    title: "Rozliczenie",
                    text: "[DEMO] Zakres wsparcia przy rozliczeniu ustalamy przed rozpoczęciem szkolenia.",
                  },
                ].map((item) => (
                  <li
                    className="home-funding-card ui-card-glass"
                    key={item.title}
                  >
                    <IconChip icon={item.icon} size="lg" tone="on-dark" />
                    <h3 className="home-funding-title">{item.title}</h3>
                    <p className="home-funding-text">{item.text}</p>
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={`/kontakt?rodzaj=${audience}`}
                size="lg"
                variant="light"
              >
                Zapytaj o dofinansowanie
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- #kontakt -- */}
      <section className="ui-section ui-section-tint" id="kontakt">
        <div className="home-contact ui-container">
          <div className="home-contact-text">
            <Eyebrow>Zgłoszenie</Eyebrow>
            <h2 className="ui-section-title">{copy.contactTitle}</h2>
            <p className="ui-section-lead">{copy.contactLead}</p>

            <ul className="home-contact-rows">
              <li className="home-contact-row">
                <IconChip icon="mail" size="md" tone="soft" />
                <a className="home-contact-link" href="mailto:biuro@iskt.pl">
                  biuro@iskt.pl
                </a>
              </li>
              <li className="home-contact-row">
                <IconChip icon="map-pin" size="md" tone="soft" />
                <span>[DEMO] Żory, woj. śląskie</span>
              </li>
              <li className="home-contact-row">
                <IconChip icon="clock" size="md" tone="soft" />
                {/* Wzorzec obiecuje tu kontakt "w ciagu 24 godzin" — ISK-399 / D1
                    wprost tego zabrania, bo to SLA, ktorego nikt nie potwierdzil. */}
                <span>Odpowiadamy na podany adres e-mail</span>
              </li>
            </ul>
          </div>

          {/* Biala karta z przelacznikiem rodzaju zgloszenia.
              ODSTEPSTWO (uzasadnione w PR): wzorzec ma tu DRUGI, pelny formularz
              zgloszeniowy. Nie przenosimy tego — jedyny formularz przyjmujacy
              dane osobowe zostaje na `/kontakt`. Powody: druga instancja
              oznaczalaby druga sciezke tokenu czasowego, drugi limit czestosci
              i druga kopie obowiazkowej informacji RODO na stronie glownej,
              czyli podwojenie powierzchni, ktorej ISK-399 kazal nie ruszac.
              Przelacznik zachowuje wspolny stan i przenosi wybor do formularza
              przez `?rodzaj=`, wiec osoba nie wybiera dwa razy tego samego. */}
          <Card className="home-contact-card" padding="roomy">
            <SegmentedControl
              full
              legend="Rodzaj zgłoszenia"
              name="audience-contact"
              onChange={(value) => setAudience(value as Audience)}
              options={AUDIENCES.map((value) => ({
                value,
                label: AUDIENCE_FORM_LABELS[value],
              }))}
              tone="white"
              value={audience}
            />

            <p className="home-contact-card-text">
              {audience === "firma"
                ? "W formularzu podasz nazwę firmy i opiszesz potrzeby zespołu."
                : "W formularzu wskażesz interesujące szkolenie lub obszar."}
            </p>

            <ul className="home-contact-card-list">
              {[
                "Formularz zajmuje kilka minut",
                "Odpowiadamy na podany adres e-mail",
                "Dane przetwarzamy zgodnie z polityką prywatności",
              ].map((item) => (
                <li className="home-path-item" key={item}>
                  <Icon name="check" size={14} />
                  {item}
                </li>
              ))}
            </ul>

            <ButtonLink
              block
              href={`/kontakt?rodzaj=${audience}`}
              size="lg"
              variant="primary"
            >
              Przejdź do formularza
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
          </Card>
        </div>
      </section>
    </>
  );
}

/**
 * Siatka obszarow — rozwiazanie dziury w ostatnim rzedzie.
 *
 * PROBLEM
 * Wzorzec stawia piec kart w `repeat(3, 1fr)`, wiec ostatni rzad ma dwie karty
 * i jedna puste pole po prawej. Wyglada to na brakujaca tresc, a nie na
 * zamierzony uklad. Wzorzec tego nie rozwiazuje — nie ma tam ani jednej reguly
 * `@media`, a liczba kategorii jest w nim wpisana na sztywno.
 *
 * DLACZEGO NIE "AUTO-FIT"
 * `repeat(auto-fit, minmax(...))` nie pomaga: przy piecioraz kartach i trzech
 * kolumnach dziura zostaje dokladnie taka sama. Przy czterech kolumnach dziura
 * jest wieksza (3 + 1), a przy dwoch karty robia sie za szerokie na tresc.
 *
 * ROZWIAZANIE
 * Siatka ma SZESC rownych torow, a kazda karta zajmuje dwa. Przy liczbie kart
 * niepodzielnej przez 3 ostatni rzad jest WYSRODKOWANY: dwie karty startuja
 * z toru 2 i 4, jedna — z toru 3. Zamiast dziury po prawej powstaja rowne
 * marginesy z obu stron, czyli uklad, ktory czyta sie jako domkniety.
 *
 * Reszta liczona jest w React, a nie w CSS, bo liczba kategorii pochodzi z bazy
 * i CSS nie zna liczby dzieci. Modyfikator jest jeden na siatke; same karty nie
 * dostaja nic, wiec dodanie szostej kategorii w panelu wraca do pelnych rzedow
 * bez zmiany w kodzie.
 */
export function areaGridClassName(count: number): string {
  const remainder = count % 3;
  if (remainder === 0) return "home-area-grid";
  return `home-area-grid home-area-grid-orphans-${remainder}`;
}

/**
 * Siatka wyroznionych szkolen — liczba kolumn idzie za liczba kart.
 *
 * Wzorzec ma `repeat(4, 1fr)` i cztery pozycje wpisane na sztywno, wiec nigdy
 * nie widzi niepelnego rzedu. W produkcie liczba wyroznionych jest decyzja
 * administratora: przy jednej pozycji (stan zasiewu) siatka czterokolumnowa
 * zostawia karte szerokosci 1/4 przy lewej krawedzi i trzy puste tory —
 * wyglada to na blad wczytywania, a nie na uklad.
 *
 * Defekt byl widoczny dopiero na zrzucie; zadna bramka go nie lapie, bo
 * przepelnienia nie ma, kontrast sie zgadza i wszystkie linki dzialaja.
 */
export function featuredGridClassName(count: number): string {
  if (count >= 4) return "home-featured-grid";
  return `home-featured-grid home-featured-grid-${count}`;
}
