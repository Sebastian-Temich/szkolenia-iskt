# Plan dostawy MVP — szkolenia.iskt.pl

- **Zlecenie:** ISK-339 „Etap 0 — utworzenie strony szkolenia iskt”
- **Autor:** Koordynator Techniczny / Intake Lead
- **Data:** 2026-10-09
- **Tryb autonomii:** `limited`
- **Status:** **zatwierdzony przez ISKT 2026-10-09** (bramka planu zamknięta). Etapy E1 i E2 odblokowane i uruchomione; graf dostawy ISK-340 … ISK-354 utworzony. Źródło: dokument `plan` na karcie ISK-339, rewizja 2.
- **Uzgodnienie wobec stanu faktycznego:** 2026-10-10, etap E9T (ISK-351)

Publiczna publikacja nie jest częścią tego zlecenia. Celem jest MVP zbudowane i przetestowane lokalnie.

---

## 1. Wynik intake

| Pozycja                      | Ocena                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Komplet danych wejściowych   | **tak** — brief, wymagania, ryzyka, Project Access Card, materiał referencyjny designu                                                                                                |
| Repozytorium i branch bazowy | **tak** — `Sebastian-Temich/szkolenia-iskt`, `main`, folder roboczy zarządzany przez Paperclip                                                                                        |
| Cel CI                       | **GitHub Actions**; Forgejo local pominięty — decyzja ISKT w zleceniu i wpis „nie dotyczy” w Project Access Card (uzasadnienie: [ADR-0005 D1](adr/ADR-0005-ci-i-strategia-testow.md)) |
| Supabase                     | projekt istnieje, ale jest oznaczony jako **produkcyjny** → cała praca na lokalnym stacku ([ADR-0002](adr/ADR-0002-srodowisko-lokalne-i-supabase.md))                                 |
| Sekrety                      | **brak i niepotrzebne** do Etapów 1–6; żaden sekret nie jest wymagany do przejścia CI                                                                                                 |
| Lovable                      | nie dotyczy — źródłem prawdy jest repozytorium GitHub                                                                                                                                 |
| Blokady startu implementacji | wyłącznie zatwierdzenie tego planu                                                                                                                                                    |

### Ocena wpływu na dokumentację (wymagana przy każdym intake)

| Obszar                           | Decyzja | Uzasadnienie                                                        |
| -------------------------------- | ------- | ------------------------------------------------------------------- |
| Dokumentacja produktowa          | **tak** | instrukcja administratora, opis publikacji treści, obsługa zgłoszeń |
| Dokumentacja techniczna          | **tak** | ADR-0001…0006, model danych, RLS, migracje, runbook, `.env.example` |
| Screenshoty / materiały wizualne | **tak** | dowody RWD i a11y z QA, zrzuty panelu do handoffu                   |
| Handoff                          | **tak** | raport końcowy Delivery Controller z tabelą odbioru                 |

---

## 2. Decyzje techniczne (ADR)

| ADR                                                       | Temat                       | Rekomendacja                                                                                                                                    |
| --------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0001](adr/ADR-0001-stack-aplikacji.md)               | stack aplikacji             | Next.js 16 App Router + TypeScript strict + Tailwind v4 + Supabase + Zod + Resend; testy Vitest i Playwright                                    |
| [ADR-0002](adr/ADR-0002-srodowisko-lokalne-i-supabase.md) | środowisko lokalne          | lokalny stack Supabase przez CLI/Docker; twardy zakaz operacji na projekcie produkcyjnym; adapter poczty `log`                                  |
| [ADR-0003](adr/ADR-0003-model-danych-migracje-rls.md)     | model danych, migracje, RLS | 9 tabel, publikacja jako pole, zapis zgłoszeń tylko warstwą serwerową, administrator rozpoznawany tabelą `admin_users`, domyślna odmowa dostępu |
| [ADR-0004](adr/ADR-0004-formularze-antyspam-resend.md)    | formularz, antyspam, Resend | honeypot + podpisany token czasowy + limit częstości + limity treści; Turnstile przygotowany i wyłączony; zapis przed wysyłką maila             |
| [ADR-0005](adr/ADR-0005-ci-i-strategia-testow.md)         | CI i testy                  | GitHub Actions: `quality`, `database`, `e2e`; TDD dla walidacji, statusów i kontroli dostępu; 9 krytycznych ścieżek E2E                         |
| [ADR-0006](adr/ADR-0006-hosting.md)                       | hosting produkcyjny         | rekomendacja Vercel, decyzja odroczona; reguły neutralności dostawcy obowiązują od Etapu 1                                                      |

