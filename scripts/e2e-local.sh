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
#  3. Route `/api/inquiries` wymaga FORM_TOKEN_SECRET, FORM_THROTTLE_SALT
#     i INQUIRY_NOTIFICATION_TO. W CI stoja one na poziomie workflow
#     (`ci.yml` -> `env`), lokalnie nikt ich nie ustawia — skrypt generuje
#     wartosci jednorazowe (ISK-369).
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

# Sekrety antyspamowe i adresat powiadomien.
#
# Bez nich `app/api/inquiries/route.ts` zwraca 500 `server_misconfigured`,
# a sciezki formularza padaja na ekranie bledu w UI — objaw wskazuje na
# formularz, przyczyna jest w konfiguracji przebiegu. W CI te zmienne stoja
# na poziomie workflow (`ci.yml` -> `env`), wiec bramka tego nie lapi.
#
# To NIE sekrety ISKT (ADR-0004): token i sol sa generowane na ten jeden
# przebieg, zyja tylko w tym procesie i nie trafiaja do repozytorium ani do
# `.env.local`. Wartosc juz ustawiona w srodowisku (np. z `.env.local`
# wyeksportowanego recznie) wygrywa — wtedy tylko ja sprawdzamy.
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
  fi
}

# `lib/env.ts` wymaga min. 32 znakow. Krotsza wartosc przeszlaby walidacje
# srodowiska dopiero w czasie zadania i wrocila jako ten sam 500.
assert_min_32() {
  local name="$1" value="$2"
  if [ "${#value}" -lt 32 ]; then
    echo "e2e-local.sh: ${name} ma ${#value} znakow, a lib/env.ts wymaga min. 32." >&2
    echo "              Ustaw dluzsza wartosc albo usun zmienna ze srodowiska — skrypt wygeneruje lokalna." >&2
    exit 1
  fi
}

if [ -n "${FORM_TOKEN_SECRET:-}" ]; then
  assert_min_32 FORM_TOKEN_SECRET "$FORM_TOKEN_SECRET"
  token_source="ze srodowiska"
else
  FORM_TOKEN_SECRET="$(gen_secret)"
  token_source="wygenerowany lokalnie"
fi
export FORM_TOKEN_SECRET

if [ -n "${FORM_THROTTLE_SALT:-}" ]; then
  assert_min_32 FORM_THROTTLE_SALT "$FORM_THROTTLE_SALT"
  salt_source="ze srodowiska"
else
  FORM_THROTTLE_SALT="$(gen_secret)"
  salt_source="wygenerowana lokalnie"
fi
export FORM_THROTTLE_SALT

# Transport `log` niczego nie wysyla, wiec adresat jest wylacznie formalnym
# wymogiem schematu. Domena `.invalid` jest zarezerwowana (RFC 2606).
export INQUIRY_NOTIFICATION_TO="${INQUIRY_NOTIFICATION_TO:-zgloszenia@example.invalid}"

echo "e2e-local.sh: FORM_TOKEN_SECRET ${token_source}, FORM_THROTTLE_SALT ${salt_source}, INQUIRY_NOTIFICATION_TO=${INQUIRY_NOTIFICATION_TO} (MAIL_TRANSPORT=log — nic nie wychodzi)." >&2

exec npx playwright test "$@"
