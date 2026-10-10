# ADR-0006 — Przyszłe przejście na hosting produkcyjny (Netlify vs Vercel)

- **Status:** **zatwierdzony przez ISKT 2026-10-09 jako rekomendacja; wybór dostawcy odroczony do decyzji ISKT.** ISKT nie wybrało jeszcze ani Vercela, ani Netlify. Zweryfikowany wobec kodu 2026-10-10 w etapie E9T — patrz „Stan implementacji (E9T)” na końcu dokumentu.
- **Data:** 2026-10-09 (decyzja), 2026-10-10 (weryfikacja wobec implementacji)
- **Autor:** Koordynator Techniczny / Intake Lead
- **Powiązane:** [ADR-0001](ADR-0001-stack-aplikacji.md), [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md)

## Kontekst

Publiczny deploy jest poza zakresem tego zlecenia (§4). ADR powstaje teraz, żeby decyzje z Etapów 1–5 nie zamknęły żadnej z opcji i żeby lista warunków wejścia na produkcję była znana zawczasu.

## Porównanie

| Kryterium                                  | Vercel                                                                                                              | Netlify                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wsparcie Next.js 16 (App Router, RSC, ISR) | Pierwszej ręki — twórca frameworka; ISR, `revalidateTag`, middleware działają bez adaptera                          | Wspierany przez `@netlify/plugin-nextjs`; funkcjonalnie wystarczający, ale to warstwa pośrednia, która historycznie opóźniała się za nowymi wersjami Next.js |
| Route Handlers / funkcje serwerowe         | Natywne, region konfigurowalny                                                                                      | Netlify Functions; limity i zimne starty porównywalne                                                                                                        |
| Zmienne środowiskowe i sekrety             | Per-środowisko, z podziałem na preview/production, bez ekspozycji do klienta poza `NEXT_PUBLIC_`                    | Analogicznie                                                                                                                                                 |
| Preview deployments dla PR                 | Tak                                                                                                                 | Tak                                                                                                                                                          |
| Domena i DNS                               | Obsługa domeny z automatycznym TLS                                                                                  | Obsługa domeny z automatycznym TLS                                                                                                                           |
| RODO / lokalizacja danych                  | DPA dostępne; region funkcji do wskazania (zalecany `fra1`)                                                         | DPA dostępne; mniejsza kontrola nad regionem wykonania funkcji na niższych planach                                                                           |
| Koszt na starcie                           | Plan Hobby wystarcza technicznie, ale **zabrania użycia komercyjnego** → wymagany plan płatny dla serwisu firmowego | Plan Free dopuszcza użycie komercyjne w szerszym zakresie; limity pasma do weryfikacji                                                                       |
| Ryzyko utrzymaniowe                        | Niskie — jedna warstwa mniej                                                                                        | Średnie — zależność od wtyczki adaptera                                                                                                                      |

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
- [ ] branch protection na `main` z wymaganymi checkami CI.

## Konsekwencje

- Reguły „neutralności dostawcy” dodają niewielki narzut dyscypliny w Etapie 1, ale eliminują przepisywanie przy zmianie decyzji.
- Decyzja może zostać podjęta po zakończeniu MVP bez wpływu na harmonogram implementacji.

---

## Stan implementacji (E9T, 2026-10-10)

Sekcja dopisana w etapie E9T. Porównanie i rekomendacja powyżej pozostają bez zmian. **Wybór dostawcy jest nadal nierozstrzygnięty** — pozycja w [skonsolidowanej liście ISKT](../odbior/braki-i-decyzje-iskt.md).

### Reguły neutralności dostawcy — weryfikacja

| #   | Reguła                                                                                    | Stan 2026-10-10                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Zero API specyficznego dla dostawcy (brak `@vercel/*`, `@netlify/*`)                      | **dotrzymana** — `package.json` nie zawiera żadnej zależności dostawcy                                                                                                                                            |
| 2   | Konfiguracja wyłącznie przez zmienne środowiskowe z `.env.example`, bez wartości w kodzie | **dotrzymana** — potwierdzone w bramce E7 (skan historii wszystkich gałęzi)                                                                                                                                       |
| 3   | Nagłówki bezpieczeństwa i przekierowania w `next.config.ts`, nie w plikach dostawcy       | **dotrzymana od 2026-10-10** — `next.config.ts` ma `async headers()`, wartości pochodzą z `lib/security/headers.ts`; nadal zero plików dostawcy. Ustalenie **W1 z bramki E7** naprawione w ISK-360 (patrz niżej). |
| 4   | Brak zależności od storage, cache KV ani cron konkretnego dostawcy                        | **dotrzymana** — zadania utrzymaniowe to funkcje w bazie wywoływane ręcznie                                                                                                                                       |
| 5   | `output` pozostaje domyślny                                                               | **dotrzymana** — `next.config.ts` nie ustawia `output`                                                                                                                                                            |

