// Parametry lokalnego stacku i klienci dla testow E2E.
// Reuzywamy helperow E2 (jedno zrodlo prawdy) razem z bramka hermetycznosci
// `assertLocalStack` (ADR-0005 D7) — testy nigdy nie wychodza do sieci publicznej.
export {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
  anonClient,
  assertLocalStack,
  grantAdmin,
  serviceClient,
  signedInClient,
  stackEnv,
  withPg,
} from "../../integration/helpers/supabase";
