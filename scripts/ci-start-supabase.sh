#!/usr/bin/env bash
# Startuje lokalny stack Supabase w CI i raportuje, z jakiego rejestru przyszly obrazy.
#
# Dlaczego to istnieje (ISK-398): Supabase CLI 2.109.1 ciagnie 13 obrazow rownolegle
# (concurrency "unbounded"). Domyslnym rejestrem jest `public.ecr.aws`, a anonimowy
# pull z ECR Public ma limit 1 pull/s na adres IP — runnery GitHuba dziela adresy,
# wiec taka rownoczesna paczka pullow dostaje `toomanyrequests: Rate exceeded`.
# Na merge commicie b9b0e8a bylo 43 takich bledow (4x database, 39x e2e), a bramka
# byla zielona tylko dlatego, ze CLI ponawia pull i schodzi na kolejny rejestr.
#
# Naprawa jest w `ci.yml`: `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io` plus `docker login`
# do ghcr.io tokenem `GITHUB_TOKEN`. Ten skrypt dodaje do tego pomiar, zeby regresja
# nie byla znowu niewidoczna: liczy wystapienia limitu i pokazuje faktyczne rejestry
# obrazow po starcie. Celowo NIE przerywa przebiegu z powodu samego limitu — bramka
# ma padac od testow, nie od chwilowego throttlingu rejestru (to byloby dokladnie to
# ryzyko dostawy, ktore ta karta usuwa). Sygnal idzie przez `::warning::` i podsumowanie.
#
# ISK-420: samo przeniesienie rejestru nie wystarczylo — 2026-10-22 ok. 20:10 UTC to
# ghcr.io zaczelo odrzucac pull (`toomanyrequests: allowed: 44000/minute`) i `supabase
# start` padal z kodem 1, bo 8 z 13 obrazow nie zostalo pobranych. Obrazy pobiera teraz
# `scripts/ci-prepull-supabase-images.sh` — szeregowo, z ponowieniem i rejestrem
# zapasowym — a `supabase start` powinien zastac je w cache. Dlatego ten skrypt mierzy
# RUCH DO REJESTRU W TRAKCIE STARTU: przy cieplym cache oczekiwana wartosc to zero.
set -uo pipefail

LOG="${SUPABASE_START_LOG:-supabase-start.log}"
EXPECTED_REGISTRY="ghcr.io"
EXPECTED_IMAGE_COUNT=14

docker_supabase_images() {
  docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | sort -u || true
}

cached_before=$(docker_supabase_images | grep -c '^ghcr\.io/supabase/' || true)

summary() {
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
  printf '%s\n' "$1"
}

if [[ "${SUPABASE_INTERNAL_IMAGE_REGISTRY:-}" != "$EXPECTED_REGISTRY" ]]; then
  echo "::warning title=Rejestr obrazow Supabase::SUPABASE_INTERNAL_IMAGE_REGISTRY=\"${SUPABASE_INTERNAL_IMAGE_REGISTRY:-<brak>}\", oczekiwano \"${EXPECTED_REGISTRY}\" — pull pojdzie anonimowo do ECR Public (ISK-398)."
fi

# Pre-pull jest krokiem poprzedzajacym w `ci.yml`. Jesli ktos go usunie, start znowu
# bedzie ciagnal 13 obrazow rownolegle — wtedy od razu widac, skad awaria (ISK-420).
if [[ "$cached_before" -lt "$EXPECTED_IMAGE_COUNT" ]]; then
  echo "::warning title=Zimny cache obrazow::Przed startem w cache jest ${cached_before} z ${EXPECTED_IMAGE_COUNT} obrazow \`ghcr.io/supabase/*\` — start pobierze brakujace rownolegle i moze dostac odmowe z limitu. Sprawdz krok pre-pullu (ISK-420)."
fi

supabase start 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}

throttled=$(grep -ciE 'toomanyrequests|rate exceeded' "$LOG" || true)
ecr_in_log=$(grep -c 'public\.ecr\.aws' "$LOG" || true)
from_ghcr=$(docker_supabase_images | grep -c '^ghcr\.io/supabase/' || true)

