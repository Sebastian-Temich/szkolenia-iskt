// Parametry lokalnego stacku i klienci dla testow E2E.
// Reuzywamy helperow E2 (jedno zrodlo prawdy), a bramke hermetycznosci
// (ADR-0005 D7) definiujemy tutaj — testy nigdy nie wychodza do sieci publicznej.
export {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
  anonClient,
  grantAdmin,
  serviceClient,
  signedInClient,
  stackEnv,
  withPg,
} from "../../integration/helpers/supabase";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalHost(label: string, raw: string): void {
  let host: string;
  try {
    host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error(`${label}: nie jest poprawnym URL-em (${raw})`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${label} wskazuje na host nielokalny (${host}). ADR-0005 D7 zabrania ` +
        `uruchamiania testow przeciwko czemukolwiek poza lokalnym stackiem ` +
        `Supabase CLI — w szczegolnosci przeciwko projektowi produkcyjnemu ISKT.`,
    );
  }
}

/**
 * Bramka hermetycznosci (ADR-0005 D7). Odpala sie w `globalSetup`, przed
 * pierwszym testem, i przerywa caly przebieg, jesli konfiguracja celuje poza
 * lokalny stack albo poczta nie jest w trybie `log`. Bez tej bramki literowka
 * w zmiennej srodowiskowej moze wyslac realnego maila albo dopisac dane
 * testowe do projektu produkcyjnego.
 */
export function assertLocalStack(env: { apiUrl: string; dbUrl: string }): void {
  assertLocalHost("NEXT_PUBLIC_SUPABASE_URL / API_URL", env.apiUrl);
  assertLocalHost("SUPABASE_DB_URL / DB_URL", env.dbUrl);

  const transport = process.env.MAIL_TRANSPORT;
  if (transport !== "log") {
    throw new Error(
      `MAIL_TRANSPORT musi byc "log" w testach (jest: ${transport ?? "<brak>"}). ` +
        `ADR-0005 D7: zadna poczta nie opuszcza maszyny testowej.`,
    );
  }
}
