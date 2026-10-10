# ADR-0004 — Przepływ formularza, ochrona antyspamowa i powiadomienia Resend

- **Status:** **zatwierdzony przez ISKT 2026-10-09** (bramka planu zamknięta). Zweryfikowany wobec kodu 2026-10-10 w etapie E9T — patrz „Stan implementacji (E9T)” na końcu dokumentu.
- **Data:** 2026-10-09 (decyzja), 2026-10-10 (weryfikacja wobec implementacji)
- **Autor:** Koordynator Techniczny / Intake Lead
- **Kontrakt API:** [`docs/api/kontrakt-api.md`](../api/kontrakt-api.md)
- **Powiązane:** [ADR-0001](ADR-0001-stack-aplikacji.md), [ADR-0003](ADR-0003-model-danych-migracje-rls.md), `04_Ryzyka/Bezpieczenstwo.md`, `04_Ryzyka/RODO i dane osobowe.md`

## Kontekst

Formularz zbiera dane osobowe (imię i nazwisko, e-mail, telefon, obszar zainteresowania, wiadomość) i wymaga potwierdzenia zapoznania się z informacją RODO. Zlecenie wymaga: zapisu ze statusem `nowe`, walidacji po stronie klienta i serwera, bezpiecznych komunikatów błędów, powiadomienia przez Resend na `biuro@iskt.pl` wyłącznie z warstwy serwerowej oraz ochrony antyspamowej dobranej i udokumentowanej przez Intake Lead.

Ograniczenie wyjściowe: **nie mamy klucza Resend** (bramka ISKT) i **nie wolno wysyłać maili na `biuro@iskt.pl`** przed zgodą. Projekt przepływu musi być w pełni testowalny bez tego sekretu.

## Decyzja

### 1. Przepływ zgłoszenia

```
[Formularz w przeglądarce]
  │  walidacja Zod (ten sam schemat co serwer) + pola ukryte antyspamowe
  ▼
POST /api/inquiries           (Route Handler, runtime "nodejs")
  │  1. odrzucenie żądań bez poprawnego Content-Type / o nadmiernym rozmiarze
  │  2. kontrola antyspamowa (honeypot → token czasowy → limit częstości)
  │  3. walidacja Zod po stronie serwera (źródło prawdy)
  │  4. zapis do Supabase klientem service_role: status 'nowe',
  │     notification_status 'pending'
  │  5. powiadomienie przez adapter poczty (log | resend)
  │  6. aktualizacja notification_status na 'sent' albo 'failed'
  ▼
[Odpowiedź: 200 { ok: true } albo błąd z kodem i generycznym komunikatem]
```

**Kluczowa reguła:** niepowodzenie wysyłki e-maila **nie unieważnia zapisu**. Zgłoszenie zostaje w bazie z `notification_status = 'failed'`, a panel administratora pokazuje to jako ostrzeżenie z możliwością ponowienia. Odwrotna kolejność (mail przed zapisem) groziłaby utratą zgłoszenia klienta — niedopuszczalne dla leada sprzedażowego.

### 2. Walidacja

Jeden plik `lib/validation/inquiry.ts` eksportuje schemat Zod używany przez React Hook Form i przez Route Handler. Reguły pokrywają się z ograniczeniami `CHECK` w bazie (trzecia warstwa obrony):

| Pole                           | Reguła                                                    |
| ------------------------------ | --------------------------------------------------------- |
| `kind`                         | `'osoba' \| 'firma'`                                      |
| `fullName`                     | 2–120 znaków po `trim`                                    |
| `email`                        | poprawny adres, ≤ 254 znaki, normalizacja do małych liter |
| `phone`                        | 6–20 znaków, dozwolone cyfry, spacje, `+`, `-`, `(`, `)`  |
| `companyName`                  | wymagane i niepuste, gdy `kind = 'firma'`                 |
| `trainingId` \| `interestArea` | wymagane co najmniej jedno                                |
| `message`                      | 10–2000 znaków po `trim`                                  |
| `rodoAck`                      | musi być `true`                                           |
| `rodoClauseVersion`            | stała wersja klauzuli renderowanej na stronie             |

