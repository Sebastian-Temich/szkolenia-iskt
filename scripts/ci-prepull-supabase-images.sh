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
FALLBACK_REGISTRY="${SUPABASE_FALLBACK_IMAGE_REGISTRY:-public.ecr.aws}"
ATTEMPTS="${SUPABASE_PREPULL_ATTEMPTS:-5}"
BASE_DELAY="${SUPABASE_PREPULL_BASE_DELAY:-3}"
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
prefer_fallback=0
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

# Pobiera konkretna referencje i — jesli przyszla z rejestru zapasowego — przypina ja
# pod nazwa z rejestru podstawowego, bo wlasnie tej nazwy CLI szuka w lokalnym cache.
try_ref() {
  local ref="$1" primary="$2"
  pull_once "$ref" || return 1
  if [[ "$ref" != "$primary" ]]; then
    docker tag "$ref" "$primary" || return 1
    from_fallback=$((from_fallback + 1))
    # Gdy rejestr podstawowy jest niesprawny globalnie (tak bylo 2026-10-22 na ghcr.io),
    # nie ma sensu placic za kazdy kolejny obraz nieudana proba i odstepem — od tej pory
    # zaczynamy od rejestru zapasowego.
    prefer_fallback=1
    last_source="$FALLBACK_REGISTRY"
  else
    last_source="$REGISTRY"
  fi
  return 0
}

pull_image() {
  local name="$1"
  local primary="${REGISTRY}/supabase/${name}"
  local fallback="${FALLBACK_REGISTRY}/supabase/${name}"
  local first second attempt=1 delay

  if docker image inspect "$primary" >/dev/null 2>&1; then
    printf 'cache  %s\n' "$primary"
    return 0
  fi

  if [[ "$prefer_fallback" -eq 1 ]]; then
    first="$fallback"
    second="$primary"
  else
    first="$primary"
    second="$fallback"
  fi

  while [[ "$attempt" -le "$ATTEMPTS" ]]; do
    [[ "$attempt" -gt 1 ]] && retries=$((retries + 1))

    if try_ref "$first" "$primary"; then
      printf 'ok     %s (zrodlo %s, proba %s)\n' "$primary" "$last_source" "$attempt"
      return 0
    fi

    # Drugi rejestr dopiero od drugiej proby: przy zdrowym rejestrze podstawowym nie
    # generujemy ruchu do ECR Public, ktory ma znacznie ostrzejszy limit (1 pull/s na IP).
    # Wyjatek: gdy juz wiemy, ze podstawowy nie dziala, sprawdzamy oba od razu.
    if [[ "$first" != "$second" ]] &&
      { [[ "$attempt" -gt 1 ]] || [[ "$prefer_fallback" -eq 1 ]]; } &&
      try_ref "$second" "$primary"; then
      printf 'ok     %s (zrodlo %s, proba %s)\n' "$primary" "$last_source" "$attempt"
      return 0
    fi

    if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
      delay=$((BASE_DELAY * attempt))
      note "    ponawiam ${name} za ${delay}s (proba $((attempt + 1))/${ATTEMPTS})"
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done

  printf 'BRAK   %s\n' "$primary"
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
summary "- rejestr podstawowy: \`${REGISTRY}\`, zapasowy: \`${FALLBACK_REGISTRY}\`"
summary "- obrazy do pobrania: ${image_count} (oczekiwane: ${EXPECTED_IMAGE_COUNT})"
summary "- obrazy obecne jako \`${REGISTRY}/supabase/*\` po pre-pullu: ${present}"
summary "- pobrane z rejestru zapasowego: ${from_fallback}"
summary "- ponowienia pobrania: ${retries}"
summary "- trafienia limitu czestosci rejestru (nadrobione ponowieniem): ${throttled}"

if [[ "$throttled" -gt 0 ]]; then
  echo "::warning title=Limit czestosci pullow::${throttled} odpowiedzi z limitem w trakcie pre-pullu; ponowienia i rejestr zapasowy je nadrobily (ISK-420)."
fi

if [[ -n "$missing" ]]; then
  summary "- wynik: BRAK obrazow —${missing}"
  echo "::error title=Brak obrazow Supabase::Po ${ATTEMPTS} probach na dwoch rejestrach nie udalo sie pobrac:${missing}. \`supabase start\` nie ma z czego wystartowac (ISK-420)."
  exit 1
fi

summary "- wynik: wszystkie obrazy w lokalnym cache, \`supabase start\` nie bedzie nic ciagnal"
