# ADR-0001 — Stack aplikacji

- **Status:** **zatwierdzony przez ISKT 2026-10-09** (bramka planu zamknięta). Zweryfikowany wobec kodu 2026-10-10 w etapie E9T — patrz „Stan implementacji (E9T)” na końcu dokumentu.
- **Data:** 2026-10-09 (decyzja), 2026-10-10 (weryfikacja wobec implementacji)
- **Autor:** Koordynator Techniczny / Intake Lead
- **Zastępuje:** `ADR-0 - Stack i hosting` (szkic w Obsidianie) w części dotyczącej stacku aplikacji
- **Powiązane:** [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md), [ADR-0005](ADR-0005-ci-i-strategia-testow.md), [ADR-0006](ADR-0006-hosting.md)

## Kontekst

MVP `szkolenia.iskt.pl` to publiczny serwis oferty szkoleń z treściami zarządzanymi w panelu jednego administratora. Wymagania determinujące wybór:

- SEO i indeksowalność publicznych stron (katalog, szczegół szkolenia, trenerzy);
- wyłącznie serwerowa obsługa formularzy z danymi osobowymi i sekretu Resend;
- Supabase jako baza i Auth (decyzja ISKT, poza zakresem tego ADR);
- TypeScript i framework SSR/SSG (wymóg zlecenia, §5 „Dozwolone bez ISKT”);
- WCAG 2.1 AA dla głównych ścieżek, responsywność, język polski z diakrytykami;
- materiał referencyjny designu to statyczny HTML z własnym design systemem (`ISKT Greenovation`) — potrzebny jest stack, do którego da się przenieść tokeny CSS bez przepisywania całego systemu.

## Decyzja

| Warstwa                        | Wybór                                                  | Wersja (stan na 2026-10-09)    |
| ------------------------------ | ------------------------------------------------------ | ------------------------------ |
| Framework                      | **Next.js, App Router**                                | `16.4.x`                       |
| Język                          | **TypeScript w trybie `strict`**                       | `5.x`                          |
| Runtime                        | Node.js                                                | `22 LTS` w CI, `>=22` lokalnie |
| Styling                        | **Tailwind CSS v4** + tokeny CSS z design systemu ISKT | `4.3.x`                        |
| Dane / Auth                    | Supabase (`@supabase/supabase-js`, `@supabase/ssr`)    | `ssr 0.12.x`                   |
| Walidacja                      | **Zod** (jeden schemat współdzielony klient/serwer)    | `4.6.x`                        |
| Formularze                     | React Hook Form + resolver Zod                         | `7.x`                          |
| E-mail                         | **Resend SDK**, wyłącznie w warstwie serwerowej        | `6.32.x`                       |
| Testy jednostkowe/integracyjne | **Vitest**                                             | `5.0.x`                        |
| Testy E2E + a11y               | **Playwright** + `@axe-core/playwright`                | `1.64.x`                       |
| Lint                           | ESLint (`eslint-config-next`) + Prettier               | —                              |

Wersje to punkt startowy dla Etapu 1; dokładne wersje zostają zamrożone w `package-lock.json` i podlegają review.

### Zasady architektoniczne wynikające z decyzji

1. **Publiczne strony renderowane serwerowo** (RSC + ISR). Odczyt opublikowanych treści przez klienta Supabase z kluczem publicznym (anon/publishable), ograniczony przez RLS.
2. **Zapis zgłoszeń wyłącznie przez Route Handler** (`POST /api/inquiries`, runtime `nodejs`). Klient przeglądarki nigdy nie pisze do tabeli `inquiries`.
3. **Sekrety tylko serwerowe.** `RESEND_API_KEY` i klucz `service_role` dostępne wyłącznie w kodzie serwerowym; żadna zmienna z sekretem nie ma prefiksu `NEXT_PUBLIC_`.
4. **Panel administratora w tym samym projekcie** pod `/panel`, chroniony middleware + sesją Supabase Auth, z autoryzacją egzekwowaną dodatkowo przez RLS (obrona w głąb — middleware nie jest jedyną bramką).
5. **Design system jako tokeny**, nie jako skopiowany HTML. Tokeny z `_ds/tokens/*.css` przenosimy do konfiguracji Tailwind v4 (`@theme`); referencyjny HTML służy jako wzorzec wizualny i treściowy, nie jako kod produkcyjny.

## Rozważone warianty