Komunikaty walidacji po polsku, przypisane do pól, ogłaszane czytnikom ekranu (`aria-describedby`, `aria-invalid`, `role="alert"` dla podsumowania) — wymóg WCAG 2.1 AA.

### 3. Ochrona antyspamowa — warstwy włączone w MVP

| #   | Mechanizm                       | Działanie                                                                                                                                                                        | Dlaczego                                                                                        |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | **Honeypot**                    | Ukryte pole `company_website` (ukryte stylem, nie `type="hidden"`, `tabindex="-1"`, `aria-hidden="true"`, `autocomplete="off"`). Wypełnione → odrzucenie z odpowiedzią „sukces”. | Eliminuje większość prostych botów, zero kosztu, zero wpływu na dostępność i prywatność.        |
| 2   | **Token czasowy**               | Przy renderze formularza serwer wydaje podpisany HMAC-em znacznik czasu. Odrzucenie, gdy wypełnienie zajęło < 3 s albo token jest starszy niż 60 min / ma złą sygnaturę.         | Boty wypełniają natychmiast; podpis uniemożliwia podrobienie znacznika.                         |
| 3   | **Limit częstości**             | Maks. 3 przyjęte zgłoszenia / 10 min i 10 / 24 h na `client_hash` = HMAC-SHA256(IP, `FORM_THROTTLE_SALT`). Licznik w tabeli `form_submission_throttle`, retencja 24 h.           | Ogranicza zalewanie formularza; hash zamiast IP realizuje minimalizację danych.                 |
| 4   | **Limity treści**               | Maksymalny rozmiar żądania (16 KB), limity długości pól, odrzucenie znaków sterujących, normalizacja białych znaków.                                                             | Chroni bazę i powiadomienia przed nadużyciem.                                                   |
| 5   | **Heurystyka linków**           | Więcej niż 2 adresy URL w `message` → zgłoszenie **zapisane** i oznaczone w `admin_audit_log` jako `inquiry.suspected_spam`, bez blokady.                                        | Spam treściowy nie powinien kosztować utraty prawdziwego zapytania; decyzję podejmuje człowiek. |
| 6   | **Brak zapisu PII technicznej** | Nie zapisujemy IP, User-Agenta ani nagłówków referera w `inquiries`.                                                                                                             | `04_Ryzyka/RODO i dane osobowe.md` — minimalizacja danych.                                      |

### 4. CAPTCHA — przygotowana, wyłączona

Cloudflare Turnstile zostaje zaimplementowany jako **opcjonalna** warstwa za flagą `TURNSTILE_ENABLED` (domyślnie `false`). Gdy flaga jest wyłączona, kod nie wymaga żadnego klucza i nie wykonuje żadnego żądania do zewnętrznej usługi.

Uzasadnienie rekomendacji „przygotuj, nie włączaj”:

- włączenie wymaga `TURNSTILE_SITE_KEY` i `TURNSTILE_SECRET_KEY` → bramka sekretów ISKT;
- dodaje zewnętrznego procesora danych (Cloudflare) → wymaga aktualizacji listy procesorów i klauzuli RODO → bramka prawna ISKT;
- warstwy 1–3 wystarczają dla serwisu o takim ruchu; CAPTCHA pogarsza dostępność i konwersję.

Rekomendacja: włączyć dopiero wtedy, gdy po publikacji pojawi się realny spam.

### 5. Adapter poczty

```
MAIL_TRANSPORT=log      → treść i adresat w logu serwera, bez wysyłki (domyślny lokalnie i w CI)
MAIL_TRANSPORT=resend   → realna wysyłka przez Resend; wymaga RESEND_API_KEY
```

- `RESEND_API_KEY` i `RESEND_FROM` czytane wyłącznie w kodzie serwerowym; brak prefiksu `NEXT_PUBLIC_`.
- Odbiorca z `INQUIRY_NOTIFICATION_TO` (docelowo `biuro@iskt.pl`), bez zaszywania w kodzie.
- Treść powiadomienia zawiera dane zgłaszającego (to jest cel powiadomienia), ale **logi nie zawierają danych osobowych** — w logu trafia tylko `inquiryId`, `requestId` i wynik wysyłki.
- Brak `RESEND_API_KEY` przy `MAIL_TRANSPORT=resend` → błąd konfiguracji przy starcie, nie cicha degradacja.
- Wysyłka ma 1 ponowienie z krótkim backoffem; dalsze ponowienia to ręczna akcja z panelu.
- Weryfikacja domeny nadawcy w Resend (SPF/DKIM) to zadanie ISKT przed publikacją.

