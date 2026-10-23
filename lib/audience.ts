import type { IconName } from "@/components/ui";
import { INQUIRY_KINDS } from "@/lib/validation/inquiry";

/**
 * Przelacznik audytorium strony glownej.
 *
 * CO TO JEST, A CZYM NIE JEST
 * To personalizacja TRESCI, nie filtr danych. Jeden stan przelacza nadtytul,
 * H1, lead, etykiete CTA, tytul i cztery kroki sekcji procesu, naglowek sekcji
 * kontaktu oraz rodzaj zgloszenia w formularzu. Katalog, obszary i ceny sa
 * identyczne w obu stanach — nie ma zadnego zapytania, ktore by sie zmienialo,
 * i nie ma zadnej kolumny, ktorej by do tego brakowalo. Dlatego cale to
 * rozwiazanie jest statycznym slownikiem, a nie polem w bazie: model danych
 * zostaje nietkniety (granica ISK-399).
 *
 * `kind` zgloszenia (`osoba` / `firma`) z `lib/validation/inquiry.ts` jest tym
 * samym podzialem, wiec stan audytorium i wartosc pola formularza to jedna
 * rzecz, a nie dwie trzymane w zgodzie recznie.
 *
 * ISK-399 / D1: zaden z tych tekstow nie zawiera procentu, progu dofinansowania,
 * oceny ani SLA. Wzorzec ma w leadzie "dofinansowaniem nawet do 80%" w obu
 * wariantach — tego nie przenosimy.
 */
/**
 * Stan audytorium JEST rodzajem zgloszenia, a nie jego odpowiednikiem trzymanym
 * w zgodzie recznie. Zrodlem nazw zostaje `lib/validation/inquiry.ts` (plik
 * nietykalny w ISK-399) — dodanie tam trzeciego rodzaju wywali tu kompilacje
 * `AUDIENCE_COPY`, zamiast po cichu pokazac pusty hero.
 */
export const AUDIENCES = INQUIRY_KINDS;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_DEFAULT: Audience = "osoba";

/** Etykiety samego przelacznika — nie zmieniaja sie wraz ze stanem. */
export const AUDIENCE_SWITCH_LABELS: Record<Audience, string> = {
  osoba: "Dla Ciebie",
  firma: "Dla firm",
};

/** Etykiety tego samego podzialu w formularzu zgloszenia. */
export const AUDIENCE_FORM_LABELS: Record<Audience, string> = {
  osoba: "Osoba indywidualna",
  firma: "Firma",
};

export type ProcessStep = {
  icon: IconName;
  title: string;
  description: string;
};

export type AudienceCopy = {
  heroEyebrow: string;
  heroTitle: string;
  heroLead: string;
  heroCta: string;
  processTitle: string;
  processLead: string;
  contactTitle: string;
  contactLead: string;
  processSteps: ProcessStep[];
};

export const AUDIENCE_COPY: Record<Audience, AudienceCopy> = {
  osoba: {
    heroEyebrow: "Szkolenia ISKT",
    heroTitle: "Rozwijaj kompetencje przyszłości.",
    heroLead:
      "[DEMO] Praktyczne szkolenia z AI, ESG, oprogramowania i języka angielskiego, prowadzone przez ekspertów. Ucz się w swoim tempie.",
    heroCta: "Zapisz się na szkolenie",
    processTitle: "Od zapisu do nowych kompetencji w 4 krokach",
    processLead:
      "[DEMO] Prosty proces, który przeprowadzi Cię od wyboru tematu po nowe kompetencje.",
    contactTitle: "Zapisz się na szkolenie",
    contactLead:
      "Zostaw kontakt — dobierzemy szkolenie i odpowiemy na podany adres e-mail.",
    processSteps: [
      {
        icon: "search",
        title: "Wybierz szkolenie",
        description:
          "[DEMO] Przeglądaj katalog i wybierz temat dopasowany do swoich celów.",
      },
      {
        icon: "clipboard-list",
        title: "Wyślij zgłoszenie",
        description:
          "[DEMO] Wypełnij formularz — odpowiemy na podany adres e-mail.",
      },
      {
        /**
         * ISK-426 / I-1 (druga ofiara tej samej luki). Bylo „Ucz sie
         * z ekspertem” — rendered jako `<h3 className="home-step-title">`
         * na `/`. To ta SAMA ocena kompetencji, ktora ISK-409 / CR-I2 usunal
         * z punktow hero („Prowadzenie przez ekspertów”); przezyla tylko
         * dlatego, ze tamta asercja byla zawezona do `.home-hero-points`.
         * Rozszerzenie bramki na kazdy naglowek na `/` zlapalo ja od razu.
         *
         * „Prowadzacy” to FAKT O KATALOGU, nie ocena: kolumna
         * `training_trainers` istnieje, a widok szczegolu renderuje z niej
         * sekcje „Prowadzący” — dokladnie to samo oparcie, ktore ma przyjety
         * punkt hero „Prowadzący wskazani przy szkoleniu”. Ocena jakosci
         * („praktyków”) zostaje w `description`, bo akapit wolno oznaczyc
         * `[DEMO]`, a naglowka nie.
         */
        icon: "book-open",
        title: "Ucz się z prowadzącym",
        description:
          "[DEMO] Zajęcia prowadzone przez praktyków, z materiałami do pracy własnej.",
      },
      {
        icon: "award",
        title: "Potwierdź kompetencje",
        description:
          "[DEMO] Zakres potwierdzenia ukończenia szkolenia ustalamy przed startem.",
      },
    ],
  },
  firma: {
    heroEyebrow: "Szkolenia dla firm",
    heroTitle: "Podnieś kompetencje całego zespołu.",
    heroLead:
      "[DEMO] Szkolenia dopasowane do organizacji — AI, ESG, software i angielski biznesowy. Stacjonarnie lub online.",
    heroCta: "Zapytaj o szkolenie dla firmy",
    processTitle: "Szkolenie dla zespołu w 4 krokach",
    processLead:
      "[DEMO] Prowadzimy firmę przez cały proces — od analizy potrzeb po pomiar efektów.",
    contactTitle: "Zapytaj o szkolenie dla firmy",
    contactLead:
      "Opowiedz nam o zespole — przygotujemy program i odpowiemy na podany adres e-mail.",
    processSteps: [
      {
        icon: "target",
        title: "Analiza potrzeb",
        description:
          "[DEMO] Rozmowa o celach i zakresie kompetencji potrzebnych w zespole.",
      },
      {
        icon: "layers",
        title: "Program na miarę",
        description:
          "[DEMO] Projektujemy zakres, format i harmonogram pod cele biznesowe.",
      },
      {
        icon: "handshake",
        title: "Realizacja",
        description:
          "[DEMO] Szkolenie zamknięte u Ciebie lub online, w ustalonym terminie.",
      },
      {
        icon: "trending-up",
        title: "Raport efektów",
        description:
          "[DEMO] Podsumowanie przebiegu i rekomendacje dalszych ścieżek rozwoju.",
      },
    ],
  },
};

/** Bezpieczne odczytanie stanu z wartosci spoza typu (np. z adresu). */
export function toAudience(value: unknown): Audience {
  return AUDIENCES.includes(value as Audience)
    ? (value as Audience)
    : AUDIENCE_DEFAULT;
}
