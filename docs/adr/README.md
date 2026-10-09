# Rejestr decyzji architektonicznych (ADR)

Każda decyzja mająca wpływ na architekturę, bezpieczeństwo, dane lub proces dostawy ma własny ADR. ADR-y są niezmienne po zatwierdzeniu — zmianę decyzji zapisujemy nowym ADR-em oznaczającym poprzedni jako zastąpiony.

| ADR | Temat | Status |
| --- | --- | --- |
| [ADR-0001](ADR-0001-stack-aplikacji.md) | Stack aplikacji | proponowany |
| [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md) | Środowisko lokalne i bezpieczna praca z produkcyjnym Supabase | proponowany |
| [ADR-0003](ADR-0003-model-danych-migracje-rls.md) | Model danych, migracje i polityki RLS | proponowany |
| [ADR-0004](ADR-0004-formularze-antyspam-resend.md) | Przepływ formularza, antyspam i powiadomienia Resend | proponowany |
| [ADR-0005](ADR-0005-ci-i-strategia-testow.md) | Strategia CI i testów | proponowany |
| [ADR-0006](ADR-0006-hosting.md) | Hosting produkcyjny: Netlify vs Vercel | proponowany, decyzja odroczona |

Status `proponowany` oznacza, że decyzja czeka na bramkę planu ISKT. Po zatwierdzeniu zmieniamy go na `zaakceptowany` wraz z datą.

## Struktura ADR

```
# ADR-XXXX — tytuł
- Status / Data / Autor / Powiązane
## Kontekst
## Decyzja
## Rozważone warianty
## Konsekwencje
## Wymagane decyzje ISKT
```
