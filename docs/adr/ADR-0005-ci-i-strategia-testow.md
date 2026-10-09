# ADR-0005 — Strategia CI i testów

- **Status:** proponowany (wymaga zatwierdzenia ISKT w bramce planu)
- **Data:** 2026-10-09
- **Autor:** Koordynator Techniczny / Intake Lead
- **Powiązane:** [ADR-0001](ADR-0001-stack-aplikacji.md), [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md), [ADR-0003](ADR-0003-model-danych-migracje-rls.md)

## Kontekst

Zlecenie wymaga GitHub Actions jako obowiązkowej bramki (lint, typecheck, testy, build) oraz testów E2E dla kluczowych ścieżek. Standard organizacyjny Intake Leada domyślnie stawia Forgejo local jako pierwszą bramkę CI — w tym projekcie trzeba to jawnie rozstrzygnąć.

## Decyzje

### D1. Cel CI: GitHub Actions. Forgejo local pominięty

**Powód pominięcia Forgejo:** ISKT wskazał w zleceniu GitHub Actions jako obowiązkową bramkę CI, a Project Access Card wpisuje „Forgejo — nie dotyczy”. Utrzymywanie drugiego systemu CI dla jednego repozytorium MVP podwaja koszt konfiguracji bez dodatkowego dowodu jakości. Zapis jest wymaganym uzasadnieniem odstępstwa od domyślnego standardu.

### D2. Workflow `ci.yml` — trzy zadania

```
quality  (zawsze)      → setup Node 22 LTS, npm ci, lint, typecheck, test:unit, build
database (zawsze)      → supabase start, supabase db reset, test:integration (RLS + zapis zgłoszeń)
e2e      (zawsze)      → supabase start + build + playwright test (+ skan axe)
```

- `quality` i `database` biegną równolegle; `e2e` po `quality` (korzysta z artefaktu builda).
- Współbieżność: `concurrency: ci-${{ github.ref }}` z `cancel-in-progress: true`.
- Cache: `actions/setup-node` z `cache: npm`, cache przeglądarek Playwright.
- Wyzwalacze: `pull_request` na `main` i `push` na `main`.
- Artefakty przy porażce: raport Playwright, zrzuty ekranu, logi Supabase CLI.
- Zmienne środowiskowe w CI: wyłącznie lokalne klucze stacku Supabase i `MAIL_TRANSPORT=log`. **Żaden sekret ISKT nie jest potrzebny do przejścia CI** i żaden nie zostaje dodany do repozytorium ani do sekretów Actions na tym etapie.

### D3. Bramka merge

Na `main` wymagane: `quality`, `database`, `e2e` oraz co najmniej jedno zatwierdzenie w code review. Bez bezpośrednich commitów na `main` (Project Access Card). Konfiguracja branch protection w GitHubie wymaga uprawnień właściciela repozytorium — zadanie dla ISKT, wypisane jako otwarty punkt.

### D4. Piramida testów i podział odpowiedzialności

| Poziom | Narzędzie | Zakres | Właściciel |
| --- | --- | --- | --- |
| Jednostkowe | Vitest | schematy Zod, helpery antyspamowe, przejścia statusów, mapowanie danych, helpery SEO i slugów, redakcja logów | autor kodu |
| Integracyjne | Vitest + lokalny Supabase | polityki RLS (pozytywne i negatywne), odtworzenie migracji, zapis zgłoszenia, trigger niezmienności zgłoszenia | Inżynier Backend / Supabase |
| E2E | Playwright | krytyczne ścieżki użytkownika i administratora | QA / Tester |
| Dostępność | `@axe-core/playwright` | strona główna, katalog, szczegół szkolenia, trenerzy, kontakt, formularz, logowanie | QA / Tester |
| Manualne | — | RWD na telefonie/tablecie/desktopie, przegląd treści, nawigacja klawiaturą, czytnik ekranu | QA / Tester, UX Reviewer |

### D5. Krytyczne ścieżki E2E (minimalny zakres przed odbiorem)

1. Strona główna → katalog → filtr po kategorii → wyszukiwanie → szczegół szkolenia.
2. Szkolenie nieopublikowane nie jest dostępne publicznie (lista i bezpośredni URL → 404).
3. Wysłanie formularza jako osoba indywidualna → ekran potwierdzenia.
4. Wysłanie formularza jako firma → ekran potwierdzenia.
5. Formularz bez zgody RODO → brak wysłania, komunikat błędu.
6. Logowanie administratora → panel; wejście na `/panel` bez sesji → przekierowanie na logowanie.
7. Administrator tworzy szkolenie, publikuje je, pozycja pojawia się publicznie; wycofuje, pozycja znika.
8. Administrator widzi zgłoszenie ze statusem `nowe` i zmienia status na `w_toku`, a następnie `zamkniete`.
9. Użytkownik zalogowany bez uprawnień administratora nie wchodzi do panelu.

### D6. TDD tam, gdzie wymaga tego zlecenie

Testy pisane przed implementacją dla: walidacji formularza, przepływu zapisu zgłoszenia, przejść statusów, kontroli dostępu (RLS i middleware). Dla warstwy prezentacyjnej dopuszczamy testy po implementacji — wymuszanie TDD na komponentach wizualnych nie daje tu wartości.

### D7. Progi i hermetyczność

- Brak sztywnego progu pokrycia procentowego; zamiast tego **lista obowiązkowa**: każdy przypadek z sekcji „Wymagane testy” w [`model-danych.md`](../architektura/model-danych.md) oraz z D5 musi mieć test. Przegląd kompletności wykonuje QA, a weryfikację Delivery Controller.
- Testy nie korzystają z sieci publicznej: Resend zamockowany (`MAIL_TRANSPORT=log`), Supabase lokalny, brak zewnętrznych fontów i obrazów w testach E2E.
- Dane testowe fikcyjne, e-maile w domenie `example.invalid`.

## Konsekwencje

- Zadanie `database` i `e2e` uruchamiają Dockera w runnerze GitHuba — wydłuża to CI do kilku minut. Repozytorium jest obecnie **publiczne**, więc minuty Actions są bezpłatne; zmiana widoczności na prywatną przeniesie to na limit płatny (punkt dla FinOps).
- Publiczna widoczność repozytorium oznacza, że ADR-y, model danych i polityki RLS są dostępne publicznie. Z punktu widzenia bezpieczeństwa jest to akceptowalne — ochrona opiera się na politykach i sekretach, nie na nieujawnianiu schematu — ale wymaga dyscypliny: żadnych identyfikatorów projektów, adresów środowisk ani danych kontaktowych wykraczających poza informacje już publiczne.
- Każdy PR dowodzi, że migracje odtwarzają się od zera — spełnia wymóg „test odtworzenia” z tabeli ryzyk.
- Brak bramki Forgejo oznacza, że GitHub Actions jest pojedynczym punktem awarii CI; akceptowane, uzasadnienie w D1.

## Wymagane decyzje i czynności ISKT

1. Akceptacja pominięcia Forgejo local (D1).
2. Włączenie branch protection na `main` z wymaganymi checkami (D3) — wymaga uprawnień właściciela repozytorium.
3. Potwierdzenie, czy repozytorium ma pozostać **publiczne** (stan obecny). Publiczne: bezpłatne CI, ale pełna jawność dokumentacji i kodu. Prywatne: limit minut Actions, mniejsza ekspozycja.
