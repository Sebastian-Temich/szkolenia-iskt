# ISK-403 / ISK-419 — material dowodowy odbioru V1

Komplet zrzutow i pomiarow, na ktory powoluje sie raport odbioru ISK-408.
Utrwalony na `origin` w ramach ISK-428 — wczesniej 48 ze 150 plikow lezalo
w worktree jako pliki niesledzone i zniknelyby przy pierwszym `git clean`.

## 1. NAJPIERW przeczytaj korekte

**[`KOREKTA-POMIARU.md`](KOREKTA-POMIARU.md) uniewaznia czesc liczb w tym
katalogu.** Autor pomiaru wycofal je sam, po wykryciu bledu w helperze.
Nie cytuj ponizszych pol bez tej korekty:

| Co | Gdzie | Status |
| --- | --- | --- |
| `maPierscien: false` + `kolorPierscienia: "<brak>"` | `pomiary/focus-*.json` (17 rekordow) | **UNIEWAZNIONE** — artefakt pomiaru, nie defekt. Helper czytal `getComputedStyle` w tej samej ramce, w ktorej padl `Tab`, wiec lapal pierwsza klatke 130 ms przejscia `box-shadow`. |
| `input#company_website` na liscie `maleCele` | `pomiary/*.json` (66 z 71 plikow ma pole `maleCele`) | **CZESCIOWO UNIEWAZNIONE** — ta jedna pozycja to honeypot z ADR-0004 (`aria-hidden`, `tabindex="-1"`, poza ekranem), nie cel dotykowy. Pozostale pozycje listy sa prawdziwe. |
| `span.home-hero-glow-b` poza viewportem @1440 | pomiary landingu | **UNIEWAZNIONE** — geometria identyczna ze wzorcem, `overflow: hidden` + `pointer-events: none`, nie powoduje przewijania. |

Co **pozostaje wazne**: kontrast pierscienia focusu **1.45–2.11 : 1**
potwierdzony niezaleznie na skompilowanym CSS — to prawdziwy bloker
(dalszy ciag w ISK-418).

## 2. Zawartosc

| Katalog | Plikow | Co to jest |
| --- | ---: | --- |
| `zrzuty/` | 66 PNG | Widoki publiczne i panel w 360 / 768 / 1440 px, razem ze stanami brzegowymi (brak wynikow, 404, brak dostepu, stan bledu). |
| `pomiary/` | 71 JSON | Pomiary geometrii, typografii, kontrastu i celow dotykowych per widok. |
| `wzorzec/` | 3 PNG + 3 JSON | Rendery i pomiary zatwierdzonego wzorca — strona odniesienia dla porownan. |
| `arkusze/` | 4 PNG | Arkusze zbiorcze: widoki publiczne, panel, stany brzegowe, porownanie landing wzorzec/produkt. |

Pozostale opracowania: [`WYNIKI-ISK419.md`](WYNIKI-ISK419.md) (domkniecie
pomiarow panelu i regresji), [`BLOKADA-DOCKER-I-PLAN-DOMKNIECIA.md`](BLOKADA-DOCKER-I-PLAN-DOMKNIECIA.md)
(przyczyna pierwotna blokady Dockera).

## 3. Dane sa syntetyczne

Zrzuty pochodza z lokalnego stacku na danych zasiewowych. Adresy w domenie
rezerwowej `@example.invalid`, telefony `+48 600 000 xxx`, tematy zgloszen
z prefiksem `[DEMO]`, formularz logowania pusty. Repozytorium jest publiczne —
przed publikacja przeskanowano artefakty pod katem sekretow i danych
osobowych; zadnych nie znaleziono.

## 4. Jak odtworzyc

Ten konkretny komplet produkuja specyfikacje `tests/e2e/isk403-*.spec.ts`
(`isk403-pomiar`, `isk403-panel`, `isk403-focus`, `isk403-regresja`).
**Istnieja wylacznie na tej galezi — nie ma ich na `main`.** Nie sa
bramkowane `EVIDENCE_DIR`; zapisuja bezwarunkowo do `artefakty/isk403`
(`tests/e2e/helpers/isk403-zbieracz.ts`, stala `KATALOG`). Szerokosci: 360 /
768 / **1440** px.

```bash
# wymaga lokalnego stacku Supabase (patrz BLOKADA-DOCKER-I-PLAN-DOMKNIECIA.md)
PLAYWRIGHT_USE_BUILD=1 npm run test:e2e -- --project=chromium tests/e2e/isk403-
```

Dlatego wraz z artefaktami utrwalono na `origin` takze ich generatory — bez
nich komplet bylby nieodtwarzalny nawet przy zachowanych plikach.

### Osobno: dowody produkowane przez CI

Przeplyw `.github/workflows/dowody.yml` (ISK-428) odbramkowuje `EVIDENCE_DIR`
dla `visual-evidence.spec.ts` i `panel-wzorzec.spec.ts` na `main` i wgrywa
wynik `if: always()` z retencja 90 dni.

**To NIE jest regeneracja powyzszego kompletu**, tylko niezalezny zestaw:
inne specyfikacje, inne nazwy plikow i szerokosci 360 / 768 / **1280** px.
Jego sens jest taki, ze kolejny odbior ma zrodlo dowodow niezalezne od
jednej lokalnej maszyny. Zrownanie obu zestawow (przeniesienie `isk403-*`
na `main`) nie bylo w zakresie ISK-428.