### Nagłówki bezpieczeństwa — reguła 3 dotrzymana (E7 W1 naprawione, ISK-360)

**Stan do 2026-10-10:** skan całego drzewa nie znajdował **żadnego** z: `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`.

Scenariusz z bramki, który to otwierało: atakujący osadza adres szczegółu zgłoszenia w panelu w przezroczystym `<iframe>`. Zalogowany administrator wchodzi na podstawioną stronę — brak `X-Frame-Options` / `frame-ancestors` pozwala na clickjacking przycisków zmiany statusu (to zwykłe `<form action={…}>` z server action), a panel z pełnymi danymi osobowymi renderuje się w kontekście obcej strony. Brak CSP oznacza, że dowolny przyszły XSS ma pełną swobodę eksfiltracji danych osobowych i tokenu sesji.

**Stan od 2026-10-10 (ISK-360).** Wartości nagłówków powstają w jednym module `lib/security/headers.ts`, a reguły są deklarowane w `next.config.ts` (`async headers()`) — nie w `vercel.json` ani `netlify.toml`, więc reguła 3 obowiązuje niezależnie od wyboru dostawcy.

Na każdej odpowiedzi: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation/payment/usb wyłączone), `Cross-Origin-Opener-Policy: same-origin`.

CSP ma **dwa profile**, bo dwa rodzaje tras renderują się inaczej:

| Profil    | Trasy                    | `script-src`                  | Gdzie ustawiany                           |
| --------- | ------------------------ | ----------------------------- | ----------------------------------------- |
| statyczny | wszystko poza `/panel/*` | `'self' 'unsafe-inline'`      | `next.config.ts`                          |
| z nonce   | `/panel/*`               | `'self' 'nonce-<na żądanie>'` | `proxy.ts` (wartość z tego samego modułu) |

Wspólne dla obu: `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self'` (+ origin Supabase, gdy skonfigurowany), `upgrade-insecure-requests` poza trybem dev. W trybie deweloperskim dochodzą `'unsafe-eval'` i `ws:`, bez których webpack i HMR nie działają.

**Dlaczego nie jeden profil z nonce dla całej witryny.** Nonce jest wartością na żądanie, a część tras publicznych jest prerenderowana — w builderze z kluczami `/` i `/trenerzy` wychodzą jako `○ Static` z `revalidate = 300` (ADR-0001, zasada 1). W zapisanym HTML nonce byłby stały, czyli bezwartościowy, a przy niezgodności z nagłówkiem przeglądarka zablokowałaby wszystkie skrypty. Jedyną alternatywą byłoby zrezygnowanie z ISR na stronach publicznych — co zabrałoby korzyść, dla której wybrano ten model renderowania. Dlatego nonce dostaje panel: to tam renderują się dane osobowe i tam siedzi sesja administratora, czyli dokładnie cel ze scenariusza bramki.

Reguła ta wymusiła jedną zmianę poza konfiguracją: `app/panel/brak-dostepu/page.tsx` dostało `export const dynamic = "force-dynamic"`. Była to jedyna strona panelu nieczytająca sesji, więc Next prerenderował ją statycznie — a prerender ze skryptami bez atrybutu `nonce` zostałby przez przeglądarkę zablokowany. W trybie dev nie byłoby tego widać, bo tam każde żądanie renderuje się od nowa; wyłapuje to bramka E2E działająca na artefakcie builda (ADR-0005 D2).

**Co pozostaje otwarte i dlaczego:**

- `Strict-Transport-Security` jest **wyłączony domyślnie** i włączany wyłącznie przez `SECURITY_HSTS_ENABLED=true` (`.env.example`). Wartość to `max-age=63072000; includeSubDomains`. Dwuletni `max-age` z `includeSubDomains` jest trudno odwracalny, więc warunkiem włączenia jest potwierdzone HTTPS na całej domenie `iskt.pl` wraz z subdomenami — pozycja na liście kontrolnej niżej.
- `script-src` na trasach publicznych zawiera `'unsafe-inline'` (powód wyżej). CSP ogranicza tam eksfiltrację (`connect-src 'self'`, `form-action 'self'`, `base-uri 'self'`), ale nie blokuje wykonania wstrzykniętego skryptu. Strony publiczne renderują wyłącznie dane z katalogu edytowanego w panelu i jedyne `dangerouslySetInnerHTML` w drzewie to JSON-LD w `app/(public)/szkolenia/[slug]/page.tsx`.
- Strona 404 pod adresem w obrębie `/panel/*` to prerenderowany `_not-found`, więc jej skrypty nie mają nonce i przeglądarka je blokuje. Treść i odnośniki działają (HTML renderuje serwer), traci tylko nawigacja po stronie klienta. Świadomie nie dodano trasy catch-all tylko po to, żeby strona 404 hydratowała się pod CSP.
- Włączenie Turnstile (`TURNSTILE_ENABLED`, dziś tylko obsługa po stronie serwera) będzie wymagało dopisania `challenges.cloudflare.com` do `script-src` i `frame-src`. Bez tego widget zostanie zablokowany.