### 6. Komunikaty błędów

Odpowiedź serwera nigdy nie odsyła danych wejściowych ani szczegółów technicznych:

| Sytuacja                 | HTTP | Treść dla użytkownika                                                                           |
| ------------------------ | ---- | ----------------------------------------------------------------------------------------------- |
| Sukces                   | 200  | „Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.”                                   |
| Błąd walidacji           | 400  | Lista błędów przypisana do pól, bez echa wartości                                               |
| Honeypot / token czasowy | 200  | Ten sam komunikat sukcesu (nie informujemy bota o detekcji)                                     |
| Przekroczony limit       | 429  | „Zbyt wiele zgłoszeń z tego połączenia. Spróbuj ponownie później.”                              |
| Błąd serwera             | 500  | „Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na biuro@iskt.pl.” + `requestId` |

Szczegóły trafiają wyłącznie do logu serwera, skorelowane przez `requestId`.

### 7. Testy (TDD — pisane przed implementacją)

**Jednostkowe (Vitest):** schemat Zod — przypadki brzegowe każdego pola; `rodoAck = false` odrzucone; firma bez nazwy odrzucona; brak szkolenia i obszaru odrzucony; honeypot; podpis i okno czasowe tokenu; logika limitu częstości; heurystyka linków; redakcja danych osobowych w logach.

**Integracyjne (Vitest + lokalny Supabase):** poprawne zgłoszenie zapisane ze statusem `nowe` i `notification_status`; zgłoszenie zapisane, gdy adapter poczty zwraca błąd (`failed`); `anon` nie może wstawić wiersza bezpośrednio do `inquiries`; limit częstości zwraca 429 na czwartej próbie.

**E2E (Playwright):** wysłanie formularza osoby i firmy z potwierdzeniem na ekranie; walidacja po stronie klienta blokuje wysłanie bez zgody RODO; formularz obsługiwalny wyłącznie klawiaturą; skan `axe` bez naruszeń krytycznych.

## Konsekwencje

- Cały przepływ, włącznie z obsługą błędu wysyłki, jest testowalny bez sekretu Resend — Etap 4 nie jest zablokowany przez bramkę ISKT.
- Dochodzi `FORM_THROTTLE_SALT` i `FORM_TOKEN_SECRET` jako sekrety serwerowe generowane lokalnie (nie są danymi ISKT).
- Limit częstości oparty na IP jest omijalny przez pule adresów — akceptowane w MVP; eskalacją jest włączenie Turnstile.
- `notification_status` wymaga widoku w panelu administratora (DoD Etapu 5), inaczej nieudane powiadomienia będą niewidoczne.

## Wymagane decyzje ISKT

1. Zatwierdzenie zestawu warstw antyspamowych (1–6) i rekomendacji „Turnstile przygotowany, wyłączony”.
2. Termin przekazania `RESEND_API_KEY` oraz potwierdzenie zweryfikowanej domeny nadawcy.
3. Potwierdzenie `biuro@iskt.pl` jako jedynego odbiorcy powiadomień.
4. Zatwierdzenie wersji klauzuli RODO prezentowanej przy formularzu (obecnie szkic `04_Ryzyka/Robocza klauzula informacyjna formularza.md` — do czasu zatwierdzenia formularz pozostaje tylko w środowisku lokalnym).

> **Rozstrzygnięcie:** punkt 1 zatwierdzony przez ISKT 2026-10-09. Punkty 2, 3 i 4 pozostają **otwarte** — zebrane w [skonsolidowanej liście ISKT](../odbior/braki-i-decyzje-iskt.md) jako pozycje I14, I16 i I1–I2.

---

## Stan implementacji (E9T, 2026-10-10)

