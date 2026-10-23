# ISK-419 — wyniki domkniecia pomiarow (2026-10-23)

Docker przywrocony recznie przez operatora, wiec caly zakres karty (pkt 1–3)
zostal **zmierzony**. Ten dokument zastepuje sekcje 2 i 3
`BLOKADA-DOCKER-I-PLAN-DOMKNIECIA.md` (tamta zostaje jako zapis przyczyny
blokady).

**Tallies koncowe** (wszystkie na `--retries=0`, na budowie produkcyjnej,
powtorzone na CZYSTEJ bazie po odbudowie stacku):

| przebieg                                                   | wynik                     |
| ---------------------------------------------------------- | ------------------------- |
| pkt 1 + pkt 2 + cele dotykowe (rownolegle, 7 workerow)     | **18/18 passed**          |
| pkt 3 — stany brzegowe (`--workers=1`)                     | **3/3 passed** (17,5 min) |
| regresja ponownie, zaraz po pkt 3 (kontrola wycieku cache) | **10/10 passed**          |

**Defektow produktu: 0.** Defektow harnessu pomiarowego znalezionych i
naprawionych: **7** (sekcja 2) + 1 wyciek cache ISR we wlasnym specu (sekcja 5).
Jedno znalezisko dotyczace produktu jest nieblokujace i opisane w sekcji 5
(zmiana danych poza panelem nie odswieza stron publicznych).

## 0. Na czym mierzono — i dlaczego to nie jest oczywiste

| Parametr       | Wartosc                                           | Dlaczego tak                                                                                                                                                                                 |
| -------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stack Supabase | kong **54341**, db **54342**                      | kontenery przezyly awarie Dockera (`docker ps -a`), ale w trakcie prac stack padl i zostal odbudowany — patrz „Incydent" w sekcji 6; wyniki koncowe pochodza z przebiegu po odbudowie        |
| tryb aplikacji | **budowa produkcyjna** (`PLAYWRIGHT_USE_BUILD=1`) | `next dev` wstrzykuje wlasna nakladke `role="alert"`, ktora zaklamuje axe; ISK-403 mierzyla na budowie (cytuje `.next/static/css/62450834853625fa.css` — hash powstaje tylko w `next build`) |
| ponowienia     | `--retries=0`                                     | wymog pkt 2 karty                                                                                                                                                                            |
| runner         | `./qa-run.sh`                                     | patrz nizej                                                                                                                                                                                  |

### Pulapka portu — potwierdzona pomiarem

`supabase status -o env` w tym worktree zwraca `API_URL=127.0.0.1:54321`, czyli
porty z `config.toml` — a **nie** te, na ktorych stoi stack. Na 54321 stoi OBCY
projekt (`rudnttcmdisetoqvirrs`). Oba porty odpowiadaja **HTTP 200**, wiec zwykly
probe ich nie rozrozni:

| port         | `GET /rest/v1/trainings`                                |
| ------------ | ------------------------------------------------------- |
| 54341 (nasz) | `[{"slug":"wprowadzenie-do-ai", ...}]`                  |
| 54321 (obcy) | `PGRST205: Could not find the table 'public.trainings'` |

`scripts/e2e-local.sh` robi `eval "$(supabase status -o env)"`, wiec **wycelowalby
caly zestaw — razem z zapisami kluczem `service_role` — w cudzy projekt**.
Dlatego powstal `qa-run.sh`: bierze z CLI wylacznie klucze, adresy nadpisuje
z `qa-env.sh`, a przed pomiarem stawia **bramke tozsamosci** (asercja pozytywna
„jest nasza tabela z danymi demo" + negatywna „to nie projekt billingowy").

Uwaga na `qa-env.sh`: plik **nie definiuje** `ANON_KEY`/`SERVICE_ROLE_KEY` — tylko
sie do nich odwoluje. Samo `source qa-env.sh` daje puste klucze i przebieg pada
na autoryzacji.

