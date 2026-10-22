# ISK-403: pinowane parametry DZIALAJACEGO stacku szkolenia-iskt (kong 54341).
# NIE uzywac `supabase status` — w tym worktree zwraca 54321, a tam stoi OBCY
# projekt (rudnttcmdisetoqvirrs, aplikacja billingowa). Mierzone 2026-10-22.
export API_URL=http://127.0.0.1:54341
export DB_URL=postgresql://postgres:postgres@127.0.0.1:54342/postgres
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export SUPABASE_URL="$API_URL"
export SUPABASE_DB_URL="$DB_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export MAIL_TRANSPORT=log
export RODO_CLAUSE_APPROVED=true
export E2E_PORT="${E2E_PORT:-4473}"
export NEXT_PUBLIC_SITE_URL="http://localhost:${E2E_PORT}"
export FORM_TOKEN_SECRET="${FORM_TOKEN_SECRET:-$(openssl rand -hex 32)}"
export FORM_THROTTLE_SALT="${FORM_THROTTLE_SALT:-$(openssl rand -hex 32)}"
export INQUIRY_NOTIFICATION_TO=zgloszenia@example.invalid
