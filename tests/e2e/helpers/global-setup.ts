// Global setup E2E: bramka hermetycznosci + konta lokalne.
// Konto administratora ISKT jest bramka biznesowa — tutaj tworzymy WYLACZNIE
// lokalne konta testowe w domenie example.invalid (ADR-0005 D7).
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
  assertLocalStack,
  grantAdmin,
  signedInClient,
  stackEnv,
} from "./stack";
import { clearThrottle } from "./data";

export default async function globalSetup(): Promise<void> {
  const env = stackEnv();
  assertLocalStack(env);

  // Auth (GoTrue) restartuje sie asynchronicznie po `supabase db reset`.
  const deadline = Date.now() + 90_000;
  let lastStatus = 0;
  for (;;) {
    try {
      const res = await fetch(`${env.apiUrl}/auth/v1/health`, {
        headers: { apikey: env.anonKey },
      });
      lastStatus = res.status;
      if (res.ok) break;
    } catch {
      // kontener jeszcze nie odpowiada
    }
    if (Date.now() > deadline) {
      throw new Error(`Auth (GoTrue) nie wstal (ostatni status: ${lastStatus})`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Administrator lokalny (wiersz w admin_users) oraz uzytkownik BEZ uprawnien (D5.9).
  const admin = await signedInClient(ADMIN_EMAIL, ADMIN_PASSWORD);
  await grantAdmin(admin.userId, "[TEST] Administrator lokalny");
  await signedInClient(USER_EMAIL, USER_PASSWORD);

  await clearThrottle();
}
