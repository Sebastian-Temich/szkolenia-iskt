# szkolenia-iskt

Publiczny serwis oferty szkoleń ISKT z panelem jednego administratora, formularzami zapytań i obsługą zgłoszeń.

> **Etap projektu:** MVP budowane i testowane lokalnie. Publiczny deploy, domena i zbieranie realnych zgłoszeń są poza zakresem i wymagają odrębnej decyzji ISKT.

## Dokumentacja

| Dokument | Zawartość |
| --- | --- |
| [Plan dostawy](docs/plan-dostawy.md) | etapy, właściciele, zależności, DoD, bramki, ryzyka, decyzje ISKT |
| [Rejestr ADR](docs/adr/README.md) | decyzje architektoniczne ADR-0001…0006 |
| [Model danych i RLS](docs/architektura/model-danych.md) | tabele, ograniczenia, macierz dostępu, wymagane testy |
| [Runbook lokalnego uruchomienia](docs/runbook/lokalne-uruchomienie.md) | wymagania, pierwszy start, codzienne komendy, zmiana schematu |
| [`.env.example`](.env.example) | zmienne środowiskowe z opisem i podziałem na publiczne i serwerowe |

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres, Auth, RLS) · Zod · Resend (warstwa serwerowa) · Vitest · Playwright. Uzasadnienie: [ADR-0001](docs/adr/ADR-0001-stack-aplikacji.md).

## Szybki start

```bash
nvm use && npm ci
supabase start
cp .env.example .env.local   # wartości z wyjścia `supabase start`
supabase db reset
npm run dev
```

Pełna procedura i rozwiązywanie problemów: [runbook](docs/runbook/lokalne-uruchomienie.md).

## Zasady bezpieczeństwa obowiązujące w repozytorium

1. **Żadnych sekretów w repozytorium**, w zadaniach, w dokumentacji ani w logach. `.env.local` jest ignorowany przez git.
2. Sekrety (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, sekrety antyspamowe) są odczytywane wyłącznie w kodzie serwerowym. Prefiks `NEXT_PUBLIC_` jest zarezerwowany dla wartości jawnie publicznych.
3. Istniejący projekt Supabase ISKT (identyfikator w Project Access Card, poza repozytorium) jest **produkcyjny**. Zakaz `supabase link`, `db push`, `db pull` i jakichkolwiek operacji na nim do czasu odrębnej decyzji ISKT ([ADR-0002](docs/adr/ADR-0002-srodowisko-lokalne-i-supabase.md)).
4. Migracje w `supabase/migrations/` są jedynym źródłem prawdy schematu. Zakaz ręcznych zmian w Supabase Studio.
5. Dane demonstracyjne są fikcyjne, oznaczone `[DEMO]`, z adresami w domenie `example.invalid`. Finalnych treści i realnych danych osobowych nie używamy przed ich przekazaniem i zatwierdzeniem.
6. Praca na branchach od `main`; bez bezpośrednich commitów na `main`. Każdy PR przechodzi CI i code review.
