# Plan dostawy MVP — szkolenia.iskt.pl

- **Zlecenie:** ISK-339 „Etap 0 — utworzenie strony szkolenia iskt”
- **Autor:** Koordynator Techniczny / Intake Lead
- **Data:** 2026-10-09
- **Tryb autonomii:** `limited`
- **Status:** do zatwierdzenia przez ISKT (bramka planu)

Publiczna publikacja nie jest częścią tego zlecenia. Celem jest MVP zbudowane i przetestowane lokalnie.

---

## 1. Wynik intake

| Pozycja | Ocena |
| --- | --- |
| Komplet danych wejściowych | **tak** — brief, wymagania, ryzyka, Project Access Card, materiał referencyjny designu |
| Repozytorium i branch bazowy | **tak** — `Sebastian-Temich/szkolenia-iskt`, `main`, folder roboczy zarządzany przez Paperclip |
| Cel CI | **GitHub Actions**; Forgejo local pominięty — decyzja ISKT w zleceniu i wpis „nie dotyczy” w Project Access Card (uzasadnienie: [ADR-0005 D1](adr/ADR-0005-ci-i-strategia-testow.md)) |
| Supabase | projekt istnieje, ale jest oznaczony jako **produkcyjny** → cała praca na lokalnym stacku ([ADR-0002](adr/ADR-0002-srodowisko-lokalne-i-supabase.md)) |
| Sekrety | **brak i niepotrzebne** do Etapów 1–6; żaden sekret nie jest wymagany do przejścia CI |
| Lovable | nie dotyczy — źródłem prawdy jest repozytorium GitHub |
| Blokady startu implementacji | wyłącznie zatwierdzenie tego planu |

### Ocena wpływu na dokumentację (wymagana przy każdym intake)

| Obszar | Decyzja | Uzasadnienie |
| --- | --- | --- |
| Dokumentacja produktowa | **tak** | instrukcja administratora, opis publikacji treści, obsługa zgłoszeń |
| Dokumentacja techniczna | **tak** | ADR-0001…0006, model danych, RLS, migracje, runbook, `.env.example` |
| Screenshoty / materiały wizualne | **tak** | dowody RWD i a11y z QA, zrzuty panelu do handoffu |
| Handoff | **tak** | raport końcowy Delivery Controller z tabelą odbioru |

---

## 2. Decyzje techniczne (ADR)

| ADR | Temat | Rekomendacja |
| --- | --- | --- |
| [ADR-0001](adr/ADR-0001-stack-aplikacji.md) | stack aplikacji | Next.js 16 App Router + TypeScript strict + Tailwind v4 + Supabase + Zod + Resend; testy Vitest i Playwright |
| [ADR-0002](adr/ADR-0002-srodowisko-lokalne-i-supabase.md) | środowisko lokalne | lokalny stack Supabase przez CLI/Docker; twardy zakaz operacji na projekcie produkcyjnym; adapter poczty `log` |
| [ADR-0003](adr/ADR-0003-model-danych-migracje-rls.md) | model danych, migracje, RLS | 9 tabel, publikacja jako pole, zapis zgłoszeń tylko warstwą serwerową, administrator rozpoznawany tabelą `admin_users`, domyślna odmowa dostępu |
| [ADR-0004](adr/ADR-0004-formularze-antyspam-resend.md) | formularz, antyspam, Resend | honeypot + podpisany token czasowy + limit częstości + limity treści; Turnstile przygotowany i wyłączony; zapis przed wysyłką maila |
| [ADR-0005](adr/ADR-0005-ci-i-strategia-testow.md) | CI i testy | GitHub Actions: `quality`, `database`, `e2e`; TDD dla walidacji, statusów i kontroli dostępu; 9 krytycznych ścieżek E2E |
| [ADR-0006](adr/ADR-0006-hosting.md) | hosting produkcyjny | rekomendacja Vercel, decyzja odroczona; reguły neutralności dostawcy obowiązują od Etapu 1 |

Szczegóły modelu danych i macierz dostępu: [`docs/architektura/model-danych.md`](architektura/model-danych.md).

---

## 3. Etapy, właściciele i zależności