## 1. Trzy widoki szczegolowe panelu — ZMIERZONE

`tests/e2e/isk403-panel.spec.ts` — **7/7 passed**, `--retries=0`.
Artefakty: 4 widoki x 3 szerokosci = 12 zrzutow + 12 plikow pomiarowych.

| widok                                     | axe | h1  | przeskoki | poza viewportem |
| ----------------------------------------- | --- | --- | --------- | --------------- |
| `panel-zgloszenie-szczegol` @360/768/1440 | 0   | 1   | 0         | 0               |
| `panel-szkolenie-edycja` @360/768/1440    | 0   | 1   | 0         | 0               |
| `panel-trener-edycja` @360/768/1440       | 0   | 1   | 0         | 0               |
| `panel-szkolenie-nowe` @360/768/1440      | 0   | 1   | 0         | 0               |

Pomiar nie jest pusty — `h1` to realne dane (`ISK403-QA Szczegol …`,
`[DEMO] Wprowadzenie do AI`, `[DEMO] Jan Przykladowy`), a widok zgloszenia ma
sekcje `Dane kontaktowe` / `Powiadomienie e-mail` / `Treść zgłoszenia`. Zadna
z tych tras nie zdegradowala sie do 404 ani do przekierowania na logowanie.

### Przyczyna wczesniejszego padniecia — BYLA INNA, NIZ ZAPISANO

Karta mowila „padl na zasiewie (`undefined`, czyli brak wiersza)", a sam spec
tlumaczyl to wyscigiem `afterAll` per-worker. **Oba wyjasnienia byly bledne.**
Zasiew lamal DWA CHECK-i tabeli `inquiries` naraz, a Postgres raportuje tylko
pierwszy — poprawienie jednego odslanialo drugi:

1. `inquiries_has_subject` — wymaga `training_id` **albo** niepustego
   `interest_area`; wstawka nie dawala zadnego,
2. `inquiries_kind_check` — dopuszcza tylko `osoba`/`firma`, a wstawka uzywala
   nieistniejacego `indywidualne`.

Wzor poprawnej wstawki byl w repo caly czas: `tests/e2e/helpers/data.ts`
(`createInquiry`) ma nawet komentarz o tym CHECK-u. Zasiew wiaze teraz zgloszenie
z realnym szkoleniem, wiec widok szczegolu renderuje swoja pelna forme.

## 2. Regresja funkcjonalna lokalnie, `--retries=0` — ZMIERZONA

`tests/e2e/isk403-regresja.spec.ts` — **10/10 passed**, `--retries=0`,
**7 workerow** (rownolegle, czyli sciezki wyscigowe sa realnie wystawione).
Zakres: katalog, filtr obszaru, wyszukiwanie z diakrytykami, szczegol szkolenia,
trenerzy, formularz z walidacja i bramka RODO, panel (status, notatka, szczegol).

To zastepuje posredni dowod z ISK-403 (zielone CI na `fc2bf3d` przy `retries: 2`).

### Zero defektow produktu — ale SIEDEM defektow harnessu

Zaden z pieciu poczatkowych bledow nie byl defektem produktu. Po kolei:

| #   | Objaw                                | Prawdziwa przyczyna                                                                                               |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `inquiries_has_subject`              | brak `training_id`/`interest_area` w zasiewie (pkt 1 i regresja)                                                  |
| 2   | `inquiries_kind_check`               | `kind: "indywidualne"` — wartosc nie istnieje w CHECK-u                                                           |
| 3   | „lista panelu pusta, brak `<table>`" | `afterAll` per-worker usuwal `like 'ISK403-REG%'`, czyli wiersz zywy w innym procesie                             |
| 4   | `strict mode violation`              | selektor `"main, body"` pasuje do DWOCH elementow                                                                 |
| 5   | **`admin_note` = `null`**            | `toHaveValue(notatka)` bylo spelnione przez samo `fill()` — asercja PUSTA, odczyt z bazy wyprzedzal Server Action |
| 6   | (ukryte) `body` zawiera „W toku"     | napis jest na przycisku `Ustaw: W toku` **przed** akcja — asercja pusta                                           |
| 7   | `/Zrównoważony/` nie pasuje          | zasiew demo jest w ASCII (`[DEMO] Zrownowazony rozwoj…`)                                                          |

