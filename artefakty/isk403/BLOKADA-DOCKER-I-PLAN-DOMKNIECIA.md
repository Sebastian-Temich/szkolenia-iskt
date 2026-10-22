# ISK-419 — blokada Dockera (przyczyna pierwotna) i plan domkniecia pomiarow

Przebieg 2026-10-22 ~22:20. Karta ISK-419 wymaga dzialajacego Dockera. Nie udalo
sie go uruchomic — ponizej **przyczyna pierwotna**, a nie samo „Docker nie
dziala”, zeby kolejny przebieg nie powtarzal tej samej diagnostyki.

## 1. Docker Desktop nie wstaje — awaria zasobnika (tray), nie brak sesji GUI

ISK-403 zapisala objaw jako „demon wylaczony, `open -a Docker` bez efektu”.
To nie jest pelny obraz: `open -a Docker` **konczy sie kodem 0 i naprawde
startuje backend**, ktory nastepnie sam sie zabija.

Lancuch awarii (`~/Library/Containers/com.docker.docker/Data/log/host/monitor.log`):

```
[20:22:05.435937Z][main.electron] Opening Electron: .../Docker Desktop.app/Contents/MacOS/Docker Desktop --reason=open-tray --analytics-enabled=true --name=dashboard
[20:22:05.445135Z][main]          backend cancelling with error: opening tray: starting electron: unmarshaling start request: unexpected EOF
[20:22:06.864999Z][main]          backend crashed, dumping error to file and reporting to user: opening tray: ...
.../com.docker.backend services: exit status 150
```

Electron ginie **9 ms** po uruchomieniu, czyli zanim zdazy sie zainicjowac.
Backend traktuje nieudane otwarcie zasobnika jako blad krytyczny, probuje pokazac
okno bledu (co tez sie nie udaje, bo to ten sam mechanizm Electrona) i konczy
`exit status 150`. Petla powtarza sie przy kazdej probie startu.

### Co zostalo wykluczone pomiarem

| Hipoteza | Pomiar | Wynik |
| --- | --- | --- |
| Brak sesji graficznej (headless) | `launchctl managername` -> `Aqua`; `who` -> `ST console Oct 22 17:21`; zywe `Finder`/`Dock` | **wykluczone** — sesja GUI dziala |
| Zly `DOCKER_HOST` / kontekst | `DOCKER_HOST` nieustawiony; kontekst `desktop-linux` -> `~/.docker/run/docker.sock` (poprawny) | **wykluczone** |
| Uszkodzony plik wykonywalny Electrona | uruchomiony bezposrednio: `Running Electron app (stock)` + `will delegate to Docker Desktop backends` | **wykluczone** — binarka dziala |
| Zajety port / kolidujacy stack | zero kontenerow, brak gniazda `docker.sock` | **nieistotne** — demon nie wstaje wcale |
| Zablokowany ekran | `ioreg ... CGSSessionScreenIsLocked` — klucz nieobecny | nierozstrzygniete |

Gniazdo `~/.docker/run/docker.sock` **nie istnieje**; katalog `~/.docker/run/`
jest tworzony przy kazdej probie startu i zostaje pusty. Uprzywilejowany pomocnik
`com.docker.vmnetd` dziala od 17:21, a symlink `/var/run/docker.sock` powstal
17:22 — czyli Docker **dzialal dzis po poludniu** (wtedy zmierzono stack z
`qa-env.sh`, kong 54341) i zepsul sie pozniej.

### Dzialanie odblokowujace (dla operatora)

Potrzebna jest interwencja na maszynie, ktorej agent nie moze wykonac:

1. Uruchomic Docker Desktop **z interfejsu** (Launchpad/Finder) i odkliknac
   ewentualne okno aktualizacji / regulaminu — awaria dotyczy zasobnika w pasku
   menu, wiec moze byc zablokowana oczekujacym okienkiem.
2. Jesli to nie pomoze — zrestartowac Docker Desktop albo system; w ostatecznosci
   przeinstalowac Docker Desktop.

> **Ostrzezenie przed reinstalacja.** Przeinstalowanie/„reset to factory
> defaults” **usuwa wolumeny**, a na tej maszynie stoja stacki Supabase innych
> przebiegow. Reinstalacja to decyzja operatora, nie czynnosc QA — dlatego ten
> przebieg jej **nie wykonal**.

## 2. Stan gotowosci zakresu ISK-419

| Zakres karty | Spec | Czego brakuje |
| --- | --- | --- |
| 1. Trzy widoki szczegolowe panelu @360/768/1440 | `tests/e2e/isk403-panel.spec.ts` — **gotowy** | tylko Docker |
| 2. Regresja funkcjonalna `--retries=0` | `tests/e2e/isk403-regresja.spec.ts` — **gotowy** | tylko Docker |
| 3. Trzy stany brzegowe | **brak specu** | projekt + Docker (ponizej) |

Punkt 1 ma w specu (commit `51ba009`) rozwiazana przyczyne wczesniejszego
padniecia: `zgloszenie testowe musi istniec -> undefined` **nie bylo brakiem
wiersza w bazie**, tylko wyscigiem o porzadki — `beforeAll`/`afterAll` sa
per-worker, nie per-plik, wiec przy `--workers=2` jeden worker usuwal zgloszenie
w trakcie pracy drugiego. Zasiew i sprzatanie siedza teraz w samym tescie.
Poprawka jest w kodzie, ale **nieuruchomiona** — potwierdzi ja dopiero przebieg.

## 3. Stany brzegowe (pkt 3) — projekt pomiaru i pulapka ISR

Trzy brakujace stany maja realne powierzchnie w produkcie:

| Stan | Powierzchnia | Jak wymusic |
| --- | --- | --- |
| brak trenerow | `app/(public)/trenerzy/page.tsx:33` (`Card.empty-state`) | `trainers.is_published = false` dla wszystkich |
| pusty stan wyroznionych | `app/(public)/home-sections.tsx:253` -> „Nie mamy teraz wyróżnionych szkoleń” | `trainings.is_featured = false` dla wszystkich |
| stan bledu | `app/error.tsx` -> „Nie udało się wczytać strony” | **nierozstrzygniete** (ponizej) |

### Pulapka: `revalidate = 300` unieważnia naiwny pomiar

**Sam zapis do bazy NIE wystarczy.** Oba widoki publiczne sa prerenderowane z ISR:

- `app/(public)/page.tsx:5` — `export const revalidate = 300`
- `app/(public)/trenerzy/page.tsx:8` — `export const revalidate = 300`

Po przelaczeniu flagi w bazie strona przez **do 5 minut** oddaje wersje z cache.
Pomiar zobaczylby pelna liste trenerow i pelna sekcje wyroznionych, zapisalby
„stanu pustego nie ma” i **przeszedlby na zielono** — czyli dokladnie klasa bledu
opisana w `KOREKTA-POMIARU.md`: falszywy wynik z narzedzia, nie z produktu.

Uniewaznienie cache robi wylacznie sciezka panelu —
`lib/panel/catalog-cache.ts:14-17` (`invalidatePublicCatalog`) wola
`revalidatePath("/")` i `revalidatePath("/trenerzy")`, a wywoluje ja
`refreshCatalog()` z `app/panel/(admin)/actions.ts:31`, czyli **dopiero zapis
z panelu**. Pomiar musi wiec albo przejsc przez panel, albo wymusic
uniewaznienie jednym zapisem panelowym po przelaczeniu flag w bazie.

Bezpieczny szkic (stack jest **wspoldzielony** z innymi przebiegami — przywrocenie
musi lezec w `finally`, a zapis panelowy nie moze dotykac danych produktowych):

1. zapamietac id-ki z `true`, przerwac jesli odczyt sie nie uda (przed zapisem),
2. przelaczyc flagi na `false` kluczem `service_role`,
3. wymusic uniewaznienie jednym zapisem panelowym — najlepiej na **wlasnym,
   nieopublikowanym** trenerze-jednorazowce (`Zapisz trenera`,
   `app/panel/(admin)/trenerzy/[id]/page.tsx:109`), zeby nie nadpisac cudzych danych,
4. zmierzyc widok na 360/768/1440,
5. w `finally` przywrocic zapamietane id-ki i **powtorzyc** uniewaznienie.

### `stan bledu` — otwarta decyzja projektowa

`app/error.tsx` to **kliencka** granica bledu: renderuje sie, gdy potomek rzuci
wyjatek w trakcie renderu. Nie ma na nia trasy ani przelacznika.

- Przerwanie zadania przez `page.route()` **nie zadziala**: dane czyta komponent
  serwerowy, a router Next po nieudanym pobraniu RSC robi twarde przejscie,
  zamiast pokazac `error.tsx`.
- Sciezka realna: **drugi serwer aplikacji** na innym porcie z `SUPABASE_URL`
  wskazujacym na zamkniety port — wtedy odczyt katalogu rzuca i granica bledu
  renderuje sie naprawde.

Tego **nie zaimplementowano w tym przebiegu swiadomie**: bez Dockera nie da sie
takiego harnessu ani raz uruchomic, a niesprawdzony harness pomiarowy to wlasnie
zrodlo falszywych defektow z `KOREKTA-POMIARU.md`. Decyzja o drugim serwerze
powinna zapasc przy dzialajacym Dockerze, razem z pierwszym uruchomieniem.

## 4. Komenda do uruchomienia, gdy Docker wroci

Stan stacku z `qa-env.sh` (kong 54341) po odzyskaniu Dockera jest **nieznany** —
tego nie da sie sprawdzic bez demona. Kontenery zwykle przezywaja restart Dockera
w stanie zatrzymanym (`docker ps -a`), ale reinstalacja/reset wolumenow usuwa je
razem z danymi. Dlatego **najpierw sprawdzic**, a nie zakladac:

```sh
docker ps -a --filter name=supabase    # czy kontenery istnieja i w jakim stanie
```

Podobnie port: `supabase status` w tym worktree pokazywal **obcy** projekt na
54321 (`rudnttcmdisetoqvirrs`, aplikacja billingowa). Port realnego stacku
nalezy potwierdzic (`supabase status -o env`) przed pomiarem, a nie zalozyc —
pomiar wpuszczony w obcy projekt to zarowno bezwartosciowy wynik, jak i zapis
do cudzych danych.

```sh
cd .worktrees/isk-403-qa
supabase start                       # potwierdzic porty: supabase status -o env
SUPABASE_DIR="$PWD" ./scripts/e2e-local.sh \
  tests/e2e/isk403-panel.spec.ts tests/e2e/isk403-regresja.spec.ts \
  --retries=0 --workers=1
```

`--workers=1` dla pewnosci przy pierwszym przebiegu po poprawce `51ba009`
(wyscig z pkt 2 ujawnial sie dopiero od dwoch workerow — przy jednym workerze
przejdzie, nawet gdyby poprawka byla niepelna; rownolegly przebieg trzeba
powtorzyc osobno, zeby ja faktycznie potwierdzic).

`scripts/e2e-local.sh` sam pobiera klucze z CLI i ustawia `FORM_*`. **Nie
sourcowac `qa-env.sh`** — plik nie definiuje `ANON_KEY`/`SERVICE_ROLE_KEY`
(odwoluje sie do nich, zakladajac, ze juz sa w srodowisku), wiec samodzielnie
daje puste klucze i testy padna na autoryzacji.
