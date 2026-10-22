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
# PONAWIANIE STARTU (ISK-412)
# Zalozenie ISK-398 bylo takie, ze throttling rejestru jest PRZEZYWALNY, bo CLI
# ponawia pull samo. 2026-10-22 przestalo byc prawda: ghcr.io zaczal odrzucac
# pull paczka (`toomanyrequests: ... allowed: 44000/minute`) tak skutecznie, ze
# `supabase start` konczyl sie bledem, majac 7-11 z 13 obrazow. Trzy kolejne
# przebiegi na PR #40 padly identycznie, ZA KAZDYM RAZEM przed pierwszym testem
# — czyli `database` i `e2e` byly niezdawalne niezaleznie od tresci zmiany,
# a `main` jest chroniony i wymaga ich zieleni.
#
# Dlatego start jest ponawiany, ale WYLACZNIE gdy w logu widac limit rejestru:
# kazda inna przyczyna bledu (zla migracja, zajety port, blad konfiguracji) ma
# padac natychmiast i bez maskowania. Miedzy probami stack jest zatrzymywany,
# bo nieudany start zostawia czesc kontenerow w biegu, a kolejne `supabase
# start` potraktowalby je jako konflikt. Przerwa rosnie liniowo — limit jest
# liczony na minute, wiec czekanie jest tu skuteczniejsze niz natychmiastowa
# kolejna paczka 13 pullow. Obrazy pobrane w poprzedniej probie zostaja
# w cache demona, wiec kazda proba ma mniej do sciagniecia niz poprzednia.
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
  echo "::warning title=Rejestr obrazow Supabase::SUPABASE_INTERNAL_IMAGE_REGISTRY=\"${SUPABASE_INTERNAL_IMAGE_REGISTRY:-<brak>}\", oczekiwano \"${EXPECTED_REGISTRY}\" — pull pojdzie anonimowo do ECR Public (ISK-398)."
fi

attempts="${SUPABASE_START_ATTEMPTS:-3}"
throttled_total=0

for ((attempt = 1; attempt <= attempts; attempt++)); do
  supabase start 2>&1 | tee "$LOG"
  status=${PIPESTATUS[0]}

  attempt_throttled=$(grep -ciE 'toomanyrequests|rate exceeded' "$LOG" || true)
  throttled_total=$((throttled_total + attempt_throttled))

  [[ "$status" -eq 0 ]] && break

  # Ponawiamy TYLKO limit rejestru. Kazda inna przyczyna pada od razu — inaczej
  # ten retry maskowalby prawdziwe bledy startu i kosztowal trzy razy tyle czasu.
  if [[ "$attempt_throttled" -eq 0 ]]; then
    echo "::notice title=Start Supabase::Blad startu bez sladu limitu rejestru — nie ponawiam (ISK-412)."
    break
  fi

  if [[ "$attempt" -eq "$attempts" ]]; then
    echo "::error title=Limit czestosci pullow::Start nie udal sie w ${attempts} probach; za kazdym razem z powodu limitu rejestru obrazow (ISK-412)."
    break
  fi

  echo "::warning title=Ponawiam start Supabase::Proba ${attempt}/${attempts} padla na limicie rejestru obrazow. Zatrzymuje stack i ponawiam (ISK-412)."
  # Nieudany start zostawia czesc kontenerow w biegu — bez tego kolejna proba
  # zglasza konflikt zajetych portow zamiast dociagnac brakujace obrazy.
  supabase stop --no-backup >/dev/null 2>&1 || true
  sleep $((attempt * 30))
done

throttled="$throttled_total"
ecr_in_log=$(grep -c 'public\.ecr\.aws' "$LOG" || true)
images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | sort -u || true)
from_ghcr=$(printf '%s\n' "$images" | grep -c '^ghcr\.io/supabase/' || true)

# Raport celowo NIE zawiera doslownych ciagow `toomanyrequests`, `rate exceeded`
# ani adresu ECR Public: kryterium odbioru tej karty brzmi „zero wystapien w logu
# przebiegu", wiec wlasny raport nie moze zasmiecac tego grepa swoimi trafieniami.
summary "### Pull obrazow Supabase (ISK-398)"
summary "- rejestr: \`${SUPABASE_INTERNAL_IMAGE_REGISTRY:-ECR Public (domyslny)}\`"
summary "- obrazy obecne jako \`ghcr.io/supabase/*\`: ${from_ghcr} (oczekiwane: 13)"
summary "- odwolania do ECR Public w logu startu: ${ecr_in_log}"
summary "- trafienia limitu czestosci rejestru: ${throttled}"

if [[ "$throttled" -gt 0 ]]; then
  echo "::warning title=Limit czestosci pullow::${throttled} odpowiedzi z limitem przy pobieraniu obrazow Supabase. Uwierzytelniony pull z ghcr.io mial to wyeliminowac — sprawdz krok logowania do rejestru (ISK-398)."
fi

# Liczymy odwolania w logu TEGO startu, nie wszystkie obrazy maszyny: na stacji
# deweloperskiej leza zwykle starsze obrazy z ECR z innych stackow i globalne
# zliczanie dawaloby falszywy alarm.
if [[ "$from_ghcr" -eq 0 || "$ecr_in_log" -gt 0 ]]; then
  echo "::warning title=Obrazy spoza ghcr.io::Start pobieral obrazy z ECR Public (anonimowy pull, limit 1/s na IP) — nadpisanie rejestru nie zadzialalo (ISK-398)."
fi

exit "$status"
