# ADR-0004 — Przepływ formularza, ochrona antyspamowa i powiadomienia Resend

- **Status:** proponowany (wymaga zatwierdzenia ISKT w bramce planu)
- **Data:** 2026-10-09
- **Autor:** Koordynator Techniczny / Intake Lead
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

| Pole | Reguła |
| --- | --- |
| `kind` | `'osoba' \| 'firma'` |
| `fullName` | 2–120 znaków po `trim` |
| `email` | poprawny adres, ≤ 254 znaki, normalizacja do małych liter |
| `phone` | 6–20 znaków, dozwolone cyfry, spacje, `+`, `-`, `(`, `)` |
| `companyName` | wymagane i niepuste, gdy `kind = 'firma'` |
| `trainingId` \| `interestArea` | wymagane co najmniej jedno |
| `message` | 10–2000 znaków po `trim` |
| `rodoAck` | musi być `true` |
| `rodoClauseVersion` | stała wersja klauzuli renderowanej na stronie |

Komunikaty walidacji po polsku, przypisane do pól, ogłaszane czytnikom ekranu (`aria-describedby`, `aria-invalid`, `role="alert"` dla podsumowania) — wymóg WCAG 2.1 AA.

### 3. Ochrona antyspamowa — warstwy włączone w MVP

| # | Mechanizm | Działanie | Dlaczego |
| --- | --- | --- | --- |
| 1 | **Honeypot** | Ukryte pole `company_website` (ukryte stylem, nie `type="hidden"`, `tabindex="-1"`, `aria-hidden="true"`, `autocomplete="off"`). Wypełnione → odrzucenie z odpowiedzią „sukces”. | Eliminuje większość prostych botów, zero kosztu, zero wpływu na dostępność i prywatność. |
| 2 | **Token czasowy** | Przy renderze formularza serwer wydaje podpisany HMAC-em znacznik czasu. Odrzucenie, gdy wypełnienie zajęło < 3 s albo token jest starszy niż 60 min / ma złą sygnaturę. | Boty wypełniają natychmiast; podpis uniemożliwia podrobienie znacznika. |
| 3 | **Limit częstości** | Maks. 3 przyjęte zgłoszenia / 10 min i 10 / 24 h na `client_hash` = HMAC-SHA256(IP, `FORM_THROTTLE_SALT`). Licznik w tabeli `form_submission_throttle`, retencja 24 h. | Ogranicza zalewanie formularza; hash zamiast IP realizuje minimalizację danych. |
| 4 | **Limity treści** | Maksymalny rozmiar żądania (16 KB), limity długości pól, odrzucenie znaków sterujących, normalizacja białych znaków. | Chroni bazę i powiadomienia przed nadużyciem. |
| 5 | **Heurystyka linków** | Więcej niż 2 adresy URL w `message` → zgłoszenie **zapisane** i oznaczone w `admin_audit_log` jako `inquiry.suspected_spam`, bez blokady. | Spam treściowy nie powinien kosztować utraty prawdziwego zapytania; decyzję podejmuje człowiek. |
| 6 | **Brak zapisu PII technicznej** | Nie zapisujemy IP, User-Agenta ani nagłówków referera w `inquiries`. | `04_Ryzyka/RODO i dane osobowe.md` — minimalizacja danych. |

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

| Sytuacja | HTTP | Treść dla użytkownika |
| --- | --- | --- |
| Sukces | 200 | „Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.” |
| Błąd walidacji | 400 | Lista błędów przypisana do pól, bez echa wartości |
| Honeypot / token czasowy | 200 | Ten sam komunikat sukcesu (nie informujemy bota o detekcji) |
| Przekroczony limit | 429 | „Zbyt wiele zgłoszeń z tego połączenia. Spróbuj ponownie później.” |
| Błąd serwera | 500 | „Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na biuro@iskt.pl.” + `requestId` |

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
