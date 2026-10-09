# ADR-0006 — Przyszłe przejście na hosting produkcyjny (Netlify vs Vercel)

- **Status:** proponowany; decyzja ISKT odroczona do etapu przed publikacją
- **Data:** 2026-10-09
- **Autor:** Koordynator Techniczny / Intake Lead
- **Powiązane:** [ADR-0001](ADR-0001-stack-aplikacji.md), [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md)

## Kontekst

Publiczny deploy jest poza zakresem tego zlecenia (§4). ADR powstaje teraz, żeby decyzje z Etapów 1–5 nie zamknęły żadnej z opcji i żeby lista warunków wejścia na produkcję była znana zawczasu.

## Porównanie

| Kryterium | Vercel | Netlify |
| --- | --- | --- |
| Wsparcie Next.js 16 (App Router, RSC, ISR) | Pierwszej ręki — twórca frameworka; ISR, `revalidateTag`, middleware działają bez adaptera | Wspierany przez `@netlify/plugin-nextjs`; funkcjonalnie wystarczający, ale to warstwa pośrednia, która historycznie opóźniała się za nowymi wersjami Next.js |
| Route Handlers / funkcje serwerowe | Natywne, region konfigurowalny | Netlify Functions; limity i zimne starty porównywalne |
| Zmienne środowiskowe i sekrety | Per-środowisko, z podziałem na preview/production, bez ekspozycji do klienta poza `NEXT_PUBLIC_` | Analogicznie |
| Preview deployments dla PR | Tak | Tak |
| Domena i DNS | Obsługa domeny z automatycznym TLS | Obsługa domeny z automatycznym TLS |
| RODO / lokalizacja danych | DPA dostępne; region funkcji do wskazania (zalecany `fra1`) | DPA dostępne; mniejsza kontrola nad regionem wykonania funkcji na niższych planach |
| Koszt na starcie | Plan Hobby wystarcza technicznie, ale **zabrania użycia komercyjnego** → wymagany plan płatny dla serwisu firmowego | Plan Free dopuszcza użycie komercyjne w szerszym zakresie; limity pasma do weryfikacji |
| Ryzyko utrzymaniowe | Niskie — jedna warstwa mniej | Średnie — zależność od wtyczki adaptera |

## Rekomendacja

**Vercel**, pod warunkiem akceptacji kosztu planu płatnego. Powód: aplikacja jest w Next.js, a Vercel eliminuje warstwę adaptera, która jest najczęstszym źródłem problemów z ISR i middleware. Dla serwisu, w którym publikacja treści z panelu musi natychmiast inwalidować cache publicznych stron, przewidywalność tego zachowania ma bezpośrednie znaczenie funkcjonalne.

**Netlify** pozostaje poprawnym wyborem, jeśli decydującym kryterium jest koszt — wymaga wtedy dodania do DoD testu E2E weryfikującego ISR i middleware na środowisku preview Netlify, przed produkcją.

Rekomendacja nie jest decyzją: wybór należy do ISKT i wymaga danych o koncie, budżecie i właścicielu rozliczeń (`03_Decyzje/Otwarte pytania.md`, pytanie 1).

## Reguły, które utrzymują obie opcje otwarte

Obowiązują od Etapu 1:

1. Zero API specyficznego dla dostawcy w kodzie aplikacji (brak `@vercel/*`, brak `@netlify/*`).
2. Konfiguracja wyłącznie przez zmienne środowiskowe opisane w `.env.example`; żadnej wartości zaszytej w kodzie.
3. Nagłówki bezpieczeństwa i przekierowania definiowane w `next.config.ts`, nie w plikach dostawcy.
4. Brak zależności od storage, cache KV lub cron konkretnego dostawcy; zadania utrzymaniowe (retencja, czyszczenie liczników) to funkcje w bazie wywoływane ręcznie (ADR-0003 D8).
5. `output` pozostaje domyślny — bez `standalone` i bez eksportu statycznego, które zawężałyby możliwości.

## Założenie o zaufanym proxy (warunek wdrożenia — ISK-357 T8)

Limit częstości formularza (ADR-0004 §3 warstwa 3) identyfikuje klienta przez `HMAC(IP, sól)`, a adres IP pochodzi z nagłówka `x-forwarded-for` (pierwszy element) lub `x-real-ip` — `lib/security/client-hash.ts`, `extractClientIp()`. **Poprawność tego mechanizmu zależy wyłącznie od tego, czy warstwa hostingowa (proxy/edge) nadpisuje `x-forwarded-for` adresem faktycznego połączenia, a nie przekazuje wartości dostarczonej przez klienta.**

Jeśli platforma dopuści nagłówek pochodzący od klienta, atakujący może wysyłać każdy POST z innym `X-Forwarded-For` → za każdym razem inny `client_hash` → limit częstości nie działa wcale, a tabela `inquiries` zapełnia się spamem zawierającym dane osobowe (art. 32 RODO — integralność przetwarzania).

Zobowiązania:

- przy wyborze dostawcy **zweryfikować i udokumentować**, że platforma nadpisuje `x-forwarded-for` (Vercel i Netlify robią to domyślnie na swoich funkcjach brzegowych; należy to potwierdzić dla wybranego planu i ścieżki routingu);
- jeśli między klientem a aplikacją stanie dodatkowe proxy (np. Cloudflare przed hostingiem), ustalić jednoznacznie, który nagłówek niesie zaufany adres, i w razie potrzeby dostosować `extractClientIp()`;
- dopóki dostawca nie jest wybrany, założenie pozostaje otwartym warunkiem wejścia na produkcję (poniżej). Właściciel: architektura / E6.

## Warunki wejścia na produkcję (lista kontrolna przed deployem)

Wszystkie pozycje po stronie ISKT, żadna nie jest realizowalna przez agenta:

- [ ] wybór dostawcy i plan z potwierdzonym budżetem;
- [ ] właściciel konta hostingu i konta Supabase oraz rozliczeń;
- [ ] domena `szkolenia.iskt.pl` i dostęp do DNS;
- [ ] zweryfikowana domena nadawcy w Resend (SPF, DKIM) i `RESEND_API_KEY`;
- [ ] sekrety Supabase dla środowiska produkcyjnego;
- [ ] ustanowione konto administratora i wiersz w `admin_users`;
- [ ] zatwierdzona polityka prywatności i finalna klauzula informacyjna formularza;
- [ ] zatwierdzona lista procesorów danych (Supabase, Resend, hosting) i podpisane DPA;
- [ ] finalne treści, ceny, terminy i materiały wizualne z prawami do wizerunku trenerów;
- [ ] decyzja o retencji i trybie usuwania zgłoszeń (ręczny vs harmonogram);
- [ ] plan kopii zapasowych i monitoringu;
- [ ] zweryfikowane i udokumentowane założenie o zaufanym proxy (nadpisywanie `x-forwarded-for`) dla wybranego dostawcy — patrz sekcja wyżej;
- [ ] branch protection na `main` z wymaganymi checkami CI.

## Konsekwencje

- Reguły „neutralności dostawcy” dodają niewielki narzut dyscypliny w Etapie 1, ale eliminują przepisywanie przy zmianie decyzji.
- Decyzja może zostać podjęta po zakończeniu MVP bez wpływu na harmonogram implementacji.