Sekcja dopisana w etapie E9T. Decyzja powyżej pozostaje bez zmian; poniżej stan faktyczny po E4, bramce RODO (E8) i security review (E7). Pełny kontrakt wejścia/wyjścia: [`docs/api/kontrakt-api.md`](../api/kontrakt-api.md).

### 1. Przepływ zgłoszenia — zrealizowany, z poprawioną kolejnością i inną odpowiedzią

Faktyczna kolejność warstw w `lib/inquiries/handler.ts` (`processInquiry`):

```
Content-Type → rozmiar ciała → honeypot → token czasowy → limit częstości → walidacja Zod → zapis → powiadomienie
```

**Odstępstwo od tekstu decyzji:** sekcja 1 podawała odpowiedź sukcesu jako `200 { ok: true }`. Faktycznie serwer zwraca `200 { "message": "Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail." }` — zgodnie z tabelą komunikatów z sekcji 6 tego samego ADR, która była wewnętrznie niespójna z diagramem. Wiążąca jest tabela z sekcji 6; kontrakt API opisuje stan faktyczny.

**Kluczowa reguła „niepowodzenie wysyłki nie unieważnia zapisu” — zrealizowana i zweryfikowana.** `lib/inquiries/service.ts` wstawia zgłoszenie, dopiero potem woła `mail.send()` w `try/catch`; błąd poczty ustawia `notification_status = 'failed'` i **nie kasuje** zgłoszenia ani nie zwraca 5xx. Potwierdzone w bramce E7 oraz testem integracyjnym `inquiries-flow.test.ts`.

**Niezrealizowane z tej sekcji:** „panel administratora pokazuje to jako ostrzeżenie **z możliwością ponowienia**”. Panel pokazuje `notification_status`, ale **nie ma akcji ponowienia wysyłki** — jedyną ścieżką jest ponowne wywołanie po stronie serwera. Pozycja otwarta.

### 2. Walidacja — zrealizowana, z jedną luką pokrycia

Jeden schemat `lib/validation/inquiry.ts` jest używany przez React Hook Form i przez Route Handler. Wszystkie reguły z tabeli są zaimplementowane i pokrywają się z ograniczeniami `CHECK` w bazie. Limity w `INQUIRY_LIMITS`; telefon przez `PHONE_PATTERN = /^[0-9+\-()\s]+$/`.

**Ustalenie otwarte (E7 S3):** kontrola znaków sterujących (`hasControlChars`) jest nałożona **tylko na `message`**. `fullName`, `companyName` i `interestArea` mają jedynie limity długości — tak samo jak ograniczenia `CHECK` w bazie. Ponieważ `lib/inquiries/notification.ts` wkleja `fullName` do tematu i do treści powiadomienia, znak LF w tym polu pozwala wstrzyknąć do powiadomienia podrobione linie kontaktowe („E-mail: …", „Telefon: …"), pod które biuro odpisze. Dziś łagodzi to JSON-owe API Resend, ale **nie nasza walidacja** — zmiana transportu na SMTP otwiera klasyczny wektor wstrzyknięcia nagłówka. Poprawka: zastosować kontrolę znaków sterujących (bez LF i CR) do wszystkich pól jednoliniowych.

### 3. Warstwy antyspamowe — wszystkie zaimplementowane, jedna obchodzona

| #   | Mechanizm                   | Stan                                                                                                  | Gdzie                                                        |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Honeypot `company_website`  | zrealizowany; wypełnienie → `200` z komunikatem sukcesu                                               | `lib/antispam/honeypot.ts`                                   |
| 2   | Token czasowy HMAC          | zrealizowany; `MIN_FILL_MS = 3000`, `MAX_TOKEN_AGE_MS = 3600000`, porównanie `timingSafeEqual`        | `lib/security/form-token.ts`                                 |
| 3   | Limit częstości             | zrealizowany; `3 / 10 min` i `10 / 24 h` na `client_hash`; zaufane źródło adresu klienta (ISK-361)    | `lib/antispam/throttle.ts`, `lib/antispam/throttle-store.ts`, `lib/security/client-hash.ts` |
| 4   | Limity treści               | zrealizowany; `MAX_BODY_BYTES = 16 KiB` + limity pól + odrzucenie znaków sterujących w `message`      | `lib/inquiries/handler.ts`                                   |
| 5   | Heurystyka linków           | zrealizowany; `> 2` odnośniki → wpis `inquiry.suspected_spam` w `admin_audit_log`, bez blokady zapisu | `lib/antispam/links.ts`, `lib/inquiries/service.ts`          |
| 6   | Brak zapisu PII technicznej | zrealizowany i potwierdzony w E7 i E8 — w całym schemacie nie ma kolumny na IP ani User-Agenta        | `supabase/migrations/…120600`                                |

