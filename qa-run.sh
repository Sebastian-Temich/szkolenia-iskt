#!/usr/bin/env bash
# ISK-419: uruchamia pomiary QA przeciwko WLASCIWEMU stackowi szkolenia-iskt.
#
# Dlaczego nie `scripts/e2e-local.sh`: ten skrypt robi
# `eval "$(supabase status -o env)"`, a `supabase status` w tym worktree zwraca
# porty z `config.toml` (54321/54322), czyli NIE te, na ktorych stoi stack
# szkolenia-iskt (54341/54342). Na 54321 stoi OBCY projekt
# (`rudnttcmdisetoqvirrs`) — oba porty odpowiadaja HTTP 200, wiec zwykly
# probe ich nie rozrozni. Pomiar wpuszczony tam byloby zarowno bezwartosciowy,
# jak i zapisem do cudzych danych.
#
# Z `supabase status` bierzemy WYLACZNIE klucze (JWT podpisane domyslnym
# sekretem, wiec wazne dla obu stackow), a adresy nadpisujemy z `qa-env.sh`.
set -euo pipefail
cd "$(dirname "$0")"

eval "$(supabase status -o env 2>/dev/null | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=' | sed 's/^/export /')"
[ -n "${ANON_KEY:-}" ] || { echo "qa-run.sh: brak ANON_KEY z supabase status" >&2; exit 1; }
[ -n "${SERVICE_ROLE_KEY:-}" ] || { echo "qa-run.sh: brak SERVICE_ROLE_KEY" >&2; exit 1; }

# shellcheck source=qa-env.sh
source ./qa-env.sh

# Bramka tozsamosci stacku: zanim cokolwiek zmierzymy, DOWODZIMY, ze pod
# API_URL stoi szkolenia-iskt. Asercja pozytywna (jest nasza tabela z danymi
# demo) plus negatywna (to nie jest projekt billingowy) — sam HTTP 200 nie
# wystarcza, bo obcy projekt tez go zwraca.
slug="$(curl -s -m 10 "$API_URL/rest/v1/trainings?slug=eq.wprowadzenie-do-ai&select=slug" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | head -c 200)"
case "$slug" in
  *wprowadzenie-do-ai*) : ;;
  *) echo "qa-run.sh: $API_URL to NIE stack szkolenia-iskt (odpowiedz: $slug)" >&2; exit 1 ;;
esac

# Pomiar na BUDOWIE produkcyjnej, nie `next dev`.
# `next dev` wstrzykuje wlasna nakladke bledow (element `role="alert"`), ktora
# zaklamuje wyniki axe i wchodzi na zrzuty. ISK-403 mierzyla 15 widokow na
# budowie (`KOREKTA-POMIARU.md` cytuje `.next/static/css/62450834853625fa.css`,
# a nazwa z hashem powstaje tylko przy `next build`) — zeby nowe pomiary byly
# porownywalne z tamtymi, musza isc tym samym trybem.
export PLAYWRIGHT_USE_BUILD=1

echo "qa-run.sh: API_URL=$API_URL DB_URL=$DB_URL E2E_PORT=$E2E_PORT tryb=build" >&2
exec npx playwright test "$@"