Szczegóły modelu danych i macierz dostępu: [`docs/architektura/model-danych.md`](architektura/model-danych.md).

---

## 3. Etapy, właściciele i zależności

| Etap    | Zakres                                                                                                                                    | Właściciel (rola)                                     | Zależy od  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| **E0**  | intake, plan, ADR-0001…0006, model danych, runbook, `.env.example`                                                                        | Koordynator Techniczny / Intake Lead                  | —          |
| **E1**  | fundament repozytorium: szkielet Next.js, TS strict, Tailwind v4 z tokenami ISKT, ESLint/Prettier, Vitest, Playwright, `ci.yml`, `.nvmrc` | Frontend Engineer / Repo Developer                    | E0         |
| **E2**  | Supabase: migracje, funkcje, triggery, polityki RLS, seed demo, testy RLS pozytywne i negatywne, dowód `supabase db reset`                | Inżynier Backend / Supabase                           | E0         |
| **E2R** | review architektury i modelu danych przed implementacją E3–E5                                                                             | Architekt Rozwiązania                                 | E2         |
| **E3**  | publiczny frontend: strona główna, katalog z filtrem i wyszukiwaniem, szczegół szkolenia, trenerzy, kontakt, SEO, RWD                     | Frontend Engineer / Repo Developer                    | E1, E2     |
| **E4**  | formularze osoby i firmy: walidacja Zod, antyspam, zapis, adapter poczty, obsługa błędów                                                  | Inżynier Backend / Supabase                           | E1, E2     |
| **E5**  | panel administratora: logowanie, CRUD szkoleń i trenerów, publikacja/wycofanie, lista i statusy zgłoszeń, inwalidacja cache               | Frontend Engineer + Inżynier Backend                  | E2         |
| **E6**  | QA funkcjonalne, RWD, WCAG 2.1 AA, E2E, raport QA                                                                                         | QA / Tester                                           | E3, E4, E5 |
| **E6U** | review UX i zgodności z design systemem ISKT                                                                                              | UX / Design Reviewer                                  | E3, E5     |
| **E7**  | security review: RLS, sekrety, formularze, nagłówki, komunikaty błędów                                                                    | Security Reviewer                                     | E6         |
| **E7C** | code review PR-ów implementacyjnych                                                                                                       | Code Reviewer / Cross-review                          | E3, E4, E5 |
| **E8**  | review zgodności RODO: klauzula, retencja, lista procesorów, minimalizacja danych                                                         | Analityk Zgodności Technicznej RODO / AI Act          | E4         |
| **E9**  | dokumentacja: aktualizacja ADR, instrukcja administratora, runbook, Obsidian                                                              | Dokumentalista Techniczny + Dokumentalista Produktowy | E6, E7, E8 |
| **E10** | handoff: tabela odbioru, dowody, blockery, rekomendacja                                                                                   | Delivery Controller / Release Coordinator             | E9         |

### Ścieżka krytyczna

```
E0 ──► E1 ──┬──► E3 ──┐
            │          │
E0 ──► E2 ──┼──► E4 ──┼──► E6 ──► E7 ──► E9 ──► E10
      │     │          │
      └ E2R └──► E5 ──┘
                 E6U ──┘        E7C (równolegle z E3–E5)      E8 (po E4)
```

E3, E4 i E5 mogą biec równolegle po zakończeniu E1 i E2. E7C towarzyszy każdemu PR-owi, nie jest osobnym etapem w czasie.

---

## 4. Definition of Done i wymagane dowody