**Ustalenie krytyczne dla skuteczności całego zestawu (E7 W2, powtórzone jako E8 §5c) — NAPRAWIONE (ISK-361).** Pierwotny stan: `extractClientIp()` w `lib/security/client-hash.ts` czytał `x-forwarded-for` **jako pierwszy wybór** i brał z niego **element [0]**. Platformy proxujące _dopisują_ prawdziwy adres do nagłówka przysłanego przez klienta, więc indeks 0 był wartością kontrolowaną przez atakującego; zaufany `x-real-ip` był sprawdzany dopiero w dalszej kolejności, czyli nigdy, gdy XFF był obecny. Kolejność była odwrotna niż powinna. Zmierzone przed poprawką:

```
x-forwarded-for: "10.0.0.<i>, 203.0.113.9"   x-real-ip: "203.0.113.9"
→ 5 prób = 5 różnych client_hash dla JEDNEGO realnego klienta
```

W efekcie upadały wszystkie cztery blokujące warstwy jednocześnie: honeypot (pominąć pole), token czasowy (pobrać świeży i odczekać 3 s), limit częstości (podmienić XFF), heurystyka linków (z założenia nie blokuje). Dodatkowo `ip ?? "unknown"` oznaczał, że przy braku obu nagłówków **wszyscy klienci dzielili jedno wiadro** — 3 zgłoszenia / 10 min globalnie, czyli trywialny DoS formularza.

**Poprawka (ISK-361).** `extractClientIp(headers, { trustedProxyCount })` ufa wyłącznie wartości ustawianej przez platformę: `x-real-ip` w pierwszej kolejności, a z `x-forwarded-for` bierze wpis odliczony od **końca** listy o liczbę zaufanych proxy (przy jednym proxy — **ostatni**, bo to on dopisuje realny adres). Liczba zaufanych proxy to **konfiguracja** `FORM_TRUSTED_PROXY_COUNT` (domyślnie `1`), nie stała w kodzie; wartość `< 1` oznacza brak zaufanego hopu i żaden nagłówek przekazywania nie jest wtedy ufany. Gdy adresu nie da się ustalić w sposób godny zaufania, `extractClientIp` zwraca `null`, a handler **odrzuca** żądanie (`429`) zamiast haszować stałą `"unknown"` — koniec wspólnego wiadra i DoS-u. Testy jednostkowe (`tests/unit/client-hash.test.ts`) pokrywają oba kierunki: podmieniony lewy skraj XFF daje jedno wiadro dla jednego klienta; brak nagłówków daje `null`, nie wspólne wiadro. **Założenie o zaufanym proxy pozostaje warunkiem wdrożenia w [ADR-0006](ADR-0006-hosting.md)** — `FORM_TRUSTED_PROXY_COUNT` musi odpowiadać realnej topologii wybranej platformy, potwierdzonej **empirycznie na preview** (E8 T8).

Dwa dalsze ustalenia otwarte wokół tych warstw:

- **E7 S4 — wyścig w limicie częstości.** `countAcceptedSince()` i `record()` to dwie osobne operacje bez transakcji ani blokady; równoległe żądania z jednego wiadra wszystkie odczytają licznik `0` i wszystkie przejdą.
- **E7 S6 — token nie jest powiązany z klientem ani jednorazowy.** Podpisywany jest wyłącznie znacznik czasu, więc jeden token obsługuje dowolną liczbę zgłoszeń przez 60 minut. Sam HMAC i okno czasowe są poprawne; realną obronę miał dawać limit częstości.
- **E7 S2 — limit rozmiaru sprawdzany po wczytaniu całego ciała** (`await request.text()` przed porównaniem), a `raw.length` liczy jednostki UTF-16, nie bajty, więc znakami wielobajtowymi realny payload sięga ~4× deklarowanych 16 KiB.

