#!/usr/bin/env bash
# Uruchamia testy E2E przeciwko LOKALNEMU stackowi Supabase CLI.
#
# Dlaczego osobny skrypt, a nie samo `npm run test:e2e`:
#  1. `.env.local` czyta Next.js (serwer aplikacji), ale NIE proces Playwrighta.
#     Helpery testowe potrzebuja API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL
#     we wlasnym `process.env`, inaczej `stackEnv()` wola `supabase status`
#     w katalogu roboczym i moze trafic w stack innego worktree.
#  2. MAIL_TRANSPORT=log musi byc widoczne dla bramki hermetycznosci
#     (ADR-0005 D7) w `tests/e2e/helpers/global-setup.ts`.
#
# Uzycie:
#   SUPABASE_DIR=/sciezka/do/katalogu/z/supabase ./scripts/e2e-local.sh [args playwrighta]
# Domyslnie SUPABASE_DIR to katalog repozytorium.
set -euo pipefail

cd "$(dirname "$0")/.."
SUPABASE_DIR="${SUPABASE_DIR:-$PWD}"

# Parametry stacku pobieramy z CLI — zadnych kluczy w repozytorium.
eval "$(cd "$SUPABASE_DIR" && supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL)=' | sed 's/^/export /')"

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"

# UWAGA. `stackEnv()` (tests/integration/helpers/supabase.ts) czyta najpierw
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY, a dopiero potem
# API_URL / ANON_KEY / SERVICE_ROLE_KEY z lokalnego CLI. Jesli w srodowisku
# powloki siedza zmienne wskazujace na projekt HOSTOWANY (a na maszynie
# deweloperskiej siedza), to one wygrywaja i caly zestaw testow — razem
# z zapisami kluczem service_role — celuje w zdalny projekt.
# Nadpisujemy je wartosciami lokalnymi, zeby kolejnosc nie miala znaczenia.
export SUPABASE_URL="$API_URL"
export SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export SUPABASE_DB_URL="$DB_URL"
export MAIL_TRANSPORT=log
export E2E_PORT="${E2E_PORT:-4273}"
export NEXT_PUBLIC_SITE_URL="http://localhost:${E2E_PORT}"

exec npx playwright test "$@"
