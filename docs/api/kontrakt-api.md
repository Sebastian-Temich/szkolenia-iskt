# Kontrakt punktów wystawionych przez aplikację

- **Status:** opisuje stan faktyczny na 2026-10-10 (etap E9T), zweryfikowany wobec kodu w `app/` i `lib/`
- **Decyzje:** [ADR-0004](../adr/ADR-0004-formularze-antyspam-resend.md) (formularz i antyspam), [ADR-0001](../adr/ADR-0001-stack-aplikacji.md) (granice warstw)
- **Schemat bazy:** [`../architektura/model-danych.md`](../architektura/model-danych.md)

Aplikacja wystawia **dwa** publiczne punkty JSON — `POST /api/inquiries` (zgłoszenie) i `GET /api/form-token` (odświeżenie tokenu po przedawnieniu, sekcja 1.7) — dwa punkty metadanych generowane przez Next.js, oraz zestaw **server actions** panelu, które nie są publicznym API i nie mają stabilnego kontraktu HTTP.

---

## 1. `POST /api/inquiries`

Jedyna ścieżka zapisu zgłoszenia. Przeglądarka **nigdy** nie pisze do tabeli `inquiries` — zapis wykonuje ten Route Handler kluczem `service_role`, który omija RLS ([ADR-0003 D5](../adr/ADR-0003-model-danych-migracje-rls.md)).

- **Plik:** `app/api/inquiries/route.ts` (konfiguracja i wstrzyknięcie zależności), `lib/inquiries/handler.ts` (`processInquiry` — cała logika)
- **Runtime:** `nodejs`; `dynamic = "force-dynamic"`
- **Uwierzytelnianie:** brak (punkt publiczny). Ochronę realizują warstwy antyspamowe, nie uwierzytelnianie.
- **Content-Type:** wymagany `application/json`

### 1.1 Ciało żądania