| Etap | Zakres | Właściciel (rola) | Zależy od |
| --- | --- | --- | --- |
| **E0** | intake, plan, ADR-0001…0006, model danych, runbook, `.env.example` | Koordynator Techniczny / Intake Lead | — |
| **E1** | fundament repozytorium: szkielet Next.js, TS strict, Tailwind v4 z tokenami ISKT, ESLint/Prettier, Vitest, Playwright, `ci.yml`, `.nvmrc` | Frontend Engineer / Repo Developer | E0 |
| **E2** | Supabase: migracje, funkcje, triggery, polityki RLS, seed demo, testy RLS pozytywne i negatywne, dowód `supabase db reset` | Inżynier Backend / Supabase | E0 |
| **E2R** | review architektury i modelu danych przed implementacją E3–E5 | Architekt Rozwiązania | E2 |
| **E3** | publiczny frontend: strona główna, katalog z filtrem i wyszukiwaniem, szczegół szkolenia, trenerzy, kontakt, SEO, RWD | Frontend Engineer / Repo Developer | E1, E2 |
| **E4** | formularze osoby i firmy: walidacja Zod, antyspam, zapis, adapter poczty, obsługa błędów | Inżynier Backend / Supabase | E1, E2 |
| **E5** | panel administratora: logowanie, CRUD szkoleń i trenerów, publikacja/wycofanie, lista i statusy zgłoszeń, inwalidacja cache | Frontend Engineer + Inżynier Backend | E2 |
| **E6** | QA funkcjonalne, RWD, WCAG 2.1 AA, E2E, raport QA | QA / Tester | E3, E4, E5 |
| **E6U** | review UX i zgodności z design systemem ISKT | UX / Design Reviewer | E3, E5 |
| **E7** | security review: RLS, sekrety, formularze, nagłówki, komunikaty błędów | Security Reviewer | E6 |
| **E7C** | code review PR-ów implementacyjnych | Code Reviewer / Cross-review | E3, E4, E5 |
| **E8** | review zgodności RODO: klauzula, retencja, lista procesorów, minimalizacja danych | Analityk Zgodności Technicznej RODO / AI Act | E4 |
| **E9** | dokumentacja: aktualizacja ADR, instrukcja administratora, runbook, Obsidian | Dokumentalista Techniczny + Dokumentalista Produktowy | E6, E7, E8 |
| **E10** | handoff: tabela odbioru, dowody, blockery, rekomendacja | Delivery Controller / Release Coordinator | E9 |

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

| Etap | Definition of Done | Dowód |
| --- | --- | --- |
| E0 | plan, 6 ADR, model danych z macierzą RLS, runbook, `.env.example`, plan delegacji, lista decyzji ISKT | PR z dokumentacją, dokument planu w Paperclipie, aktualizacja Obsidiana |
| E1 | `npm run lint`, `typecheck`, `test:unit`, `build` przechodzą lokalnie i w CI; tokeny design systemu dostępne jako zmienne Tailwind; CI zielone na PR | PR, zielony przebieg GitHub Actions |
| E2 | migracje wersjonowane; `supabase db reset` odtwarza schemat od zera; wszystkie testy pozytywne i negatywne RLS z `model-danych.md` przechodzą; brak tabeli w `public` z wyłączonym RLS | PR, log `db reset`, raport testów integracyjnych |
| E2R | ADR i model danych zaakceptowane lub zmienione z uzasadnieniem | komentarz review w Paperclipie / PR |
| E3 | publiczne widoki zgodne z referencją; widoczne wyłącznie treści opublikowane; filtr i wyszukiwanie działają; metadane SEO i mapa witryny; RWD 360/768/1280 | PR, zrzuty ekranu, CI |
| E4 | walidacja klient i serwer; zgłoszenie zapisane ze statusem `nowe`; powiadomienie inicjowane adapterem; błąd wysyłki nie kasuje zgłoszenia; antyspam działa; brak danych osobowych w logach i komunikatach błędów | PR, testy jednostkowe i integracyjne, CI |
| E5 | logowanie; CRUD szkoleń i trenerów; publikacja i wycofanie widoczne publicznie po inwalidacji cache; lista, podgląd i zmiana statusu zgłoszeń; widoczny status powiadomienia | PR, testy E2E, zrzuty ekranu |
| E6 | 9 krytycznych ścieżek E2E zielonych; skan axe bez naruszeń krytycznych; nawigacja klawiaturą; raport QA z listą defektów i ich statusem | raport QA, raport Playwright, zrzuty ekranu |
| E6U | zgodność z design systemem i akceptacja UX albo lista poprawek | raport review |
| E7 | przegląd polityk RLS, zarządzania sekretami, nagłówków bezpieczeństwa, komunikatów błędów; potwierdzenie braku sekretów w repozytorium i froncie | raport security review |
| E7C | każdy PR implementacyjny ma zatwierdzone review | historia PR |
| E8 | ocena klauzuli, retencji, listy procesorów i minimalizacji danych; lista braków dla ISKT | raport zgodności |
| E9 | ADR aktualne, instrukcja administratora, runbook, Obsidian zsynchronizowany | linki do Obsidiana i repozytorium |
| E10 | tabela odbioru z dowodami, lista braków, blockery, rekomendacja | raport końcowy |

---

## 5. Bramki

| Bramka | Kto decyduje | Kiedy |
| --- | --- | --- |
| Plan | **ISKT** | teraz — blokuje E1 i E2 |
| Architektura | Architekt Rozwiązania | po E2, przed E3–E5 |
| Code review | Code Reviewer / Cross-review | każdy PR |
| CI | GitHub Actions | każdy PR, obowiązkowo przed merge |
| QA | QA / Tester | po E3–E5 |
| Security | Security Reviewer | po E6 |
| Zgodność RODO | Analityk Zgodności + **ISKT** (zatwierdzenie klauzuli) | po E4 |
| Dokumentacja | Dokumentalista Techniczny i Produktowy | po E6–E8 |
| Release / publikacja | **ISKT** | poza zakresem tego zlecenia |

---

## 6. Ryzyka

