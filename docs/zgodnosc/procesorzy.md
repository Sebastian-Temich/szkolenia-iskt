# Rejestr procesorów danych

- **Status:** pierwsza wersja rejestru; **ustalona z kodu**, bo dokumentu nie było. Uzupełnienie o umowy powierzenia, regiony i transfery należy do ISKT.
- **Data:** 2026-10-10 (etap E9T)
- **Źródło ustaleń:** bramka zgodności RODO (E8, ISK-346), sekcja 4; weryfikacja ścieżek danych w kodzie
- **Powiązane:** [ADR-0004](../adr/ADR-0004-formularze-antyspam-resend.md), [ADR-0006](../adr/ADR-0006-hosting.md), [braki i decyzje ISKT](../odbior/braki-i-decyzje-iskt.md)

Bramka E8 stwierdziła, że **wymóg umów powierzenia był poprawnie śledzony** (pozycja na liście kontrolnej ADR-0006, a ADR-0004 zauważał, że włączenie Turnstile wymagałoby aktualizacji listy procesorów) — ale **sama lista nie istniała**. Ten plik ją zakłada. Nie zatwierdza żadnej treści prawnej ani decyzji biznesowej.

---

## 1. Rejestr

| Procesor                                                 | Jakich danych dotyka                                                                                                                                                                                  | Na jakiej podstawie to ustalono                                                                                                                                                                               | Stan umowy powierzenia                                             | Region / transfer poza EOG                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Supabase**                                             | wszystkie dane osobowe ze zgłoszeń: imię i nazwisko, e-mail, telefon, nazwa firmy, treść wiadomości, pseudonimizowany identyfikator klienta (`client_hash`); dane konta administratora w `auth.users` | hosting bazy — `lib/supabase/admin.ts`, `lib/supabase/server.ts`, cały schemat `public`                                                                                                                       | **brak potwierdzenia DPA** (I6)                                    | **brak danych** (I7). Agent nie ma dostępu do produkcyjnego projektu (zakaz z ADR-0002) i nie ustali regionu z repozytorium. |
| **Resend**                                               | pełna treść powiadomienia: imię i nazwisko, e-mail, telefon, nazwa firmy, pełna treść wiadomości, wersja klauzuli RODO                                                                                | `lib/mail/resend.ts`, `lib/inquiries/notification.ts`; **aktywne wyłącznie przy `MAIL_TRANSPORT=resend`**                                                                                                     | **brak potwierdzenia DPA** (I6); klucz jeszcze nieprzekazany (I22) | **brak danych** (I8). Treść wiadomości przechodzi przez infrastrukturę dostawcy i jest widoczna w jego panelu.               |
| **Hosting** — Vercel albo Netlify, **nierozstrzygnięte** | dane osobowe w tranzycie przez warstwę serwerową; potencjalnie w logach platformy                                                                                                                     | ADR-0006; wybór dostawcy odroczony (I24)                                                                                                                                                                      | **dostawca niewybrany**                                            | **brak danych** — zależy od wyboru i konfiguracji regionu funkcji                                                            |
| **Cloudflare (Turnstile)**                               | —                                                                                                                                                                                                     | **nie dotyczy**: weryfikacja Turnstile nie jest zaimplementowana. Istnieją wyłącznie trzy nieodczytywane zmienne środowiskowe (`TURNSTILE_ENABLED`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) | nie dotyczy                                                        | nie dotyczy                                                                                                                  |

**Procesorów poza tą tabelą nie ma.** W repozytorium nie ma telemetrii, zewnętrznych skryptów analitycznych, zewnętrznych fontów ani obrazów ładowanych z obcych domen — potwierdzone w bramkach E7 i E8.

---

## 2. Kopie danych osobowych poza bazą

Istotne dla procedury retencji, bo **`purge_expired_inquiries()` nie dosięga żadnej z nich** (E8 §3c):

| Gdzie                                                     | Co tam jest                                                         | Kto decyduje o retencji |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| Skrzynka odbiorcy powiadomień (`INQUIRY_NOTIFICATION_TO`) | pełne dane zgłaszającego i treść wiadomości, w każdym powiadomieniu | ISKT — pozycja **I11**  |
| Panel i logi Resend                                       | kopia treści wysłanych wiadomości u procesora                       | ISKT — pozycja **I12**  |

**Konsekwencja dla klauzuli:** dopóki te dwie pozycje nie mają przypisanej retencji, zdanie „przechowujemy dane 12 miesięcy" **nie jest prawdziwe na poziomie organizacji**, nawet jeśli funkcja retencyjna w bazie zostanie uruchomiona. Informacja podana osobie w klauzuli byłaby wtedy nieprawdziwa.

---

## 3. Dlaczego zestaw procesorów jest minimalny — i warto to utrzymać

Trzy działające warstwy antyspamowe (honeypot, podpisany token czasowy, limit częstości na pseudonimizowanym identyfikatorze) **nie dodają ani jednego procesora** i nie wysyłają niczego poza infrastrukturę ISKT. Włączenie Turnstile dodałoby Cloudflare jako procesora, z osadzanym skryptem zbierającym sygnały o przeglądarce użytkownika — co wymagałoby umowy powierzenia i aktualizacji klauzuli.

Bramka E8 oceniła wstrzymanie się jako **właściwą kolejność** i rekomendowała nie włączać Turnstile w MVP (pozycja **I9**).

Podobnie ochrona przed nadużyciem formularza nie opiera się na zapisie adresu IP: `form_submission_throttle` przechowuje wyłącznie `HMAC-SHA256(IP, FORM_THROTTLE_SALT)`, a w całym schemacie nie ma kolumny na adres IP ani User-Agenta.

> **Kwalifikacja prawna, której nie wolno zaokrąglić:** `client_hash` to **pseudonimizacja** (art. 4 pkt 5 RODO), **nie anonimizacja** (motyw 26). Przestrzeń adresów IPv4 jest w pełni przeliczalna, a sól żyje w środowisku tej samej aplikacji, która ma dostęp do bazy — ten sam podmiot posiada jednocześnie hasz i klucz. `client_hash` **pozostaje danymi osobowymi** i wlicza się do zakresu klauzuli oraz retencji. Zdanie „nie zapisujemy IP" jest prawdziwe; zdanie „nie da się zidentyfikować" byłoby nieprawdziwe.

---

## 4. Co ISKT musi uzupełnić w tym pliku

1. **Umowy powierzenia** (art. 28 RODO) z Supabase, Resend i wybranym dostawcą hostingu — kolumna „Stan umowy" (pozycja **I6**).
2. **Region przetwarzania** i odpowiedź, czy występuje transfer poza EOG oraz na jakiej podstawie (DPF / standardowe klauzule umowne) — dla Supabase (**I7**) i Resend (**I8**).
3. **Wybór dostawcy hostingu** i uzupełnienie trzeciego wiersza (**I24**).
4. **Decyzje o retencji dwóch kopii poza bazą** (**I11**, **I12**).
5. **Decyzja o Turnstile** — jeśli „włączyć", ten rejestr wymaga nowego wiersza, a klauzula aktualizacji (**I9**).

Po uzupełnieniu tabela z sekcji 1 jest gotowa do przeniesienia do klauzuli informacyjnej jako lista odbiorców i procesorów (pozycja **K6** raportu E8, wymóg art. 13 ust. 1 lit. e RODO).