| Pole                | Typ                  | Wymagane           | Reguła walidacji (`lib/validation/inquiry.ts`)                                                                                                |
| ------------------- | -------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`              | `"osoba" \| "firma"` | **tak**            | enum                                                                                                                                          |
| `fullName`          | `string`             | **tak**            | po `trim` 2–120 znaków                                                                                                                        |
| `email`             | `string`             | **tak**            | poprawny adres, ≤ 254 znaki, normalizowany do małych liter                                                                                    |
| `phone`             | `string`             | **tak**            | po `trim` 6–20 znaków, tylko `0-9 + - ( ) ` i spacje                                                                                          |
| `companyName`       | `string`             | warunkowo          | ≤ 160 znaków; **wymagane i niepuste gdy `kind = "firma"`**                                                                                    |
| `trainingId`        | `string` (UUID)      | warunkowo          | poprawny UUID; **wymagane co najmniej jedno z `trainingId` / `interestArea`**                                                                 |
| `interestArea`      | `string`             | warunkowo          | ≤ 160 znaków; jak wyżej                                                                                                                       |
| `message`           | `string`             | **tak**            | po `trim` 10–2000 znaków; odrzucane znaki sterujące poza tabulatorem, LF i CR                                                                 |
| `rodoAck`           | `true`               | **tak**            | musi być literalnie `true`                                                                                                                    |
| `rodoClauseVersion` | `string`             | **tak**            | niepusty (patrz uwaga o rozliczalności niżej)                                                                                                 |
| `formToken`         | `string`             | **tak w praktyce** | format `<znacznik_czasu>.<hmac_hex>`; brak = odrzucenie z odpowiedzią „sukces"                                                                |
| `company_website`   | `string`             | nie                | **honeypot.** Pole ukryte stylem (nie `type="hidden"`), `tabindex="-1"`, `aria-hidden="true"`. Wypełnione = odrzucenie z odpowiedzią „sukces" |

Pola nierozpoznane są ignorowane. Maksymalny rozmiar ciała: **16 KiB**.

Puste łańcuchy w `companyName` i `interestArea` są normalizowane do `undefined`, więc `""` nie spełnia wymogu „co najmniej jedno z `trainingId` / `interestArea`".

Przykład (osoba indywidualna):

```json
{
  "kind": "osoba",
  "fullName": "Jan Przykładowy",
  "email": "jan@example.invalid",
  "phone": "600 100 200",
  "interestArea": "Sztuczna inteligencja",
  "message": "Proszę o ofertę szkolenia dla zespołu 8 osób.",
  "rodoAck": true,
  "rodoClauseVersion": "DRAFT-0-niezatwierdzona",
  "formToken": "1760000000000.8f3c…"
}
```

### 1.2 Kolejność warstw

```
1. Content-Type              → 415 unsupported_media_type
2. rozmiar ciała i JSON      → 413 payload_too_large | 400 invalid_json
3. honeypot                  → 200 (komunikat sukcesu, bez zapisu)
4. token czasowy             → 200 (komunikat sukcesu, bez zapisu)
5. limit częstości           → 429 too_many_requests
6. walidacja Zod             → 400 validation_error
7. zapis (źródło prawdy)     → 200
8. powiadomienie (best-effort, NIE wpływa na kod odpowiedzi)
```

Krok 7 jest źródłem prawdy: zgłoszenie zostaje zapisane ze statusem `nowe` i `notification_status = 'pending'` (wartości `DEFAULT` z migracji) **przed** próbą wysyłki. Niepowodzenie wysyłki ustawia `notification_status = 'failed'` i **nie kasuje zgłoszenia ani nie zmienia kodu odpowiedzi na 5xx**.

### 1.3 Odpowiedzi

| Sytuacja                                                                                | HTTP  | Ciało                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sukces (zapis wykonany)                                                                 | `200` | `{"message":"Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail."}`                                                                 |
| Honeypot wypełniony                                                                     | `200` | **to samo ciało co sukces**, bez zapisu                                                                                                     |
| Token nieprawidłowy, zbyt szybki (< 3 s) lub o złej sygnaturze                          | `200` | **to samo ciało co sukces**, bez zapisu                                                                                                     |
| Token przedawniony (> 60 min) — sygnał ludzki, nie bot (ISK-357 T4 / ISK-363)           | `422` | `{"error":"form_expired","message":"Formularz był otwarty zbyt długo…"}` — **uczciwy błąd, bez zapisu**; klient pobiera świeży token z `GET /api/form-token` i wysyła ponownie bez utraty treści |
| Klauzula RODO niezatwierdzona (`RODO_CLAUSE_APPROVED` ≠ `true`) — bramka P1             | `503` | `{"error":"clause_not_approved","message":"Formularz zgłoszeniowy jest chwilowo niedostępny…"}` — **bez zapisu**; endpoint zamknięty, dopóki ISKT nie zatwierdzi treści |
| Brak / inny `Content-Type`                                                              | `415` | `{"error":"unsupported_media_type"}`                                                                                                        |
| Ciało > 16 KiB                                                                          | `413` | `{"error":"payload_too_large"}`                                                                                                             |
| Ciało nie jest obiektem JSON                                                            | `400` | `{"error":"invalid_json"}`                                                                                                                  |
| Błąd walidacji                                                                          | `400` | `{"error":"validation_error","fields":{"<pole>":["<komunikat>"]}}`                                                                          |
| Przekroczony limit częstości                                                            | `429` | `{"error":"too_many_requests","message":"Zbyt wiele zgłoszeń z tego połączenia. Spróbuj ponownie później."}`                                |
| Brak `FORM_TOKEN_SECRET`, `FORM_THROTTLE_SALT` lub `INQUIRY_NOTIFICATION_TO`            | `500` | `{"error":"server_misconfigured"}`                                                                                                          |
| Błąd zapisu                                                                             | `500` | `{"error":"server_error","message":"Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na biuro@iskt.pl.","requestId":"<uuid>"}` |

`fields` zawiera wyłącznie komunikaty walidacji, **nigdy wartości wejściowych**. Żadna odpowiedź nie odbija danych wejściowych ani szczegółów technicznych; szczegóły trafiają wyłącznie do logu serwera, skorelowane przez `requestId`.

> **Odstępstwo wobec diagramu w [ADR-0004](../adr/ADR-0004-formularze-antyspam-resend.md) sekcja 1:** diagram podawał `200 { ok: true }`. Faktyczna odpowiedź to `200 { message: … }`, zgodnie z tabelą komunikatów z sekcji 6 tego samego ADR — dokument był w tym miejscu wewnętrznie niespójny. Wiążący jest stan opisany tutaj.

> **Dlaczego odrzucenie antyspamowe zwraca 200 — i co z tego wynika dla testów.** Nie informujemy bota o detekcji ([ADR-0004](../adr/ADR-0004-formularze-antyspam-resend.md) sekcja 6). Konsekwencja, na którą nadepnęła bramka QA: **asercja na samym ekranie potwierdzenia jest pusta.** `MIN_FILL_MS = 3 s` sprawia, że test wysyłający formularz natychmiast widzi `200` i ekran sukcesu przy **zerowym zapisie**. Każdy test ścieżki „wysłanie się udało" musi potwierdzać wiersz w bazie; w zestawie E2E robi to `awaitFormTokenMaturity()`.

> **Ustalenie E8 T4 — ZAMKNIĘTE (ISK-357 → ISK-363).** Wcześniej odpowiedź `200` obejmowała również powód `expired`: osoba, która zostawiła otwarty formularz na dłużej niż 60 minut i wysłała go w dobrej wierze, widziała potwierdzenie, a zgłoszenie nie było zapisywane (cichy fałszywy sukces). Po poprawce `expired` zwraca `422 { "error":"form_expired" }` — uczciwy błąd. Formularz pozostaje wypełniony, klient odświeża token przez `GET /api/form-token` i prosi o ponowne wysłanie. `honeypot`/`too_fast`/`bad_signature` nadal zwracają ciche `200` (nie informujemy bota o detekcji).

### 1.4 Antyspam — parametry

| Warstwa           | Parametr                   | Wartość                                                                 | Plik                         |
| ----------------- | -------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| Honeypot          | nazwa pola                 | `company_website`                                                       | `lib/antispam/honeypot.ts`   |
| Token czasowy     | minimalny czas wypełnienia | `3 s` (`MIN_FILL_MS`)                                                   | `lib/security/form-token.ts` |
| Token czasowy     | maksymalny wiek tokenu     | `60 min` (`MAX_TOKEN_AGE_MS`)                                           | `lib/security/form-token.ts` |
| Limit częstości   | okno krótkie               | `3` przyjęte / `10 min`                                                 | `lib/antispam/throttle.ts`   |
| Limit częstości   | okno długie                | `10` przyjętych / `24 h`                                                | `lib/antispam/throttle.ts`   |
| Limity treści     | rozmiar ciała              | `16 KiB` (`MAX_BODY_BYTES`)                                             | `lib/inquiries/handler.ts`   |
| Heurystyka linków | próg                       | `> 2` odnośniki → wpis `inquiry.suspected_spam`, **bez blokady zapisu** | `lib/antispam/links.ts`      |

Token jest wydawany przy renderze `/kontakt` (strona ma `dynamic = "force-dynamic"` właśnie dlatego) i wstrzykiwany do formularza jako wartość ukrytego pola. Istnieje **dodatkowo** punkt `GET /api/form-token` (sekcja 1.7) — służy **wyłącznie** do odświeżenia tokenu po jego przedawnieniu (ścieżka `422 form_expired`, ISK-357 T4), aby osoba mogła wysłać zgłoszenie ponownie bez utraty wpisanej treści. Zwykły render strony nie korzysta z tego punktu.

Identyfikator klienta do limitu częstości to `HMAC-SHA256(adres_IP, FORM_THROTTLE_SALT)`; surowy adres IP nie jest nigdzie zapisywany.

> **Zaufane źródło adresu klienta (E7 W2 / E8 §5c) — naprawione (ISK-361):** `extractClientIp()` ufa `x-real-ip` w pierwszej kolejności, a z `x-forwarded-for` bierze wpis odliczony od **końca** listy o `FORM_TRUSTED_PROXY_COUNT` (konfiguracja, domyślnie `1`) — lewy skraj listy jest kontrolowany przez klienta i ignorowany. Gdy adresu nie da się ustalić w sposób godny zaufania, handler **odrzuca** żądanie (`429`) zamiast używać wspólnego wiadra `"unknown"`. **Warunek wdrożenia pozostaje otwarty:** `FORM_TRUSTED_PROXY_COUNT` musi odpowiadać topologii platformy, zweryfikowanej empirycznie na preview — [ADR-0006, „Nowy warunek wdrożenia: zaufane proxy"](../adr/ADR-0006-hosting.md#nowy-warunek-wdrożenia-zaufane-proxy-e8-t8-e7-w2).

### 1.5 Co trafia do bazy

Route Handler mapuje żądanie na wiersz `inquiries` (`lib/inquiries/repository.ts`): `kind`, `full_name`, `email`, `phone`, `company_name`, `training_id`, `interest_area`, `message`, `rodo_ack`, `rodo_clause_version`, `source_path`. Pozostałe kolumny pochodzą z `DEFAULT` migracji.

Dwa pola, które w praktyce są zawsze `NULL`:

- **`source_path`** — pole zarezerwowane; handler przyjmuje je tylko jako wstrzykniętą zależność (`deps.sourcePath`), a Route Handler jej nie ustawia.
- **`training_id`** — **formularz go nie wysyła.** Schemat Zod akceptuje `trainingId`, ale `app/(public)/kontakt/inquiry-form.tsx` wysyła wyłącznie `interestArea`. Strona szczegółu szkolenia linkuje do `/kontakt?szkolenie=<slug>`, lecz **strona kontaktu nie czyta tego parametru** — kontekst szkolenia jest tracony. Pozycja otwarta: albo wypełnić `trainingId` z parametru, albo usunąć parametr z linku, żeby nie obiecywał działania, którego nie ma.

### 1.6 Logi

Logowane są wyłącznie pola z białej listy (`lib/security/safe-log.ts`): `event`, `requestId`, `inquiryId`, `transport`, `outcome`, `layer`, `status`, `notificationStatus`, `errorCode`, `httpStatus`. Biała lista, nie czarna — pole dodane przez pomyłkę nie przecieka, bo nie jest wymienione. `safeErrorCode()` nigdy nie zwraca komunikatu wyjątku. Potwierdzone w bramkach E7 i E8.

Zdarzenia: `inquiry.rejected` (z polem `layer`), `inquiry.accepted`, `inquiry.notification`, `inquiry.error`, `inquiry.audit_failed`, `inquiry.mark_failed`, `mail.sent`, `mail.retry`, `mail.failed`.

### 1.7 `GET /api/form-token`

Wydaje świeży token czasowy formularza (`lib/security/form-token.ts`, `app/api/form-token/route.ts`). Istnieje **wyłącznie** dla ścieżki odzyskania po przedawnieniu tokenu (ISK-357 T4): gdy `POST /api/inquiries` zwróci `422 form_expired`, klient pobiera stąd nowy token i pozwala wysłać zgłoszenie ponownie **bez utraty wpisanej treści**. Render `/kontakt` nie korzysta z tego punktu — token wstrzykuje po stronie serwera.

| Sytuacja               | HTTP  | Ciało                                   |
| ---------------------- | ----- | --------------------------------------- |
| Sukces                 | `200` | `{"formToken":"<token>"}`               |
| Brak `FORM_TOKEN_SECRET` | `500` | `{"error":"server_misconfigured"}`     |

`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `cache-control: no-store`. Token jest podpisywany wyłącznie sekretem serwerowym; endpoint nie przyjmuje żadnych danych wejściowych i nie zapisuje niczego.