# Czy start sam cokolwiek pobieral? CLI wypisuje `<serwis> Pulling` (vs
# `<serwis> Skipped - Image is already present locally`); linie warstw koncza sie
# na `Pulling fs layer`, wiec zakotwiczenie na koncu linii je wyklucza. CLI DOPELNIA
# te linie spacjami z obu stron (zmierzone na `od -c` logu przebiegu 39850884343) —
# bez tolerancji na biale znaki wzorzec nie trafia w nic. Liczymy dodatkowo przyrost
# obrazow, bo to miara niezalezna od brzmienia komunikatow CLI.
pulled_services=$(tr -d '\r' <"$LOG" |
  grep -oE '^[[:space:]]*[A-Za-z][A-Za-z0-9]*[[:space:]]+Pulling[[:space:]]*$' |
  awk '{print $1}' | sort -u | tr '\n' ' ')
pulled_count=$(printf '%s' "$pulled_services" | wc -w | tr -d ' ')
image_delta=$((from_ghcr - cached_before))

# Raport celowo NIE zawiera doslownych ciagow `toomanyrequests`, `rate exceeded`
# ani adresu ECR Public: kryterium odbioru tej karty brzmi „zero wystapien w logu
# przebiegu", wiec wlasny raport nie moze zasmiecac tego grepa swoimi trafieniami.
summary "### Pull obrazow Supabase (ISK-398, ISK-420)"
summary "- rejestr: \`${SUPABASE_INTERNAL_IMAGE_REGISTRY:-ECR Public (domyslny)}\`"
summary "- obrazy w cache przed startem: ${cached_before} (oczekiwane: ${EXPECTED_IMAGE_COUNT})"
summary "- obrazy obecne jako \`ghcr.io/supabase/*\`: ${from_ghcr} (oczekiwane: ${EXPECTED_IMAGE_COUNT})"
summary "- odwolania do ECR Public w logu startu: ${ecr_in_log}"
summary "- obrazy pobierane w trakcie startu: ${pulled_count} (wymagane: 0)${pulled_services:+ — ${pulled_services}}"
summary "- trafienia limitu czestosci rejestru w trakcie startu: ${throttled} (oczekiwane: 0)"

if [[ "$throttled" -gt 0 ]]; then
  echo "::warning title=Limit czestosci pullow::${throttled} odpowiedzi z limitem przy pobieraniu obrazow Supabase w trakcie startu. Przy cieplym cache start nie powinien niczego ciagnac — sprawdz krok pre-pullu (ISK-420)."
fi

# Liczymy odwolania w logu TEGO startu, nie wszystkie obrazy maszyny: na stacji
# deweloperskiej leza zwykle starsze obrazy z ECR z innych stackow i globalne
# zliczanie dawaloby falszywy alarm.
if [[ "$from_ghcr" -eq 0 || "$ecr_in_log" -gt 0 ]]; then
  echo "::warning title=Obrazy spoza ghcr.io::Start pobieral obrazy z ECR Public (anonimowy pull, limit 1/s na IP) — nadpisanie rejestru nie zadzialalo (ISK-398)."
fi

# TWARDA bramka ISK-420 i jednoczesnie odpowiedz na punkt 4 zgloszenia. Celowo nie
# bramkujemy licznika trafien limitu — ten zalezy od pogody w rejestrze i czerwienilby
# dostawe od drgniecia infrastruktury. Bramkujemy to, co jest w pelni pod nasza
# kontrola i deterministyczne: start NIE MOZE niczego pobierac. Niezerowa wartosc
# oznacza, ze lista w `ci-prepull-supabase-images.sh` rozjechala sie z CLI (tak
# przeoczono `kong` na przebiegu 39850884343) — a wtedy kolejna chora chwila rejestru
# znowu zatrzyma cala dostawe. Taki rozjazd pojawia sie wylacznie przy swiadomej
# zmianie wersji CLI w `ci.yml`, wiec nie jest to zrodlo losowej czerwieni.
if [[ "$pulled_count" -gt 0 || "$image_delta" -gt 0 ]]; then
  echo "::error title=Start pobieral obrazy::Start pobieral obrazy (${pulled_count}: ${pulled_services:-<nieznane>}, przyrost obrazow: ${image_delta}), a powinien zastac wszystko w cache. Dodaj brakujace obrazy do AUXILIARY_IMAGES w scripts/ci-prepull-supabase-images.sh (ISK-420)."
  [[ "$status" -eq 0 ]] && status=1
fi

exit "$status"
