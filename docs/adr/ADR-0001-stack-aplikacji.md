# ADR-0001 — Stack aplikacji

- **Status:** proponowany (wymaga zatwierdzenia ISKT w bramce planu)
- **Data:** 2026-10-09
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

| Warstwa | Wybór | Wersja (stan na 2026-10-09) |
| --- | --- | --- |
| Framework | **Next.js, App Router** | `16.4.x` |
| Język | **TypeScript w trybie `strict`** | `5.x` |
| Runtime | Node.js | `22 LTS` w CI, `>=22` lokalnie |
| Styling | **Tailwind CSS v4** + tokeny CSS z design systemu ISKT | `4.3.x` |
| Dane / Auth | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | `ssr 0.12.x` |
| Walidacja | **Zod** (jeden schemat współdzielony klient/serwer) | `4.6.x` |
| Formularze | React Hook Form + resolver Zod | `7.x` |
| E-mail | **Resend SDK**, wyłącznie w warstwie serwerowej | `6.32.x` |
| Testy jednostkowe/integracyjne | **Vitest** | `5.0.x` |
| Testy E2E + a11y | **Playwright** + `@axe-core/playwright` | `1.64.x` |
| Lint | ESLint (`eslint-config-next`) + Prettier | — |

Wersje to punkt startowy dla Etapu 1; dokładne wersje zostają zamrożone w `package-lock.json` i podlegają review.

### Zasady architektoniczne wynikające z decyzji

1. **Publiczne strony renderowane serwerowo** (RSC + ISR). Odczyt opublikowanych treści przez klienta Supabase z kluczem publicznym (anon/publishable), ograniczony przez RLS.
2. **Zapis zgłoszeń wyłącznie przez Route Handler** (`POST /api/inquiries`, runtime `nodejs`). Klient przeglądarki nigdy nie pisze do tabeli `inquiries`.
3. **Sekrety tylko serwerowe.** `RESEND_API_KEY` i klucz `service_role` dostępne wyłącznie w kodzie serwerowym; żadna zmienna z sekretem nie ma prefiksu `NEXT_PUBLIC_`.
4. **Panel administratora w tym samym projekcie** pod `/panel`, chroniony middleware + sesją Supabase Auth, z autoryzacją egzekwowaną dodatkowo przez RLS (obrona w głąb — middleware nie jest jedyną bramką).
5. **Design system jako tokeny**, nie jako skopiowany HTML. Tokeny z `_ds/tokens/*.css` przenosimy do konfiguracji Tailwind v4 (`@theme`); referencyjny HTML służy jako wzorzec wizualny i treściowy, nie jako kod produkcyjny.

## Rozważone warianty

| Wariant | Dlaczego odrzucony |
| --- | --- |
| **Astro + wyspy React** | Doskonały dla treści statycznych, ale panel administratora z formularzami, sesjami i mutacjami wymaga istotnie więcej pracy; dwa modele renderowania w jednym MVP zwiększają koszt QA. |
| **SvelteKit** | Technicznie wystarczający, ale zespół ISKT ma doświadczenie w ekosystemie React (materiał referencyjny i design system są w stylistyce React/Tailwind), a dostępność bibliotek dostępnych a11y jest mniejsza. |
| **Remix / React Router v7** | Porównywalny, ale słabsze wsparcie dla ISR/SEO out-of-the-box i mniejsza liczba gotowych integracji Supabase SSR. |
| **Statyczny HTML z szablonu + Supabase z przeglądarki** | Odrzucony twardo: zapis formularza i sekret Resend trafiłyby do frontendu, co narusza `04_Ryzyka/Bezpieczenstwo.md`. |
| **Lovable jako generator** | Nie w tym zleceniu — Project Access Card wskazuje repo GitHub i lokalny folder jako źródło prawdy; dodatkowy generator rozmywa własność kodu i CI. |

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
