# szkolenia-iskt

Publiczny serwis oferty szkoleń ISKT z panelem jednego administratora, formularzami zapytań i obsługą zgłoszeń.

> **Etap projektu:** MVP budowane i testowane lokalnie. Publiczny deploy, domena i zbieranie realnych zgłoszeń są poza zakresem i wymagają odrębnej decyzji ISKT.

## Dokumentacja

| Dokument                                                               | Zawartość                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Plan dostawy](docs/plan-dostawy.md)                                   | etapy, właściciele, zależności, DoD, bramki, ryzyka                                                |
| [Rejestr ADR](docs/adr/README.md)                                      | decyzje architektoniczne ADR-0001…0006 wraz ze stanem wobec implementacji                          |
| [Model danych i RLS](docs/architektura/model-danych.md)                | tabele, ograniczenia, macierz dostępu (tabele **i funkcje**), mapowanie wymaganych testów na pliki |
| [Migracje](docs/architektura/migracje.md)                              | wersjonowanie, odtworzenie schematu od zera, dodanie nowej migracji                                |
| [Kontrakt API](docs/api/kontrakt-api.md)                               | `POST /api/inquiries`, punkty metadanych, server actions panelu                                    |
| [Runbook lokalnego uruchomienia](docs/runbook/lokalne-uruchomienie.md) | wymagania, pierwszy start, codzienne komendy, rozwiązywanie problemów                              |
| [Tokeny design systemu](docs/design-system.md)                         | mapowanie tokenów ISKT na `@theme` Tailwind CSS v4                                                 |
| [Rejestr procesorów danych](docs/zgodnosc/procesorzy.md)               | kto przetwarza jakie dane i stan umów powierzenia                                                  |
| [**Braki i decyzje ISKT**](docs/odbior/braki-i-decyzje-iskt.md)        | skonsolidowana lista wszystkiego, co czeka na ISKT                                                 |
| [Raport QA (E6)](docs/qa/raport-e6.md)                                 | wyniki bramki jakości: E2E, WCAG 2.1 AA, RWD, lista defektów                                       |
| [`.env.example`](.env.example)                                         | zmienne środowiskowe: wyłącznie nazwy i opisy, bez wartości                                        |

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres, Auth, RLS) · Zod · Resend (warstwa serwerowa) · Vitest · Playwright. Uzasadnienie: [ADR-0001](docs/adr/ADR-0001-stack-aplikacji.md).

## Szybki start

```bash
npm ci                       # Node 22 (.nvmrc); na nowszym Node ostrzeżenia EBADENGINE są oczekiwane
supabase start
cp .env.example .env.local   # wartości z wyjścia `supabase status`
supabase db reset            # 8 migracji od zera + seed demonstracyjny
npm run dev
```

Bramki jakości bez zewnętrznych usług i **bez żadnych sekretów**:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Testy wymagające bazy uruchamiaj **przez skrypty**, nie bezpośrednio — wymuszają lokalny stack
Supabase i chronią przed przypadkowym celowaniem w projekt hostowany:

```bash
./scripts/integration-local.sh
./scripts/e2e-local.sh
```

Pełna procedura, kolizje portów i rozwiązywanie problemów: [runbook](docs/runbook/lokalne-uruchomienie.md).

## Zasady bezpieczeństwa obowiązujące w repozytorium

1. **Żadnych sekretów w repozytorium**, w zadaniach, w dokumentacji ani w logach. `.env.local` jest ignorowany przez git.
2. Sekrety (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, sekrety antyspamowe) są odczytywane wyłącznie w kodzie serwerowym. Prefiks `NEXT_PUBLIC_` jest zarezerwowany dla wartości jawnie publicznych.
3. Istniejący projekt Supabase ISKT (identyfikator w Project Access Card, poza repozytorium) jest **produkcyjny**. Zakaz `supabase link`, `db push`, `db pull` i jakichkolwiek operacji na nim do czasu odrębnej decyzji ISKT ([ADR-0002](docs/adr/ADR-0002-srodowisko-lokalne-i-supabase.md)).
4. Migracje w `supabase/migrations/` są jedynym źródłem prawdy schematu. Zakaz ręcznych zmian w Supabase Studio.
5. Dane demonstracyjne są fikcyjne, oznaczone `[DEMO]`, z adresami w domenie `example.invalid`. Finalnych treści i realnych danych osobowych nie używamy przed ich przekazaniem i zatwierdzeniem.
6. Praca na branchach od `main`; bez bezpośrednich commitów na `main`. Każdy PR przechodzi CI i code review.
