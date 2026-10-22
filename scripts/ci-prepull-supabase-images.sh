#!/usr/bin/env bash
# Pobiera obrazy lokalnego stacku Supabase SZEREGOWO, z ponowieniem i zapasowym
# rejestrem — tak, zeby `supabase start` zastal je w cache i nie ciagnal niczego.
#
# Dlaczego to istnieje (ISK-420): Supabase CLI 2.109.1 ciagnie 13 obrazow rownolegle
# ("unbounded"), a kazde nieudane pobranie ponawia tylko raz ("download failed after
# attempts=1") i konczy blednym `failed to pull docker image from all registries`.
# ISK-398 przeniosla pull z `public.ecr.aws` na `ghcr.io`, bo ECR Public ma limit
# 1 pull/s na IP. 2026-10-22 ok. 20:10 UTC to samo zaczelo sie dziac na ghcr.io
# (`toomanyrequests: allowed: 44000/minute`) i bramki `database` oraz `e2e` padaly,
# zanim uruchomil sie jakikolwiek test.
#
# Pomiary z 2026-10-22 (ISK-420), ktore wyznaczyly ten kierunek:
#   - ghcr.io odrzuca ~20-40% POJEDYNCZYCH, szeregowych zapytan o manifest — takze
#     anonimowo z innego IP niz runnery, wiec to nie jest wylacznie ksztalt bursta;
#   - uwierzytelnienie tokenem nie pomaga (4/5 OK authed vs 3/5 OK anon);
#   - `retry-after` ma rzad mikrosekund, czyli ponowienie jest skuteczne od razu;
#   - public.ecr.aws odpowiedzial 200 na wszystkie 13 obrazow przy 1 zapytaniu/s.
#
# Stad trzy mechanizmy, ktorych nie mialo ISK-398:
#   1. SZEREGOWO — jeden `docker pull` naraz, zamiast 13 rownolegle;
#   2. PONOWIENIE z narastajacym odstepem — warstwy juz pobrane zostaja w cache,
#      wiec kolejna proba jest tania;
#   3. ZAPASOWY REJESTR — jesli ghcr.io nie wyda obrazu, bierzemy go z ECR Public
#      i przypinamy (`docker tag`) pod nazwa z ghcr.io, bo wlasnie tej nazwy szuka
#      CLI w lokalnym cache (SUPABASE_INTERNAL_IMAGE_REGISTRY).
#
# Skrypt KONCZY SIE BLEDEM, jesli po wszystkich probach brakuje choc jednego obrazu.
# To jest wlasciwa bramka: brak obrazu gwarantuje padniecie `supabase start`, a sam
# throttling (gdy ponowienie go nadrobilo) zostaje tylko ostrzezeniem — bramka ma
# padac od testow, nie od chwilowego drgniecia rejestru.
set -uo pipefail

REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-ghcr.io}"
# Kolejnosc zrodel. Trzy NIEZALEZNE pule limitow — pomiar z przebiegu 39852110159
# pokazal, ze dwie nie wystarczaja: ghcr.io odrzucal pull (`toomanyrequests`),
# a public.ecr.aws zglosil wyczerpanie limitu DANYCH (`Data limit exceeded`),
# wiec 5 obrazow nie zmiescilo sie w budzecie prob.
SOURCE_REGISTRIES="${SUPABASE_IMAGE_SOURCE_REGISTRIES:-${REGISTRY} public.ecr.aws docker.io}"
# Docker Hub hostuje pod `supabase/` tylko obrazy wydawane przez Supabase. Pozostale
# maja tam innego wlasciciela (`library/kong`, `axllent/mailpit`, `timberio/vector`,
# `darthsim/imgproxy`, `postgrest/postgrest`) i NIE podstawiamy ich: nie da sie teraz
# dowiesc, ze sa bajt w bajt tym, co mirroruje Supabase (ECR Public nie zwraca naglowka
# `Docker-Content-Digest`, wiec porownanie sum kontrolnych jest niewykonalne), a cicha
# podmiana obrazu w bramce jakosci byla by gorsza od jej czerwieni. Zmierzone:
# `docker.io/supabase/<nazwa>` istnieje dla pozostalych 10 z 14 (HTTP 200).
DOCKER_HUB_ABSENT="kong mailpit vector imgproxy postgrest"
ATTEMPTS="${SUPABASE_PREPULL_ATTEMPTS:-10}"
BASE_DELAY="${SUPABASE_PREPULL_BASE_DELAY:-3}"
MAX_DELAY="${SUPABASE_PREPULL_MAX_DELAY:-20}"
LOG="${SUPABASE_PREPULL_LOG:-supabase-prepull.log}"
EXPECTED_IMAGE_COUNT=14

