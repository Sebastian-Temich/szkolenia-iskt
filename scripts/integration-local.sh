#!/usr/bin/env bash
# Uruchamia testy integracyjne (RLS, triggery, seed) przeciwko LOKALNEMU
# stackowi Supabase CLI.
#
# Istnieje z tego samego powodu co `e2e-local.sh`: `stackEnv()` czyta najpierw
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY, a te na maszynie
# deweloperskiej potrafia wskazywac na projekt HOSTOWANY. Bez nadpisania ich
# wartosciami lokalnymi testy — razem z zapisami kluczem service_role — celuja
# w zdalna baze. ADR-0005 D7 na to nie pozwala.
#
# Uzycie:
#   SUPABASE_DIR=/sciezka/do/katalogu/z/supabase ./scripts/integration-local.sh
set -euo pipefail

cd "$(dirname "$0")/.."
SUPABASE_DIR="${SUPABASE_DIR:-$PWD}"

eval "$(cd "$SUPABASE_DIR" && supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL)=' | sed 's/^/export /')"

export SUPABASE_URL="$API_URL"
export SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export SUPABASE_DB_URL="$DB_URL"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export MAIL_TRANSPORT=log

exec npm run test:integration -- "$@"