Pokrycie testami: `tests/unit/security-headers.test.ts` (treść polityki i to, że reguły są deklarowane w `next.config.ts`, w tym wyłączenie `/panel/*` z profilu statycznego) oraz `tests/e2e/naglowki-bezpieczenstwa.spec.ts` (odpowiedzi uruchomionego serwera, pojedynczy nagłówek CSP, nonce na każdym skrypcie panelu, przejście administratora przez panel bez naruszeń CSP).

### Nowy warunek wdrożenia: zaufane proxy (E8 T8, E7 W2)

Limit częstości opiera się na adresie klienta odczytanym z nagłówków (`lib/security/client-hash.ts`). Poprawność tego mechanizmu zależy **wyłącznie** od tego, czy platforma hostingowa **nadpisuje** nagłówki przysłane przez klienta — a to założenie nie było dotąd nigdzie zapisane. Dodatkowo obecna implementacja czyta `x-forwarded-for[0]`, czyli wartość kontrolowaną przez atakującego (szczegóły: [ADR-0004, sekcja 3 stanu implementacji](ADR-0004-formularze-antyspam-resend.md#3-warstwy-antyspamowe--wszystkie-zaimplementowane-jedna-obchodzona)).

**Warunek wdrożenia, wiążący niezależnie od wyboru dostawcy:**

1. Ustalić i zapisać, który nagłówek na wybranej platformie jest **nadpisywany** przez platformę i dlatego godny zaufania.
2. Ustalić liczbę zaufanych proxy przed aplikacją i uczynić ją konfiguracją, nie stałą w kodzie.
3. Zweryfikować to empirycznie na środowisku preview **przed** przyjęciem pierwszego realnego zgłoszenia — nie na podstawie dokumentacji dostawcy.
4. Brak ustalonego adresu klienta traktować jako odrzucenie albo osobny, znacznie ostrzejszy limit — nigdy jako wspólne wiadro dla wszystkich klientów.

### Dodatkowe warunki wdrożenia wynikające z bramek

Do listy kontrolnej powyżej dochodzą pozycje zmierzone w bramkach E7 i E8:

- [ ] **włączenie HSTS** (`SECURITY_HSTS_ENABLED=true`) — po potwierdzeniu HTTPS na całej domenie `iskt.pl` wraz z subdomenami; same nagłówki bezpieczeństwa są już w `next.config.ts` (E7 W1 naprawione w ISK-360);
- [ ] **zaufane proxy dla limitu częstości** (cztery punkty powyżej);
- [ ] **wyłączenie otwartej rejestracji w Supabase Auth** (E7 W3): `supabase/config.toml` ma `enable_signup = true` w `[auth]` i `[auth.email]`, `enable_confirmations = false`, `minimum_password_length = 6`, puste `password_requirements`, wyłączone MFA i brak sekcji `[auth.sessions]`. Dowolna osoba może utworzyć konto i przejść `proxy.ts` (zatrzymuje ją dopiero `requireAdmin()` i RLS, więc dane nie wyciekają — ale middleware przestaje być bramką, a projekt dostaje zalew `auth.users` i nadużycie wysyłki maili transakcyjnych). Ten plik konfiguruje również projekt zdalny, więc ustawienia należy zweryfikować po wdrożeniu;
- [ ] **jawne atrybuty ciasteczek sesji** (E7 S5): `httpOnly`, `secure`, `sameSite` zależą dziś od domyślnych wartości `@supabase/ssr@0.12.7`, nieprzypiętych w kodzie i nieobjętych testem;
- [ ] **przełączenie `app/robots.ts`** (E7 N6): dziś `disallow: "/"` dla całej witryny przy jednocześnie publikowanej mapie witryny. Przed startem to poprawna postawa, ale jest to świadomy przełącznik do podjęcia przy wdrożeniu;
- [ ] **region przetwarzania i transfery poza EOG** (E8 I4, I5) — dla Supabase i Resend; wpływa na treść klauzuli informacyjnej;
- [ ] **rejestr procesorów i umowy powierzenia** — lista i stan: [`docs/zgodnosc/procesorzy.md`](../zgodnosc/procesorzy.md).