# Obrazy, ktorych `supabase services` nie raportuje (nie sa "serwisami" projektu,
# ale CLI startuje je lokalnie). Przypiete do CLI 2.109.1 — wersja CLI jest przypieta
# w `ci.yml` (`supabase/setup-cli@v1` z `version:`), wiec zestaw obrazow jest staly.
#
# `kong` przeoczono w pierwszym podejsciu (przebieg 39850884343): 12 obrazow CLI
# zglosil jako „Skipped - Image is already present locally", a `kong` jako „Pulling"
# i wlasnie na nim padl start. Dlatego licznik „obrazy pobierane w trakcie startu"
# jest ponizej TWARDA bramka — zeby kolejne przeoczenie nie czekalo na chora chwile
# rejestru, zeby sie ujawnic.
AUXILIARY_IMAGES="
kong:2.8.1
mailpit:v1.30.2
vector:0.53.0-alpine
imgproxy:v3.8.0
"

# Reszta (10 obrazow) jest wyliczana z `supabase services`, zeby podbicie wersji CLI
# nie wymagalo edycji tego skryptu. Lista przypieta sluzy tylko jako awaryjna, gdy
# `supabase services` nie odpowie — wtedy i tak zglaszamy ostrzezenie.
PINNED_SERVICE_IMAGES="
postgres:17.6.1.143
gotrue:v2.192.0
postgrest:v14.14
realtime:v2.112.6
storage-api:v1.62.5
edge-runtime:v1.74.2
studio:2026.07.06-sha-66cf431
postgres-meta:v0.96.6
logflare:1.46.0
supavisor:2.9.7
"

throttled=0
retries=0
from_fallback=0
healthy_source=""
last_source=""
missing=""

: >"$LOG"

note() { printf '%s\n' "$*" >&2; }