| Wariant                                                 | Dlaczego odrzucony                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Astro + wyspy React**                                 | Doskonały dla treści statycznych, ale panel administratora z formularzami, sesjami i mutacjami wymaga istotnie więcej pracy; dwa modele renderowania w jednym MVP zwiększają koszt QA.                        |
| **SvelteKit**                                           | Technicznie wystarczający, ale zespół ISKT ma doświadczenie w ekosystemie React (materiał referencyjny i design system są w stylistyce React/Tailwind), a dostępność bibliotek dostępnych a11y jest mniejsza. |
| **Remix / React Router v7**                             | Porównywalny, ale słabsze wsparcie dla ISR/SEO out-of-the-box i mniejsza liczba gotowych integracji Supabase SSR.                                                                                             |
| **Statyczny HTML z szablonu + Supabase z przeglądarki** | Odrzucony twardo: zapis formularza i sekret Resend trafiłyby do frontendu, co narusza `04_Ryzyka/Bezpieczenstwo.md`.                                                                                          |
| **Lovable jako generator**                              | Nie w tym zleceniu — Project Access Card wskazuje repo GitHub i lokalny folder jako źródło prawdy; dodatkowy generator rozmywa własność kodu i CI.                                                            |

## Konsekwencje

**Pozytywne**

- Jeden framework obsługuje SSR/SSG, API serwerowe i panel — jedna konfiguracja CI, jeden build, jeden zestaw testów.
- `@supabase/ssr` daje gotową obsługę sesji w cookies dla RSC i middleware.
- Next.js jest naturalnym celem dla Vercel i możliwym dla Netlify (ADR-0006) — decyzja hostingowa pozostaje otwarta bez przepisywania aplikacji.

**Negatywne / do pilnowania**

- Next.js App Router łatwo „wycieka” danymi do klienta przy nieuważnym użyciu `use client` — wymaga reguły lint i review (brak importu klienta `service_role` w komponentach klienckich).
- ISR + publikacja treści wymaga jawnej inwalidacji cache po operacji administratora (`revalidateTag`) — ujęte w DoD Etapu 5.
- Node 25 lokalnie vs Node 22 LTS w CI: rozbieżność runtime. Mitygacja — `.nvmrc` z wersją 22 i ten sam Node w CI oraz lokalnie dla developerów.

## Wymagana decyzja ISKT

Zatwierdzenie stacku z tej tabeli. Odrzucenie wymaga wskazania alternatywy, ponieważ Etap 1 (fundament repo) jest zablokowany do czasu decyzji.

> **Rozstrzygnięcie:** ISKT zatwierdziło stack 2026-10-09. Bramka planu zamknięta, E1 i E2 uruchomione.

---

## Stan implementacji (E9T, 2026-10-10)

Sekcja dopisana w etapie E9T. Treść decyzji powyżej pozostaje bez zmian; poniżej opisany jest **stan faktyczny** po etapach E1–E5 i bramkach E2R, E6, E7 i E8.

### Wersje zamrożone w `package-lock.json`