Najwazniejszy jest **#5**: wygladal jak „panel nie zapisuje notatki wewnetrznej",
czyli defekt funkcjonalny swiezo dodanego UI (ISK-402). Po zamianie oczekiwania
na flash po zapisie (`.panel-flash`, wzor z `panel-wzorzec.spec.ts`) `admin_note`
zapisuje sie poprawnie. Produkt byl w porzadku; pomiar nie.

**#7 tez nie byl defektem wyszukiwania** — `toHaveCount(1)` w linii wyzej
przechodzilo, czyli fraza Z diakrytykami poprawnie znalazla rekord BEZ nich
(`unaccent` dziala). Padala wylacznie asercja na tresci karty. Asercja jest teraz
odporna na forme zapisu i dodatkowo sprawdza `href`, zeby trafienie bylo TYM
rekordem, a nie dowolna jedna karta.

## 3. Trzy stany brzegowe — ZMIERZONE

`tests/e2e/isk419-brzegowe.spec.ts` (nowy) — **3/3 passed**, `--workers=1`.
Artefakty: 3 stany x 3 szerokosci = 9 zrzutow + 9 plikow pomiarowych.

| stan                       | h1                                            | axe | poza viewportem |
| -------------------------- | --------------------------------------------- | --- | --------------- |
| `trenerzy-brak`            | `Ekspertki i eksperci, którzy Cię poprowadzą` | 0   | 0               |
| `landing-bez-wyroznionych` | `Rozwijaj kompetencje przyszłości.`           | 0   | 1 (patrz nizej) |
| `stan-bledu`               | `Nie udało się wczytać strony`                | 0   | 0               |

Element poza viewportem na „/" @1440 to `span.home-hero-glow-b` — geometria
**identyczna** z pomiarem bazowym ISK-403 (`right 1600 / width 480 / left 1120 /
naddatek 160`), czyli znana i rozliczona w `KOREKTA-POMIARU.md` §3 ozdoba
(`overflow: hidden`, `pointer-events: none`). Nie jest to nowe znalezisko.

### Jak wywolano stan bledu (i czego NIE dalo sie uzyc)

`app/error.tsx` to kliencka granica bledu bez trasy i przelacznika.