# `supabase services` zwraca liste obrazow z wersjami, ale w dwoch kształtach:
# bez `-o` to obiekt {"services":[...]}, a z `-o json` gola tablica [...]. Rozgalezienie
# musi byc na `type`, nie przez `.services // .` — indeksowanie tablicy stringiem to w jq
# BLAD, ktorego `//` nie przechwytuje (to cicho wlaczalo liste awaryjna).
# Nazwa moze miec inny namespace niz `supabase/` (np. `postgrest/postgrest`), a przy
# nadpisanym rejestrze CLI szuka obrazu jako <rejestr>/supabase/<nazwa bazowa>
# — zmierzone na logu ISK-420.
discover_service_images() {
  supabase services -o json 2>/dev/null | jq -er '
    (if type == "object" then .services else . end)
    | map(select((.local // "") != "") | ((.name | split("/") | last) + ":" + .local))
    | .[]
  ' 2>/dev/null
}

service_images=$(discover_service_images)
if [[ -z "$service_images" ]]; then
  note "::warning title=Lista obrazow Supabase::\`supabase services\` nie zwrocilo listy obrazow — uzywam listy przypietej do CLI 2.109.1 (ISK-420)."
  service_images="$PINNED_SERVICE_IMAGES"
fi

IMAGES=$(printf '%s\n%s\n' "$service_images" "$AUXILIARY_IMAGES" | sed '/^[[:space:]]*$/d')
image_count=$(printf '%s\n' "$IMAGES" | wc -l | tr -d ' ')

if [[ "$image_count" -ne "$EXPECTED_IMAGE_COUNT" ]]; then
  note "::warning title=Zmiana zestawu obrazow Supabase::Do pobrania ${image_count} obrazow, oczekiwano ${EXPECTED_IMAGE_COUNT} — prawdopodobnie podbita wersja CLI. Sprawdz liste pomocnicza w scripts/ci-prepull-supabase-images.sh (ISK-420)."
fi

# Jedna proba pobrania konkretnej referencji; zwraca 0 przy sukcesie.
# Odmowy z limitu zliczamy z wyjscia `docker pull`, zeby raport opieral sie na
# pomiarze, a nie na domysle. Pelne wyjscie idzie do logu (artefakt diagnostyczny),
# do konsoli trafia tylko ostatnia linia nieudanej proby.
pull_once() {
  local ref="$1" out rc
  out=$(docker pull "$ref" 2>&1)
  rc=$?
  printf '=== %s (rc=%s)\n%s\n' "$ref" "$rc" "$out" >>"$LOG"
  if printf '%s' "$out" | grep -qiE 'toomanyrequests|rate exceeded|too many requests'; then
    throttled=$((throttled + 1))
  fi
  if [[ "$rc" -ne 0 ]]; then
    note "    ${ref} -> $(printf '%s' "$out" | tail -n 1)"
  fi
  return "$rc"
}

# Pobiera konkretna referencje i — jesli przyszla z innego zrodla niz rejestr docelowy
# — przypina ja pod nazwa z tego rejestru, bo wlasnie tej nazwy CLI szuka w cache.
try_ref() {
  local ref="$1" target="$2"
  pull_once "$ref" || return 1
  if [[ "$ref" != "$target" ]]; then
    docker tag "$ref" "$target" || return 1
    from_fallback=$((from_fallback + 1))
  fi
  # Gdy jedno zrodlo okazalo sie zdrowe, kolejne obrazy zaczynamy od niego — przy
  # globalnej awarii rejestru domyslnego (tak bylo 2026-10-22 na ghcr.io) nie ma sensu
  # placic nieudana proba i odstepem za kazdy nastepny obraz.
  healthy_source="${ref%/supabase/*}"
  last_source="$healthy_source"
  return 0
}

# Zrodla dla danego obrazu, w kolejnosci prob. Zdrowe zrodlo (jesli juz znane) idzie
# na poczatek; Docker Hub jest pomijany dla obrazow, ktorych Supabase tam nie wydaje.
sources_for() {
  local name="${1%%:*}" reg eligible="" skip
  for reg in $SOURCE_REGISTRIES; do
    skip=0
    if [[ "$reg" == "docker.io" ]]; then
      case " $DOCKER_HUB_ABSENT " in *" $name "*) skip=1 ;; esac
    fi
    [[ "$skip" -eq 1 ]] && continue
    eligible="${eligible} ${reg}"
  done
  # Zdrowe zrodlo tylko wtedy, gdy dla TEGO obrazu jest w ogole dopuszczalne — inaczej
  # obraz nieobecny na Docker Hubie poszedlby pytac wlasnie tam.
  if [[ -n "$healthy_source" ]] && [[ " $eligible " == *" $healthy_source "* ]]; then
    printf '%s' "$healthy_source"
    for reg in $eligible; do
      [[ "$reg" == "$healthy_source" ]] || printf ' %s' "$reg"
    done
    printf '\n'
  else
    printf '%s\n' "${eligible# }"
  fi
}

pull_image() {
  local name="$1"
  local target="${REGISTRY}/supabase/${name}"
  local attempt=1 delay sources reg index

  if docker image inspect "$target" >/dev/null 2>&1; then
    printf 'cache  %s\n' "$target"
    return 0
  fi

  sources=$(sources_for "$name")

  while [[ "$attempt" -le "$ATTEMPTS" ]]; do
    [[ "$attempt" -gt 1 ]] && retries=$((retries + 1))

    index=0
    for reg in $sources; do
      index=$((index + 1))
      # Na pierwszej probie pytamy tylko pierwsze zrodlo: przy zdrowym rejestrze nie
      # generujemy zbednego ruchu do pozostalych (ECR Public ma limit 1 pull/s na IP
      # i oddzielny limit danych). Od drugiej proby przechodzimy przez wszystkie.
      [[ "$attempt" -eq 1 && "$index" -gt 1 ]] && break
      if try_ref "${reg}/supabase/${name}" "$target"; then
        printf 'ok     %s (zrodlo %s, proba %s)\n' "$target" "$last_source" "$attempt"
        return 0
      fi
    done

    if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
      delay=$((BASE_DELAY * attempt))
      [[ "$delay" -gt "$MAX_DELAY" ]] && delay="$MAX_DELAY"
      note "    ponawiam ${name} za ${delay}s (proba $((attempt + 1))/${ATTEMPTS})"
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done

  printf 'BRAK   %s (zrodla: %s)\n' "$target" "$sources"
  return 1
}

while IFS= read -r image; do
  [[ -z "$image" ]] && continue
  pull_image "$image" || missing="${missing} ${image}"
done <<EOF
$IMAGES
EOF

present=$(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null |
  grep -cE "^${REGISTRY//./\\.}/supabase/" || true)

summary() {
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
  printf '%s\n' "$1"
}

# Raport celowo NIE zawiera doslownych ciagow `toomanyrequests` ani `rate exceeded`:
# kryterium odbioru brzmi „zero wystapien w logu przebiegu", wiec wlasny raport nie
# moze zasmiecac tego grepa swoimi trafieniami (zasada przeniesiona z ISK-398).
summary "### Pre-pull obrazow Supabase (ISK-420)"
summary "- rejestr docelowy: \`${REGISTRY}\`; zrodla w kolejnosci prob: \`${SOURCE_REGISTRIES}\`"
summary "- obrazy do pobrania: ${image_count} (oczekiwane: ${EXPECTED_IMAGE_COUNT})"
summary "- obrazy obecne jako \`${REGISTRY}/supabase/*\` po pre-pullu: ${present}"
summary "- pobrane z innego zrodla niz docelowe: ${from_fallback}"
summary "- ponowienia pobrania: ${retries} (budzet: ${ATTEMPTS} prob na obraz)"
summary "- trafienia limitu czestosci rejestru (nadrobione ponowieniem): ${throttled}"

if [[ "$throttled" -gt 0 ]]; then
  echo "::warning title=Limit czestosci pullow::${throttled} odpowiedzi z limitem w trakcie pre-pullu; ponowienia i kolejne zrodla je nadrobily (ISK-420)."
fi

if [[ -n "$missing" ]]; then
  summary "- wynik: BRAK obrazow —${missing}"
  echo "::error title=Brak obrazow Supabase::Po ${ATTEMPTS} probach na zrodlach \"${SOURCE_REGISTRIES}\" nie udalo sie pobrac:${missing}. \`supabase start\` nie ma z czego wystartowac (ISK-420)."
  exit 1
fi

summary "- wynik: wszystkie obrazy w lokalnym cache, \`supabase start\` nie bedzie nic ciagnal"