### 4. CAPTCHA — korekta stanu: **nie jest zaimplementowana w ogóle**

Decyzja mówiła „Turnstile zostaje **zaimplementowany** jako opcjonalna warstwa za flagą”. Bramka RODO (E8 §4b) zmierzyła stan faktyczny: **żadnej logiki weryfikacji Turnstile nie ma**. Jedyne ślady były wówczas w `lib/env.ts` i `.env.example` (`TURNSTILE_ENABLED`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), a `grep -ri turnstile` po `app/` i `lib/` nie znajdował nic więcej.

Z punktu widzenia minimalizacji danych E8 oceniła ten stan jako **lepszy** niż zadeklarowany — nie ma uśpionej ścieżki, którą można włączyć bez przeglądu. Ale wprowadzał w błąd co do stanu zabezpieczeń: operator, który ustawiłby `TURNSTILE_ENABLED=true`, byłby przekonany, że CAPTCHA działa, a nie zadziałałoby nic.

**Poprawka T5 — zrealizowana na linii integracyjnej (ISK-357 → ISK-363).** Zmienne `TURNSTILE_*` **usunięto ze schematu środowiska `lib/env.ts`** — kod nie deklaruje już flag, których nie odczytuje. W `.env.example` pozostają wyłącznie jako **zarezerwowane, nieaktywne** placeholdery z jawnym ostrzeżeniem, że ich ustawienie niczego nie włącza. Gdy Turnstile zostanie realnie wdrożony (po decyzji ISKT o nowym procesorze), zmienne wracają do schematu **razem** z logiką weryfikacji, nie wcześniej. Rekomendacja bramki pozostaje: nie włączać w MVP — trzy działające warstwy nie dodają ani jednego procesora danych.

### 5. Adapter poczty — zrealizowany zgodnie z decyzją

`MAIL_TRANSPORT=log` (domyślny lokalnie i w CI) i `MAIL_TRANSPORT=resend` z wariantowym schematem Zod w `lib/env.ts`: ścieżka `resend` **wymaga** `RESEND_API_KEY` i `RESEND_FROM`, więc ich brak jest błędem konfiguracji, nie cichą degradacją. Jedno ponowienie z krótkim backoffem (`maxAttempts = 2`, `retryDelayMs = 250`) — zgodnie z decyzją. Odbiorca z `INQUIRY_NOTIFICATION_TO`, bez zaszywania w kodzie. Logi zawierają wyłącznie identyfikatory i wynik, nigdy adresata ani treści — potwierdzone w E7 i E8.

**Uwaga RODO do procedury retencji (E8 §3c):** treść powiadomienia zawiera pełne dane zgłaszającego i trafia do dwóch miejsc poza zasięgiem `purge_expired_inquiries()` — skrzynki odbiorcy i panelu Resend. Nie jest to defekt kodu, ale musi znaleźć się w procedurze retencji i w klauzuli (pozycje I7, I8).

### 6. Komunikaty błędów — zrealizowane, z jednym wyjątkiem ocenianym jako wada

Tabela komunikatów jest zaimplementowana w `lib/inquiries/handler.ts`; odpowiedzi nie odbijają danych wejściowych, szczegóły idą wyłącznie do logu skorelowanego przez `requestId`. Potwierdzone w E7 i E8.

**Ustalenie E8 T4 — ZAMKNIĘTE na linii integracyjnej (ISK-357 → ISK-363).** Wcześniej „token czasowy → 200 sukces” obejmował **wszystkie** powody odrzucenia tokenu, w tym `expired` — osoba, która zostawiła otwarty formularz na dłużej niż 60 minut i wysłała go w dobrej wierze, widziała ekran potwierdzenia, a zgłoszenie nie było zapisywane. Po poprawce: `honeypot`/`too_fast`/`bad_signature` zostają jak były (ciche `200`, nie informujemy bota), a `expired` zwraca **uczciwy błąd `422 form_expired`**. Formularz pozostaje wypełniony, klient odświeża token przez `GET /api/form-token` i prosi o ponowne wysłanie bez utraty treści (`lib/inquiries/handler.ts`, `app/(public)/kontakt/inquiry-form.tsx`).