- **Niepoprawny UUID w trasach panelu NIE wywoluje granicy.** Sonda pokazala, ze
  `/panel/{zgloszenia,szkolenia,trenerzy}/nie-jest-uuid` daja uczciwe **404**
  („Nie znaleźliśmy tej strony"). To dobre zachowanie produktu — i powod, dla
  ktorego tamta sciezka nie nadaje sie do pomiaru.
- **Podmiana adresu Supabase w env NIE dziala**: `lib/public-catalog.ts:77` czyta
  `NEXT_PUBLIC_SUPABASE_URL`, a `NEXT_PUBLIC_*` jest **wkompilowane w bundel**
  (ostrzega o tym `lib/env.ts:114`). Potrzebna byla osobna budowa — czyli to, co
  wczoraj zaplanowalem jako „drugi serwer", okazalo sie zbedne.
- **Co zadzialalo:** odebranie roli `anon` prawa `SELECT` na `public.trainings`.
  `getCatalog()` rzuca na bledzie zapytania (`lib/public-catalog.ts:166`), a
  `/szkolenia` czyta `searchParams`, wiec renderuje sie na zadanie i ISR jej nie
  zaslania. Zmiana jest **runtime i w pelni odwracalna**, nie wymaga przebudowy.

Log serwera potwierdza, ze granica zadziala­la z prawdziwego bledu, a nie z atrapy:
`⨯ Error: Nie udało się pobrać katalogu szkoleń.` Granica daje tez wyjscie
(`Spróbuj ponownie`), co test sprawdza osobno.

**Obserwacja (nieblokujaca):** `stan-bledu` ma landmarki `["main"]` — bez
naglowka, nawigacji i stopki. Jest to swiadome i udokumentowane w `app/error.tsx`
(granica renderuje sie w miejscu `app/layout.tsx`), ale praktycznie oznacza, ze
jedynym wyjsciem ze strony bledu jest `reset()`; nie ma linku do strony glownej
ani do katalogu.

## 4. Cele dotykowe 18x18 — ARTEFAKT POMIARU, nie defekt

Pliki `pomiary/panel-szkolenie-*.json` raportuja 5 celow **18x18 px**
(`input#training-funding`, `#training-featured`, 3x `#training-trainer-*`), czyli
pod progiem 24x24 z WCAG 2.2 SC 2.5.8. Skan axe tego nie widzi, bo zbieracz
uzywa tagow `wcag2a/2aa/21a/21aa`, a 2.5.8 jest dopiero w 2.2 — wiec „axe = 0"
samo z siebie nie rozstrzyga.

Rozstrzygnal osobny pomiar (`tests/e2e/isk419-cele-dotykowe.spec.ts`):
`components/ui/field.tsx:239` owija `input` w `<label htmlFor>` razem z tekstem,
wiec **celem jest caly rzad**, a nie kwadrat kontrolki:

| element               | `input` | `label` (realny cel) |
| --------------------- | ------- | -------------------- |
| `#training-featured`  | 18x18   | **ok. 328x44**       |
| `#training-trainer-*` | 18x18   | **178x44**           |

Krotszy bok celu to **44 px >= 24 px**. Dodatkowo test **falsyfikuje** wniosek:
klikniecie w sam TEKST (poza kwadratem) przestawia stan kontrolki — gdyby label
nie byl celem, liczby wyzej nie znaczylyby nic.

**Wniosek: nie ma defektu 2.5.8. Pola `maleCele` dla pol wyboru sa nadmiarowe**
(helper mierzy `input`, nie cel) — to ta sama klasa artefaktu co honeypot
rozliczony w `KOREKTA-POMIARU.md` §2. Pozostaly wpis
(`a.panel-inline-link`, 399.9x20) to link w tekscie; przy 360 px zawija sie i ma
0 trafien, czyli wysokosc 20 px dotyczy jednej linii — podlega wyjatkowi
„inline" z 2.5.8.

## 5. Znalezisko produktowe: zmiana danych NIE odswieza stron publicznych

To jedyne znalezisko dotyczace produktu, a nie harnessu — i wyszlo z pomiaru,
nie z lektury kodu.

`/` i `/trenerzy` maja `revalidate = 300`. Po przelaczeniu `is_published` /
`is_featured` **w bazie** strony oddaja wersje z cache; w pomiarze stan pusty
pojawial sie dopiero po **kilku minutach**. Pierwsze podejscie z limitem ~20 s
zachowywalo sie pozornie losowo: udawalo sie, gdy wpis ISR byl juz przedawniony,
i padalo zaraz po tym, jak poprzedni przebieg odswiezyl go na nowo.

Konsekwencje praktyczne:

1. **Dla pomiarow.** Naiwny pomiar stanu pustego (zapis do bazy + zrzut)
   zobaczylby pelna liste, zapisal „stanu pustego nie ma" i **przeszedl na
   zielono**. Spec przeczekuje wiec okno `revalidate`, a asercja na stanie pustym
   jest WARUNKIEM pomiaru.
2. **Dla zespolu.** Uniewaznienie robi wylacznie zapis z panelu
   (`invalidatePublicCatalog`, `lib/panel/catalog-cache.ts:14-17`). Zmiana danych
   inna droga (SQL, seed, migracja, import) **nie bedzie widoczna na stronie do
   5 minut** i nic o tym nie uprzedza.
3. **Cache wycieka miedzy przebiegami.** Pomiar stanu pustego zatrul wpis ISR dla
   `/trenerzy`: w nastepnym przebiegu `isk403-regresja.spec.ts` („lista trenerow
   pokazuje tylko opublikowanych") **padl mimo poprawnych danych**, bo
   `next start` trzyma cache ISR na dysku (`.next/cache`) i przezywa on restart
   serwera. Spec wymusza teraz odswiezenie wpisu po przywroceniu danych.

## 6. Higiena wspoldzielonego stacku

Kazdy test stanow brzegowych zmienia stan GLOBALNY (wszyscy trenerzy, wszystkie
wyroznione, prawo `SELECT` roli `anon`), dlatego plik ma `mode: "serial"` i musi
chodzic z `--workers=1`, osobno od pozostalych specow. Przywrocenie lezy
w `finally` i obejmuje **tylko te id-ki, ktore byly wlaczone przed pomiarem**
(snapshot), a nie „wszystko na `true`".

Stan po przebiegu zweryfikowany osobno:

```
trenerzy_opublikowani=2   wyroznione=1   anon_select_trainings=1
anon GET /rest/v1/trainings -> [{"slug":"zrownowazony-rozwoj-esg"}, …]
```

### Incydent: stack szkolenia-iskt zostal zniszczony w trakcie prac

W trakcie dlugiego przebiegu stanow brzegowych kontener `supabase_db_szkolenia-iskt`
zostal **przeladowany i wyczyszczony** (swieze `initdb` — zero tabel) i stracil
przypisanie portu na hoscie (`5432/tcp` bez mapowania), a `kong` zaczal zwracac
**503**. Towarzyszyly temu `realtime` w petli restartow i `analytics` jako
`unhealthy`. Na maszynie stalo wtedy **7 stackow** (`docker ps` — 35 kontenerow),
wiec najblizsza przyczyna to wyczerpanie zasobow VM Dockera, a nie zmiana w repo.

**To uniewaznilo tylko mozliwosc POWTORZENIA pomiaru, nie same pomiary** —
artefakty z pkt 1–3 powstaly wczesniej, na stacku z potwierdzona tozsamoscia.
Po odbudowie wszystkie przebiegi powtorzono od zera na **czystej bazie**
(18/18 i 3/3), czyli wyniki sa reprodukowalne, a nie zalezne od stanu danych.

Odbudowa: `supabase stop --project-id szkolenia-iskt` + `supabase start`

- `supabase db reset` (migracje + seed). `supabase start` wymagal tymczasowego
  przestawienia portow w `config.toml` na 543**4**x, bo domyslne 54321/54322/54327
  sa zajete przez obcy projekt. **`config.toml` zostal przywrocony do stanu
  z repozytorium** — ta zmiana nie jest czescia dostawy, bo kolizja portow jest
  wlasciwoscia TEJ maszyny, nie repozytorium (w CI 54321 jest wolne).

Konsekwencja do swiadomego przyjecia: stack dziala teraz na 54341, a `config.toml`
mowi 54321, wiec **pulapka z sekcji 0 wraca** przy kolejnym `supabase stop/start`
z tego worktree. `qa-run.sh` jest na nia odporny (bierze z CLI tylko klucze),
ale `scripts/e2e-local.sh` nadal **nie jest**.

## 7. Jak powtorzyc

```sh
cd .worktrees/isk-403-qa
docker ps -a --filter name=supabase          # potwierdz, ze stack stoi
./qa-run.sh tests/e2e/isk403-panel.spec.ts \
            tests/e2e/isk403-regresja.spec.ts \
            tests/e2e/isk419-cele-dotykowe.spec.ts --retries=0
./qa-run.sh tests/e2e/isk419-brzegowe.spec.ts --retries=0 --workers=1
```

Drugi przebieg jest DLUGI (przeczekuje okno `revalidate` dwa razy na test).
`--workers=1` nie jest tu ostroznoscia, tylko warunkiem poprawnosci.