| Etap | Definition of Done                                                                                                                                                                                               | Dowód                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| E0   | plan, 6 ADR, model danych z macierzą RLS, runbook, `.env.example`, plan delegacji, lista decyzji ISKT                                                                                                            | PR z dokumentacją, dokument planu w Paperclipie, aktualizacja Obsidiana |
| E1   | `npm run lint`, `typecheck`, `test:unit`, `build` przechodzą lokalnie i w CI; tokeny design systemu dostępne jako zmienne Tailwind; CI zielone na PR                                                             | PR, zielony przebieg GitHub Actions                                     |
| E2   | migracje wersjonowane; `supabase db reset` odtwarza schemat od zera; wszystkie testy pozytywne i negatywne RLS z `model-danych.md` przechodzą; brak tabeli w `public` z wyłączonym RLS                           | PR, log `db reset`, raport testów integracyjnych                        |
| E2R  | ADR i model danych zaakceptowane lub zmienione z uzasadnieniem                                                                                                                                                   | komentarz review w Paperclipie / PR                                     |
| E3   | publiczne widoki zgodne z referencją; widoczne wyłącznie treści opublikowane; filtr i wyszukiwanie działają; metadane SEO i mapa witryny; RWD 360/768/1280                                                       | PR, zrzuty ekranu, CI                                                   |
| E4   | walidacja klient i serwer; zgłoszenie zapisane ze statusem `nowe`; powiadomienie inicjowane adapterem; błąd wysyłki nie kasuje zgłoszenia; antyspam działa; brak danych osobowych w logach i komunikatach błędów | PR, testy jednostkowe i integracyjne, CI                                |
| E5   | logowanie; CRUD szkoleń i trenerów; publikacja i wycofanie widoczne publicznie po inwalidacji cache; lista, podgląd i zmiana statusu zgłoszeń; widoczny status powiadomienia                                     | PR, testy E2E, zrzuty ekranu                                            |
| E6   | 9 krytycznych ścieżek E2E zielonych; skan axe bez naruszeń krytycznych; nawigacja klawiaturą; raport QA z listą defektów i ich statusem                                                                          | raport QA, raport Playwright, zrzuty ekranu                             |
| E6U  | zgodność z design systemem i akceptacja UX albo lista poprawek                                                                                                                                                   | raport review                                                           |
| E7   | przegląd polityk RLS, zarządzania sekretami, nagłówków bezpieczeństwa, komunikatów błędów; potwierdzenie braku sekretów w repozytorium i froncie                                                                 | raport security review                                                  |
| E7C  | każdy PR implementacyjny ma zatwierdzone review                                                                                                                                                                  | historia PR                                                             |
| E8   | ocena klauzuli, retencji, listy procesorów i minimalizacji danych; lista braków dla ISKT                                                                                                                         | raport zgodności                                                        |
| E9   | ADR aktualne, instrukcja administratora, runbook, Obsidian zsynchronizowany                                                                                                                                      | linki do Obsidiana i repozytorium                                       |
| E10  | tabela odbioru z dowodami, lista braków, blockery, rekomendacja                                                                                                                                                  | raport końcowy                                                          |

---

## 5. Bramki

| Bramka               | Kto decyduje                                           | Kiedy                             |
| -------------------- | ------------------------------------------------------ | --------------------------------- |
| Plan                 | **ISKT**                                               | teraz — blokuje E1 i E2           |
| Architektura         | Architekt Rozwiązania                                  | po E2, przed E3–E5                |
| Code review          | Code Reviewer / Cross-review                           | każdy PR                          |
| CI                   | GitHub Actions                                         | każdy PR, obowiązkowo przed merge |
| QA                   | QA / Tester                                            | po E3–E5                          |
| Security             | Security Reviewer                                      | po E6                             |
| Zgodność RODO        | Analityk Zgodności + **ISKT** (zatwierdzenie klauzuli) | po E4                             |
| Dokumentacja         | Dokumentalista Techniczny i Produktowy                 | po E6–E8                          |
| Release / publikacja | **ISKT**                                               | poza zakresem tego zlecenia       |

---

## 6. Ryzyka

