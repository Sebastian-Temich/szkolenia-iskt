# Rejestr decyzji architektonicznych (ADR)

Każda decyzja mająca wpływ na architekturę, bezpieczeństwo, dane lub proces dostawy ma własny ADR. ADR-y są niezmienne po zatwierdzeniu — zmianę decyzji zapisujemy nowym ADR-em oznaczającym poprzedni jako zastąpiony.

| ADR                                                   | Temat                                                         | Status                                                                                      | Stan wobec implementacji (E9T, 2026-10-10)                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0001](ADR-0001-stack-aplikacji.md)               | Stack aplikacji                                               | **zatwierdzony** 2026-10-09                                                                 | zrealizowany; `middleware.ts` → `proxy.ts` (Next.js 16), publiczny odczyt bez ciasteczek (E2R C5); 5 ustaleń otwartych                                           |
| [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md) | Środowisko lokalne i bezpieczna praca z produkcyjnym Supabase | **zatwierdzony** 2026-10-09                                                                 | zrealizowany; zakaz operacji na projekcie produkcyjnym dotrzymany (potwierdzone w E7 i E8); kolizja portów udokumentowana w runbooku                             |
| [ADR-0003](ADR-0003-model-danych-migracje-rls.md)     | Model danych, migracje i polityki RLS                         | **zatwierdzony** 2026-10-09; **zaakceptowany ze zmianami** w bramce architektury (E2R)      | zrealizowany; D4 uzupełniony kontraktem normalizacji zapytania, D10 **rozszerzony na funkcje** po defekcie P0 (ISK-356); D7 nadal obiecuje więcej, niż baza robi |
| [ADR-0004](ADR-0004-formularze-antyspam-resend.md)    | Przepływ formularza, antyspam i powiadomienia Resend          | **zatwierdzony** 2026-10-09                                                                 | zrealizowany; korekta: **Turnstile nie jest zaimplementowany**, istnieją tylko trzy zarezerwowane zmienne; obejście limitu częstości nagłówkiem (E7 W2) **naprawione (ISK-361)** |
| [ADR-0005](ADR-0005-ci-i-strategia-testow.md)         | Strategia CI i testów                                         | **zatwierdzony** 2026-10-09                                                                 | zrealizowany; 3 zadania CI + tymczasowy workflow E2 do usunięcia; branch protection nadal po stronie ISKT                                                        |
| [ADR-0006](ADR-0006-hosting.md)                       | Hosting produkcyjny: Netlify vs Vercel                        | **zatwierdzony** 2026-10-09 **jako rekomendacja; wybór dostawcy odroczony do decyzji ISKT** | reguły neutralności dotrzymane poza regułą 3 — **brak nagłówków bezpieczeństwa** (E7 W1); dopisane warunki wdrożenia                                             |

Statusy `proponowany` zostały zamknięte decyzją ISKT z 2026-10-09 (bramka planu; dokument `plan` na karcie ISK-339, rewizja 2). W etapie **E9T** każdy ADR otrzymał sekcję **„Stan implementacji (E9T)”**: treść pierwotnej decyzji jest nienaruszona, a odstępstwa, zmiany zakresu i ustalenia otwarte są wypisane jawnie pod nią. Jeśli decyzja się zmieniła, zmiana jest w tej sekcji nazwana wprost.

## Co jeszcze warto przeczytać

| Dokument                                                                     | Zawartość                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`docs/architektura/model-danych.md`](../architektura/model-danych.md)       | schemat zweryfikowany wobec migracji, macierz dostępu (tabele **i funkcje**), mapowanie wymaganych testów na pliki |
| [`docs/architektura/migracje.md`](../architektura/migracje.md)               | jak migracje są wersjonowane, jak odtworzyć schemat od zera, jak dodać nową migrację                               |
| [`docs/api/kontrakt-api.md`](../api/kontrakt-api.md)                         | `POST /api/inquiries` i pozostałe punkty wystawione przez aplikację                                                |
| [`docs/runbook/lokalne-uruchomienie.md`](../runbook/lokalne-uruchomienie.md) | uruchomienie krok po kroku — przejdzone i poprawione w E9T                                                         |
| [`docs/zgodnosc/procesorzy.md`](../zgodnosc/procesorzy.md)                   | rejestr procesorów danych i stan umów powierzenia                                                                  |
| [`docs/odbior/braki-i-decyzje-iskt.md`](../odbior/braki-i-decyzje-iskt.md)   | skonsolidowana lista wszystkiego, co czeka na ISKT                                                                 |

## Struktura ADR

```
# ADR-XXXX — tytuł
- Status / Data / Autor / Powiązane
## Kontekst
## Decyzja
## Rozważone warianty
## Konsekwencje
## Wymagane decyzje ISKT
## Stan implementacji (E9T)   ← dopisywany po bramkach; nie nadpisuje decyzji
```
