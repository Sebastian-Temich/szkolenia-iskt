#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV nie jest ustawione; skrypt jest przeznaczony wyłącznie dla CI." >&2
  exit 1
fi

while IFS='=' read -r name value; do
  value="${value%\"}"
  value="${value#\"}"

  case "$name" in
    API_URL) printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$value" >> "$GITHUB_ENV" ;;
    ANON_KEY) printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$value" >> "$GITHUB_ENV" ;;
    SERVICE_ROLE_KEY) printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$value" >> "$GITHUB_ENV" ;;
  esac
done < <(supabase status -o env)