---

## 2. Punkty metadanych

| Punkt              | Plik             | Stan faktyczny                                                                                                                                                                      |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /robots.txt`  | `app/robots.ts`  | **`disallow: "/"` dla całej witryny** i jednocześnie opublikowana mapa witryny. Przed startem to poprawna postawa; przy wdrożeniu jest to świadomy przełącznik do podjęcia (E7 N6). |
| `GET /sitemap.xml` | `app/sitemap.ts` | generowana z opublikowanych szkoleń przez `getTrainings()`                                                                                                                          |

Adresy kanoniczne buduje `lib/seo.ts` na podstawie `NEXT_PUBLIC_SITE_URL`.

---

## 3. Panel administratora — server actions, nie API

`/panel/*` nie wystawia publicznego API JSON. Mutacje to **React server actions** wywoływane z formularzy; nie mają stabilnego, dokumentowanego kontraktu HTTP i nie należy ich traktować jako punktu integracyjnego.

| Akcja                 | Plik                             | Zakres                                                                                         |
| --------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `login`, `logout`     | `app/panel/logowanie/actions.ts` | `signInWithPassword` / `signOut`; komunikat błędu jest generyczny („Nie udało się zalogować…”) |
| `saveCategory`        | `app/panel/(admin)/actions.ts`   | utworzenie i edycja kategorii                                                                  |
| `saveTrainer`         | `app/panel/(admin)/actions.ts`   | utworzenie i edycja trenera                                                                    |
| `saveTraining`        | `app/panel/(admin)/actions.ts`   | utworzenie i edycja szkolenia wraz z przypisaniem trenerów                                     |
| `deleteCatalogItem`   | `app/panel/(admin)/actions.ts`   | usunięcie pozycji katalogu                                                                     |
| `setPublished`        | `app/panel/(admin)/actions.ts`   | publikacja i wycofanie publikacji                                                              |
| `changeInquiryStatus` | `app/panel/(admin)/actions.ts`   | zmiana statusu zgłoszenia (walidowana triggerem w bazie)                                       |

### 3.1 Jak wygląda autoryzacja

Trzy warstwy, celowo niezależne:

1. **`proxy.ts`** (w Next.js 16 zastąpił `middleware.ts`) z `config.matcher = ["/panel/:path*"]` — przekierowuje na `/panel/logowanie`, gdy w sesji nie ma claimów. Sprawdza **wyłącznie istnienie sesji**, nie uprawnienia administratora.
2. **`requireAdmin()`** (`lib/panel/auth.ts`) — wołane w layoucie panelu i w **każdej** z 7 server actions; brak sesji → `/panel/logowanie`, sesja bez wiersza w `admin_users` → `/panel/brak-dostepu`.
3. **RLS w bazie** — panel używa klucza **anon z sesją użytkownika** (`lib/supabase/server.ts`), **nie** `service_role`, więc polityki `is_admin()` egzekwują autoryzację niezależnie od warstw 1 i 2. Bezpośrednie wywołanie server action przez zalogowanego nie-administratora zatrzymuje i `requireAdmin()`, i RLS.

Weryfikacja bramki E7: obrona w głąb działa realnie — 7 z 7 akcji woła `requireAdmin()`, a `createAdminClient()` (`service_role`) jest używany w **dokładnie jednym miejscu** w całym repozytorium, czyli w `app/api/inquiries/route.ts`.

Dwa ustalenia otwarte dotyczące tych warstw:

- **E7 S1 — fail-open w `proxy.ts`:** przy braku `NEXT_PUBLIC_SUPABASE_URL` lub `ANON_KEY` funkcja zwraca `next()`, więc kontrola `/panel/*` cicho przestaje istnieć. Całość kończy się 500 niżej (bo strony rzucają z `getPublicEnv()`), ale fail-closed wynika z przypadkowej kolejności, nie z intencji.
- **E7 W3 — otwarta rejestracja w Auth:** `supabase/config.toml` ma `enable_signup = true`, `enable_confirmations = false`, `minimum_password_length = 6`, wyłączone MFA i brak sekcji `[auth.sessions]`. Dowolna osoba może utworzyć konto i przejść warstwę 1; zatrzymują ją warstwy 2 i 3, więc dane nie wyciekają — ale middleware przestaje być bramką.

### 3.2 Inwalidacja cache po publikacji

`app/panel/(admin)/actions.ts` woła `invalidatePublicCatalog({ revalidatePath, updateTag })` (`lib/panel/catalog-cache.ts`), która wykonuje `updateTag("catalog")` oraz `revalidatePath` dla `/szkolenia`, `/szkolenia/[slug]` i `/trenerzy`.

> **Stan faktyczny:** realną inwalidację wykonują wyłącznie wywołania `revalidatePath`. `updateTag("catalog")` **nie unieważnia dziś niczego** — jedynym modułem oznaczającym odczyt tym tagiem jest `lib/catalog/public.ts`, którego **nie importuje żaden plik** (martwy kod). Publiczny odczyt idzie przez `lib/public-catalog.ts` z czasowym `revalidate` ustawianym per trasa (katalog: 300 s). Publikacja z panelu działa, ale nie tą ścieżką, którą opisywały konsekwencje [ADR-0001](../adr/ADR-0001-stack-aplikacji.md). Pozycja otwarta: albo podłączyć moduł z tagiem, albo usunąć martwy moduł i wywołanie `updateTag`.

---

## 4. Czego aplikacja **nie** wystawia

- **Żadnego RPC PostgREST** dla ról klienckich. Funkcje projektu w schemacie `public` mają odebrane `EXECUTE` dla `PUBLIC`, `anon` i `authenticated`; funkcje `purge_*` są wykonywalne wyłącznie przez `service_role` ([`model-danych.md` §4.2](../architektura/model-danych.md#42-funkcje--macierz-której-pierwotna-specyfikacja-nie-zawierała)).
- **Żadnego punktu zapisu do `inquiries` innego niż `POST /api/inquiries`.** Tabela nie ma polityki `INSERT` dla `anon` ani `authenticated`.
- **Żadnego punktu wydającego token przy zwykłym renderze** — token do formularza powstaje po stronie serwera przy renderze `/kontakt`. Istnieje osobny `GET /api/form-token` (sekcja 1.7), ale **wyłącznie** do odświeżenia tokenu po przedawnieniu (ścieżka `422 form_expired`, ISK-357 T4); nie przyjmuje danych wejściowych i nic nie zapisuje.
- **Żadnego eksportu zgłoszeń** z panelu (potwierdzone w bramce E8).
- **Żadnej weryfikacji CAPTCHA.** Zmienne `TURNSTILE_*` **nie istnieją już w schemacie środowiska** (`lib/env.ts`, usunięte w ISK-357 T5): deklarowanie flag, których żaden kod nie odczytuje, wprowadzałoby operatora w błąd co do stanu zabezpieczeń. W `.env.example` pozostają wyłącznie jako **zarezerwowane, nieaktywne** placeholdery z ostrzeżeniem — szczegóły w [ADR-0004, sekcja 4 stanu implementacji](../adr/ADR-0004-formularze-antyspam-resend.md#4-captcha--korekta-stanu-nie-jest-zaimplementowana-w-ogóle).
- **Żadnych nagłówków bezpieczeństwa.** `next.config.ts` nie definiuje `headers()` (E7 W1).

---

## 5. Odczyt publiczny (nie jest API, ale jest kontraktem)

Publiczne strony czytają katalog **bezpośrednio z PostgREST** kluczem `anon`, przez `lib/public-catalog.ts`. Filtrowanie treści nieopublikowanych jest realizowane przez **RLS**, nie przez warunek w kodzie aplikacji — bramką jest więc baza, nie filtr, który łatwo pominąć.

| Funkcja                         | Tabela                                                        | Uwagi                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `getCategories()`               | `categories`                                                  | `.eq("is_published", true)`, sortowanie `sort_order`                                                                               |
| `getTrainings({ category, q })` | `trainings` + `categories` + `training_trainers` → `trainers` | filtr po `categories.slug`; wyszukiwanie przez `.textSearch("search_tsv", unaccentPl(q), { config: "simple", type: "websearch" })` |
| `getTraining(slug)`             | jak wyżej, `maybeSingle()`                                    | brak wiersza → `404` na trasie                                                                                                     |
| `getTrainers()`                 | `trainers`                                                    | `.eq("is_published", true)`                                                                                                        |

> **Zachowanie podczas builda bez konfiguracji:** `npm run build` w CI biegnie bez kluczy Supabase (kontrakt „całe CI bez sekretów"), więc `publicClient()` zwraca `null` w fazie `phase-production-build` i prerender daje pustą powłokę. **Poza fazą builda brak konfiguracji jest twardym błędem** — strona nigdy nie udaje, że katalog jest po prostu pusty.

> **Kontrakt normalizacji zapytania jest rozdzielony między aplikację i bazę.** `unaccentPl()` w `lib/catalog.ts` musi odwzorowywać `public.immutable_unaccent()`. Zmiana jednej strony bez drugiej powoduje, że wyszukiwanie przestaje działać dla wejścia z polskimi diakrytykami — i jest to awaria cicha: zapytanie zwraca zero wyników, nie błąd.