| Ryzyko                                                                                     | Wpływ                                                                                                       | Mitygacja                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produkcyjny projekt Supabase jako jedyne środowisko                                        | utrata lub zanieczyszczenie danych                                                                          | lokalny stack, twardy zakaz operacji na produkcji ([ADR-0002](adr/ADR-0002-srodowisko-lokalne-i-supabase.md))                                                                                                                                                                                                                                                                                              |
| Wyciek sekretu do frontendu                                                                | krytyczne naruszenie bezpieczeństwa                                                                         | sekrety wyłącznie serwerowe, zakaz `NEXT_PUBLIC_` dla sekretów, kontrola w security review, skan repozytorium                                                                                                                                                                                                                                                                                              |
| Dane osobowe przed zatwierdzeniem klauzuli                                                 | naruszenie RODO                                                                                             | formularz tylko lokalnie; brak realnych zgłoszeń; wersjonowanie klauzuli w `inquiries.rodo_clause_version`                                                                                                                                                                                                                                                                                                 |
| Spam na formularzu                                                                         | zalew zgłoszeń, koszt Resend                                                                                | cztery warstwy antyspamowe, Turnstile gotowy do włączenia                                                                                                                                                                                                                                                                                                                                                  |
| Brak finalnych treści, cen i zdjęć                                                         | niemożliwa publikacja                                                                                       | seed demonstracyjny `[DEMO]`; treści jako bramka ISKT przed publikacją                                                                                                                                                                                                                                                                                                                                     |
| Brak praw do wizerunku trenerów                                                            | ryzyko prawne                                                                                               | `trainers.photo_url` dopuszcza `NULL`, widoki działają bez zdjęcia                                                                                                                                                                                                                                                                                                                                         |
| Brak stemmingu polskiego w wyszukiwaniu                                                    | słabsze wyniki dla form odmienionych                                                                        | `unaccent` + indeks trigramowy; ponowna ocena po dostarczeniu treści                                                                                                                                                                                                                                                                                                                                       |
| **Agenci `Security Reviewer` i `Code Reviewer / Cross-review` są w stanie `error`**        | bramki security i code review nierealizowalne                                                               | ISKT 2026-10-09: **operator przywróci obu agentów** — śledzone jako **ISK-354**, wpisane jako pierwszoklasowy bloker na ISK-347 (E7C) i ISK-350 (E7). **Zamknięte:** ISK-354 wykonane, obie bramki przeprowadzone.                                                                                                                                                                                         |
| **Repozytorium `Sebastian-Temich/szkolenia-iskt` jest publiczne**                          | ADR-y, model danych, polityki RLS i kod są jawne; ryzyko przypadkowego ujawnienia identyfikatorów środowisk | ISKT 2026-10-09: **repozytorium pozostaje publiczne** — decyzja świadoma. Mitygacja jest **trwała, nie tymczasowa**: identyfikator produkcyjnego projektu Supabase usunięty z repozytorium, reguła „zero identyfikatorów środowisk w repo” obowiązuje w kodzie, dokumentacji, testach, logach i opisach zadań; weryfikacja wykonana w bramce E7 (ISK-350) — skan historii wszystkich gałęzi, zero trafień. |
| ~~Minuty GitHub Actions po zmianie na repozytorium prywatne~~                              | —                                                                                                           | **nieaktualne** — ISKT potwierdziło 2026-10-09, że repozytorium pozostaje publiczne, więc CI jest bezpłatne. Punkt dla FinOps wraca tylko przy ewentualnej zmianie widoczności.                                                                                                                                                                                                                            |
| **Brak nagłówków bezpieczeństwa i obejście limitu częstości nagłówkiem `X-Forwarded-For`** | clickjacking panelu z danymi osobowymi; nieograniczony zapis zgłoszeń                                       | zmierzone i opisane w bramce E7 (ustalenia W1 i W2); **nienaprawione** — pozycje na [liście braków](odbior/braki-i-decyzje-iskt.md#nienaprawione--do-zaplanowania-przez-właścicieli-etapów)                                                                                                                                                                                                                |
| **Poprawka bezpieczeństwa scalona na gałęzi etapowej nie dociera do linii integracyjnej**  | regresja przechodzi bramkę QA niezauważona                                                                  | zmaterializowało się: defekt P0 (ISK-356) nie trafił do integracji razem ze swoim testem. Mitygacja: wymóg „testy bezpieczeństwa z gałęzi etapowych biegną na linii integracyjnej” wpisany w [ADR-0005](adr/ADR-0005-ci-i-strategia-testow.md); docelowo branch protection na `main` (decyzja ISKT)                                                                                                        |

---

## 7. Decyzje wymagane od ISKT

> **Aktualna, skonsolidowana lista wszystkiego, co czeka na ISKT:** [`docs/odbior/braki-i-decyzje-iskt.md`](odbior/braki-i-decyzje-iskt.md). Zebrano w niej pozycje z tej sekcji, z sekcji „Wymagane decyzje ISKT” wszystkich ADR-ów oraz z raportów bramek E2R, E6, E7 i E8 — 31 pozycji z właścicielem i momentem, do którego są potrzebne. Tabele poniżej zachowujemy jako zapis stanu bramki planu.

### Blokujące start implementacji — wszystkie rozstrzygnięte 2026-10-09

| #   | Decyzja                                                                                           | Rozstrzygnięcie ISKT                                                            | Stan                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Zatwierdzenie stacku z ADR-0001                                                                   | zatwierdzony                                                                    | **zamknięte** — E1 (ISK-340) uruchomione                                                                                 |
| 2   | Zatwierdzenie strategii lokalnego Supabase i zakazu operacji na projekcie produkcyjnym (ADR-0002) | zatwierdzony                                                                    | **zamknięte** — E2 (ISK-341) uruchomione                                                                                 |
| 3   | Zatwierdzenie modelu danych i macierzy RLS (ADR-0003)                                             | zatwierdzony                                                                    | **zamknięte**                                                                                                            |
| 4   | Zatwierdzenie zestawu antyspamowego i rekomendacji „Turnstile wyłączony” (ADR-0004)               | zatwierdzony                                                                    | **zamknięte**                                                                                                            |
| 5   | Akceptacja pominięcia Forgejo local i oparcia bramki CI na GitHub Actions (ADR-0005)              | zatwierdzony                                                                    | **zamknięte**                                                                                                            |
| 6   | Przywrócenie agentów `Security Reviewer` i `Code Reviewer / Cross-review` (stan `error`)          | **operator przywróci obu agentów** — bez odstępstwa od kryteriów akceptacji §12 | **zamknięte** — ISK-354 wykonane; bramki E7 (ISK-350) i E7C (ISK-347) przeprowadzone                                     |
| 7   | Potwierdzenie, czy repozytorium ma pozostać **publiczne**                                         | **tak, pozostaje publiczne**                                                    | **zamknięte** — reguła „zero identyfikatorów środowisk w repo” obowiązuje na stałe; punkt kontrolny wykonany w bramce E7 |

### Potrzebne później, nie blokują startu — stan na 2026-10-10

| #   | Decyzja                                                              | Potrzebna przed                           | Stan                                                                                                                                                                | Pozycja na liście skonsolidowanej |
| --- | -------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 8   | Potwierdzenie retencji 12 miesięcy **i trybu jej wykonywania**       | przyjęciem pierwszego realnego zgłoszenia | **otwarte** — bramka E8 wykazała, że samo potwierdzenie okresu nie wystarcza: potrzebny jest harmonogram albo procedura z imiennym właścicielem i rejestrem wykonań | I10–I14                           |
| 9   | Zatwierdzenie finalnej klauzuli informacyjnej i polityki prywatności | publikacją formularza                     | **otwarte** — bramka E8 rozpisała wymagany zakres na 13 pozycji (K1–K13)                                                                                            | I1–I5                             |
| 10  | Przekazanie `RESEND_API_KEY` i weryfikacja domeny nadawcy            | realną wysyłką powiadomień                | **otwarte**                                                                                                                                                         | I22                               |
| 11  | Ustanowienie konta administratora i wiersza w `admin_users`          | wdrożeniem                                | **otwarte**                                                                                                                                                         | I21                               |
| 12  | Czy ceny są publiczne w MVP, czy „Zapytaj o cenę”                    | publikacją treści                         | **otwarte** — katalog pokazuje dziś cenę z seedu `[DEMO]`                                                                                                           | I16                               |
| 13  | Potwierdzenie listy kategorii startowych                             | publikacją treści                         | **otwarte**                                                                                                                                                         | I17                               |
| 14  | Czy utworzyć osobny projekt `szkolenia-iskt-dev`                     | środowiskiem współdzielonym               | **otwarte** — cały MVP powstał bez środowiska współdzielonego, więc nic to nie blokowało                                                                            | I29                               |
| 15  | Wybór hostingu: Vercel czy Netlify (ADR-0006)                        | deployem                                  | **otwarte**                                                                                                                                                         | I24                               |
| 16  | Włączenie branch protection na `main`                                | pierwszym merge do `main`                 | **otwarte** — dziś nic nie wymusza przejścia CI ani review przed scaleniem                                                                                          | I28                               |
| 17  | Finalne treści, ceny, terminy, zdjęcia z prawami do wizerunku        | publikacją                                | **otwarte**                                                                                                                                                         | I19–I20                           |

---

## 8. Czego ten plan nie obejmuje

Zgodnie z §4 zlecenia: publicznego deployu, domeny i hostingu; modułu aktualnych naborów i terminów; płatności, rezerwacji i sprzedaży; kont uczestników i firm; newslettera, CRM, BUR/KFS, e-learningu; uploadu plików i funkcji AI; użycia finalnych treści i danych osobowych przed ich przekazaniem i zatwierdzeniem.