Tabela decyzji podawała przedziały („stan na 2026-10-09"). Faktycznie zainstalowane wersje:

| Warstwa                        | Pakiet                                     | Wersja w `package-lock.json` |
| ------------------------------ | ------------------------------------------ | ---------------------------- |
| Framework                      | `next`                                     | `16.4.0`                     |
| UI                             | `react`, `react-dom`                       | `19.3.0`                     |
| Język                          | `typescript`                               | `5.9.3`                      |
| Styling                        | `tailwindcss`, `@tailwindcss/postcss`      | `4.3.3`                      |
| Dane / Auth                    | `@supabase/supabase-js`                    | `2.117.3`                    |
| Dane / Auth                    | `@supabase/ssr`                            | `0.12.7`                     |
| Walidacja                      | `zod`                                      | `4.6.5`                      |
| Formularze                     | `react-hook-form`                          | `7.89.0`                     |
| Formularze                     | `@hookform/resolvers`                      | `5.9.1`                      |
| E-mail                         | `resend`                                   | `6.32.1`                     |
| Testy jednostkowe/integracyjne | `vitest`                                   | `5.0.3`                      |
| E2E                            | `@playwright/test`                         | `1.64.0`                     |
| E2E a11y                       | `@axe-core/playwright`                     | `4.13.0`                     |
| Lint                           | `eslint` + `eslint-config-next`            | `9.39.3` / `16.4.0`          |
| Format                         | `prettier` + `prettier-plugin-tailwindcss` | `3.9.9` / `0.7.2`            |

Runtime: `engines.node = ">=22 <23"` w `package.json`, `.nvmrc` = `22`, CI używa Node 22. **Odstępstwo:** maszyna robocza ma Node 25.5.0, czyli poza deklarowanym przedziałem `engines`; `npm ci` kończy się sukcesem, ale wypisuje ostrzeżenia `EBADENGINE`. Szczegóły i obejście: [runbook](../runbook/lokalne-uruchomienie.md#wymagania).

### Zasady architektoniczne — weryfikacja

| #   | Zasada                                                                                          | Stan faktyczny                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Publiczne strony renderowane serwerowo (RSC + ISR), odczyt kluczem publicznym ograniczony RLS   | **zrealizowana z korektą.** Publiczny odczyt idzie przez `lib/public-catalog.ts` — klient `@supabase/supabase-js` z kluczem anon, **bez ciasteczek**, dzięki czemu trasy katalogu pozostają statyczne z `revalidate = 300`. Jest to realizacja ustalenia **C5 z bramki architektury (E2R)**: pierwotny `lib/supabase/server.ts` czyta `cookies()`, co czyniłoby każdą publiczną trasę dynamiczną. `server.ts` jest dziś używany wyłącznie w `/panel` i w warstwie serwerowej.                                                                                                                                                        |
| 2   | Zapis zgłoszeń wyłącznie przez Route Handler (`POST /api/inquiries`, runtime `nodejs`)          | **zrealizowana.** `app/api/inquiries/route.ts` ma `runtime = "nodejs"` i `dynamic = "force-dynamic"`; `createAdminClient()` (klucz `service_role`) jest wołany **w dokładnie jednym miejscu** — potwierdzone w bramce E7. Kontrakt: [`docs/api/kontrakt-api.md`](../api/kontrakt-api.md).                                                                                                                                                                                                                                                                                                                                            |
| 3   | Sekrety tylko serwerowe, żadna zmienna z sekretem bez prefiksu `NEXT_PUBLIC_`                   | **zrealizowana i potwierdzona w bramce E7** (skan historii wszystkich gałęzi, `lib/supabase/admin.ts` z `import "server-only"`, zero sekretów w komponentach klienckich).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | Panel chroniony middleware + sesją Supabase Auth, z autoryzacją egzekwowaną dodatkowo przez RLS | **zrealizowana, z inną nazwą pliku.** Next.js 16 zastąpił `middleware.ts` plikiem **`proxy.ts`** z eksportem `proxy()` i `config.matcher = ["/panel/:path*"]`; w repozytorium nie ma `middleware.ts`. Obrona w głąb działa: `requireAdmin()` w layoucie panelu i we wszystkich 7 server actions, a panel używa klucza anon z sesją użytkownika (nie `service_role`), więc polityki `is_admin()` autoryzują niezależnie od proxy. **Ustalenie otwarte (E7 S1):** `proxy.ts` przy braku `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` zwraca `next()` (fail-open); całość kończy się 500 niżej, ale z przypadkowej kolejności, nie z intencji. |
| 5   | Design system jako tokeny Tailwind v4 (`@theme`), nie skopiowany HTML                           | **zrealizowana.** Tokeny w `app/globals.css`; opis w [`docs/design-system.md`](../design-system.md). **Zdarzenie do zapamiętania (ISK-355):** własny token `--spacing-container` kolidował z utility `max-w-container` Tailwinda v4 i rozsypywał layout wszystkich stron — naprawione, ale klasa błędu jest cicha (CSS się kompiluje, strona wygląda „prawie dobrze").                                                                                                                                                                                                                                                               |

### Odstępstwa i ustalenia otwarte

| #   | Rzecz                                                                                                                                                                                       | Stan                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `next.config.ts` zawiera wyłącznie `reactStrictMode` — **zero nagłówków bezpieczeństwa** (brak CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, HSTS) | **otwarte** — ustalenie **W1 z bramki E7**, priorytet wysoki. Stoi w sprzeczności z regułą 3 z [ADR-0006](ADR-0006-hosting.md) („nagłówki bezpieczeństwa definiowane w `next.config.ts`").                                                                                                                                                                                                                                  |
| A2  | `lib/catalog/public.ts` (klient z `unstable_cache` i tagiem `catalog`) **nie jest importowany przez żaden moduł** — jest martwym kodem                                                      | **otwarte.** Konsekwencja: `updateTag("catalog")` w `app/panel/(admin)/actions.ts` nie unieważnia dziś niczego, bo żaden odczyt nie jest tym tagiem oznaczony. Realną inwalidację wykonują wywołania `revalidatePath("/szkolenia")`, `revalidatePath("/szkolenia/[slug]")` i `revalidatePath("/trenerzy")` w tej samej funkcji — publikacja z panelu działa, ale **nie** tą ścieżką, którą opisywały konsekwencje tego ADR. |
| A3  | `pg` występuje w `devDependencies` dwukrotnie (`8.16.3` i `^8.12.0`)                                                                                                                        | **otwarte** — ustalenie **N2 z bramki E7**, niegroźne (lockfile trzyma `8.16.3`).                                                                                                                                                                                                                                                                                                                                           |
| A4  | 5 podatności `high` w zależnościach (`braces`/`micromatch`/`fast-glob` tranzytywnie przez `eslint-config-next`)                                                                             | **otwarte, nieblokujące** — ustalenie **N1 z bramki E7**: wyłącznie `devDependencies`, nie wchodzą do bundla runtime. Zalecenie bramki: `npm audit --omit=dev` jako krok CI.                                                                                                                                                                                                                                                |
| A5  | `AGENTS.md` w korzeniu repozytorium jest generowany przez `next dev`                                                                                                                        | stan faktyczny, nie decyzja — plik wraca po każdym `npm run dev`.                                                                                                                                                                                                                                                                                                                                                           |