**Pułapka weryfikacyjna, którą ta decyzja tworzy — do zapamiętania (E6 §4).** `MIN_FILL_MS = 3 s` plus „odrzucenie zwraca 200 z ekranem sukcesu” sprawia, że **naiwny test formularza przechodzi, nie zapisując nic**. Ścieżki E2E wysyłały formularz natychmiast, widziały potwierdzenie i były zielone przy zerowym zapisie. Wniosek: asercja na samym ekranie potwierdzenia jest pusta — każda ścieżka „wysłanie się udało” musi potwierdzać wiersz w bazie. W testach rozwiązuje to `awaitFormTokenMaturity()`.

### 7. Wersja klauzuli RODO — zrealizowana mechanicznie, z luką rozliczalności

`inquiries.rodo_clause_version` jest zapisywana przy każdym zgłoszeniu. `lib/rodo/clause.ts` zawiera jawny placeholder: `RODO_CLAUSE_APPROVED = false`, `RODO_CLAUSE_VERSION = "DRAFT-0-niezatwierdzona"`, a `/kontakt` wyświetla ostrzeżenie, że treść nie jest zatwierdzona. Bramka RODO oceniła to podejście jako właściwe — agent nie wymyślił treści prawnej.

**Bramka techniczna P1 (ISK-357 → ISK-363).** Niezatwierdzona klauzula to nie tylko ostrzeżenie w UI: `isRodoClauseApproved()` steruje twardą bramką. Dopóki `RODO_CLAUSE_APPROVED` ≠ `true`, serwer odrzuca każdy zapis (`503 clause_not_approved`), a UI blokuje przycisk wysyłki — osoba nie może być wprowadzona w błąd, że jej dane są przetwarzane (art. 5 ust. 1 lit. a RODO). W dev/CI ścieżkę zapisu włącza się wartością testową `RODO_CLAUSE_APPROVED=true`; w produkcji operator włącza formularz dopiero po wstawieniu realnej, zatwierdzonej klauzuli.

**Ustalenie E8 §1a (T3) — ZAMKNIĘTE na linii integracyjnej (ISK-357 → ISK-363).** Wcześniej `rodoClauseVersion` przychodziła **w ciele żądania POST** i była przyjmowana bez weryfikacji — wartość dowodząca, _którą_ klauzulę zobaczyła osoba, była dowolnie podmienialna przez składającego żądanie (podkopanie rozliczalności z art. 5 ust. 2 RODO). Po poprawce pole **nie jest już wejściem** (`lib/validation/inquiry.ts`): serwer ustawia wersję sam z `getRodoClauseVersion()` w `lib/inquiries/handler.ts` i ignoruje wartość z ciała.

**Ustalenie E8 §1b (T6) — ZAMKNIĘTE na linii integracyjnej (ISK-357 → ISK-363).** Istnieje trwała, linkowalna trasa `app/(public)/polityka-prywatnosci/page.tsx` (`/polityka-prywatnosci`) z odnośnikiem w stopce (`components/site-footer.tsx`) i przy checkboxie formularza. Strona to **wyłącznie** szkielet klauzuli (nagłówki art. 13/14 RODO z placeholderami) — treść prawną dostarcza ISKT (pozycje I1, I4); agent nie zatwierdza treści prawnych.

### 8. Testy — zrealizowane

Testy jednostkowe (`tests/unit/`): schemat Zod z przypadkami brzegowymi, honeypot, heurystyka linków, podpis i okno czasowe tokenu, logika limitu częstości, haszowanie identyfikatora klienta, redakcja logów, adaptery poczty. Testy integracyjne (`tests/integration/inquiries-flow.test.ts`): zapis ze statusem `nowe`, zapis przy błędzie poczty (`failed`) bez 5xx, odmowa `INSERT` dla roli `anon`, `429` na czwartym zgłoszeniu w oknie 10 minut. Testy E2E (`tests/e2e/formularz-zgloszenia.spec.ts`): osoba, firma, brak zgody RODO, skan `axe` formularza także w stanie błędu walidacji.