| Ryzyko | Wpływ | Mitygacja |
| --- | --- | --- |
| Produkcyjny projekt Supabase jako jedyne środowisko | utrata lub zanieczyszczenie danych | lokalny stack, twardy zakaz operacji na produkcji ([ADR-0002](adr/ADR-0002-srodowisko-lokalne-i-supabase.md)) |
| Wyciek sekretu do frontendu | krytyczne naruszenie bezpieczeństwa | sekrety wyłącznie serwerowe, zakaz `NEXT_PUBLIC_` dla sekretów, kontrola w security review, skan repozytorium |
| Dane osobowe przed zatwierdzeniem klauzuli | naruszenie RODO | formularz tylko lokalnie; brak realnych zgłoszeń; wersjonowanie klauzuli w `inquiries.rodo_clause_version` |
| Spam na formularzu | zalew zgłoszeń, koszt Resend | cztery warstwy antyspamowe, Turnstile gotowy do włączenia |
| Brak finalnych treści, cen i zdjęć | niemożliwa publikacja | seed demonstracyjny `[DEMO]`; treści jako bramka ISKT przed publikacją |
| Brak praw do wizerunku trenerów | ryzyko prawne | `trainers.photo_url` dopuszcza `NULL`, widoki działają bez zdjęcia |
| Brak stemmingu polskiego w wyszukiwaniu | słabsze wyniki dla form odmienionych | `unaccent` + indeks trigramowy; ponowna ocena po dostarczeniu treści |
| **Agenci `Security Reviewer` i `Code Reviewer / Cross-review` są w stanie `error`** | bramki security i code review nierealizowalne | **wymaga działania ISKT/operatora Paperclipa przed E3**; zastępczo część przeglądu może wykonać Analityk Zgodności, ale nie zastępuje to security review |
| **Repozytorium `Sebastian-Temich/szkolenia-iskt` jest publiczne** | ADR-y, model danych, polityki RLS i kod są jawne; ryzyko przypadkowego ujawnienia identyfikatorów środowisk | usunięto identyfikator produkcyjnego projektu Supabase z repozytorium; obowiązuje reguła „zero identyfikatorów środowisk w repo”; **widoczność do potwierdzenia przez ISKT** |
| Minuty GitHub Actions po zmianie na repozytorium prywatne | koszt | obecnie repozytorium publiczne → CI bezpłatne; przy zmianie widoczności punkt dla FinOps |

---

## 7. Decyzje wymagane od ISKT

### Blokujące start implementacji

| # | Decyzja | Konsekwencja braku |
| --- | --- | --- |
| 1 | Zatwierdzenie stacku z ADR-0001 | E1 zablokowany |
| 2 | Zatwierdzenie strategii lokalnego Supabase i zakazu operacji na projekcie produkcyjnym (ADR-0002) | E2 zablokowany |
| 3 | Zatwierdzenie modelu danych i macierzy RLS (ADR-0003) | E2 zablokowany |
| 4 | Zatwierdzenie zestawu antyspamowego i rekomendacji „Turnstile wyłączony” (ADR-0004) | E4 zablokowany |
| 5 | Akceptacja pominięcia Forgejo local i oparcia bramki CI na GitHub Actions (ADR-0005) | E1 zablokowany |
| 6 | Przywrócenie agentów `Security Reviewer` i `Code Reviewer / Cross-review` (stan `error`) | bramki E7 i E7C nierealizowalne |
| 7 | Potwierdzenie, czy repozytorium ma pozostać **publiczne** | ryzyko nieświadomej jawności dokumentacji projektu klienta |

### Potrzebne później, nie blokują startu

| # | Decyzja | Potrzebna przed |
| --- | --- | --- |
| 8 | Potwierdzenie retencji 12 miesięcy i trybu ręcznego usuwania | E8 |
| 9 | Zatwierdzenie finalnej klauzuli informacyjnej i polityki prywatności | publikacją formularza |
| 10 | Przekazanie `RESEND_API_KEY` i weryfikacja domeny nadawcy | realną wysyłką powiadomień |
| 11 | Ustanowienie konta administratora i wiersza w `admin_users` | wdrożeniem |
| 12 | Czy ceny są publiczne w MVP, czy „Zapytaj o cenę” | E3 |
| 13 | Potwierdzenie listy kategorii startowych | E2 seed |
| 14 | Czy utworzyć osobny projekt `szkolenia-iskt-dev` | środowiskiem współdzielonym |
| 15 | Wybór hostingu: Vercel czy Netlify (ADR-0006) | deployem |
| 16 | Włączenie branch protection na `main` | pierwszym merge do `main` |
| 17 | Finalne treści, ceny, terminy, zdjęcia z prawami do wizerunku | publikacją |

---

## 8. Czego ten plan nie obejmuje

Zgodnie z §4 zlecenia: publicznego deployu, domeny i hostingu; modułu aktualnych naborów i terminów; płatności, rezerwacji i sprzedaży; kont uczestników i firm; newslettera, CRM, BUR/KFS, e-learningu; uploadu plików i funkcji AI; użycia finalnych treści i danych osobowych przed ich przekazaniem i zatwierdzeniem.
