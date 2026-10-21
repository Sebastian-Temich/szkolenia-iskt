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
set -uo pipefail

LOG="${SUPABASE_START_LOG:-supabase-start.log}"
EXPECTED_REGISTRY="ghcr.io"

summary() {
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
  printf '%s\n' "$1"
}

if [[ "${SUPABASE_INTERNAL_IMAGE_REGISTRY:-}" != "$EXPECTED_REGISTRY" ]]; then
  echo "::warning title=Rejestr obrazow Supabase::SUPABASE_INTERNAL_IMAGE_REGISTRY=\"${SUPABASE_INTERNAL_IMAGE_REGISTRY:-<brak>}\", oczekiwano \"${EXPECTED_REGISTRY}\" — pull pojdzie anonimowo do public.ecr.aws (ISK-398)."
fi

supabase start 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}

throttled=$(grep -ciE 'toomanyrequests|rate exceeded' "$LOG" || true)
ecr_in_log=$(grep -c 'public\.ecr\.aws' "$LOG" || true)
images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | sort -u || true)
from_ghcr=$(printf '%s\n' "$images" | grep -c '^ghcr\.io/supabase/' || true)

summary "### Pull obrazow Supabase (ISK-398)"
summary "- rejestr: \`${SUPABASE_INTERNAL_IMAGE_REGISTRY:-public.ecr.aws (domyslny)}\`"
summary "- obrazy obecne jako \`ghcr.io/supabase/*\`: ${from_ghcr} (oczekiwane: 13)"
summary "- odwolania do \`public.ecr.aws\` w logu startu: ${ecr_in_log}"
summary "- wystapienia \`toomanyrequests\`/\`rate exceeded\`: ${throttled}"

if [[ "$throttled" -gt 0 ]]; then
  echo "::warning title=Limit czestosci pullow::${throttled} odpowiedzi z limitem przy pobieraniu obrazow Supabase. Uwierzytelniony pull z ghcr.io mial to wyeliminowac — sprawdz krok logowania do rejestru (ISK-398)."
fi

# Liczymy odwolania w logu TEGO startu, nie wszystkie obrazy maszyny: na stacji
# deweloperskiej leza zwykle starsze obrazy z ECR z innych stackow i globalne
# zliczanie dawaloby falszywy alarm.
if [[ "$from_ghcr" -eq 0 || "$ecr_in_log" -gt 0 ]]; then
  echo "::warning title=Obrazy spoza ghcr.io::Start pobieral obrazy z public.ecr.aws (anonimowy pull, limit 1/s na IP) — nadpisanie rejestru nie zadzialalo (ISK-398)."
fi

exit "$status"
