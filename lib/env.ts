import { z } from "zod";

// UWAGA (ISK-357 T5): zmienne Cloudflare Turnstile celowo NIE istnieja w schemacie. CAPTCHA nie
// jest zaimplementowana — nie ma kodu weryfikacji tokenu. Deklarowanie flag (`TURNSTILE_ENABLED`
// oraz kluczy), ktorych zaden kod nie odczytuje, wprowadzaloby operatora w blad co do stanu
// zabezpieczen: ustawienie `TURNSTILE_ENABLED=true` nie wlaczaloby niczego. Gdy Turnstile zostanie
// realnie wdrozony (po decyzji ISKT o nowym procesorze), zmienne wracaja tu RAZEM z logika
// weryfikacji, nie wczesniej.
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const sharedServerFields = {
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  INQUIRY_NOTIFICATION_TO: z.email().optional(),
  FORM_THROTTLE_SALT: z.string().min(32).optional(),
  FORM_TOKEN_SECRET: z.string().min(32).optional(),
  // Liczba zaufanych proxy (hopow) przed aplikacja (E7 W2 / ADR-0006). Semantyka jak
  // `trust proxy = N` w Express: zaufany blok to OSTATNIE N wpisow `x-forwarded-for`, realny
  // klient to pierwszy wpis bloku (patrz lib/security/client-hash.ts). MUSI odpowiadac topologii
  // wybranej platformy, potwierdzonej empirycznie na preview. Domyslnie 1 (pojedynczy edge proxy).
  FORM_TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(1),
  RODO_CLAUSE_VERSION: z.string().min(1).optional(),
};

const serverEnvSchema = z.discriminatedUnion("MAIL_TRANSPORT", [
  z.object({
    ...publicEnvSchema.shape,
    ...sharedServerFields,
    MAIL_TRANSPORT: z.literal("log"),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM: z.string().min(1).optional(),
  }),
  z.object({
    ...publicEnvSchema.shape,
    ...sharedServerFields,
    MAIL_TRANSPORT: z.literal("resend"),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM: z.string().min(1),
  }),
]);

type Environment = Record<string, string | undefined>;

function formatEnvironmentError(scope: string, error: z.ZodError): Error {
  const names = [
    ...new Set(error.issues.map((issue) => issue.path.join("."))),
  ].sort();
  return new Error(`Nieprawidłowa konfiguracja ${scope}: ${names.join(", ")}`);
}

const siteUrlSchema = z.object({
  NEXT_PUBLIC_SITE_URL: publicEnvSchema.shape.NEXT_PUBLIC_SITE_URL,
});

export function parseSiteUrl(values: Environment) {
  const result = siteUrlSchema.safeParse(values);
  if (!result.success) {
    throw formatEnvironmentError("publiczna", result.error);
  }
  return result.data.NEXT_PUBLIC_SITE_URL;
}

export function parsePublicEnv(values: Environment) {
  const result = publicEnvSchema.safeParse(values);
  if (!result.success) {
    throw formatEnvironmentError("publiczna", result.error);
  }
  return result.data;
}

/**
 * Produkcyjny build nie zawsze widzi konfigurację publiczną: CI przechodzi bez
 * kluczy Supabase, a nowe środowisko buduje się przed ich ustawieniem.
 * Prerender katalogu musi wtedy wygenerować pustą powłokę zamiast wysadzać
 * build — w czasie żądania brak konfiguracji nadal jest twardym błędem.
 */
export function isProductionBuildPhase(values: Environment = process.env) {
  return values.NEXT_PHASE === "phase-production-build";
}

export function isPublicEnvConfigured(values: Environment = process.env) {
  return publicEnvSchema.safeParse(values).success;
}

export function shouldPrerenderWithoutData(values: Environment = process.env) {
  return isProductionBuildPhase(values) && !isPublicEnvConfigured(values);
}

export function parseServerEnv(values: Environment) {
  const result = serverEnvSchema.safeParse(values);
  if (!result.success) {
    throw formatEnvironmentError("serwerowa", result.error);
  }
  return result.data;
}

/**
 * Adres publiczny czytamy OSOBNO od `getPublicEnv()` (ISK-375). Metadane Next.js
 * — `app/layout.tsx`, `buildPageMetadata()` w plikach stron — wyliczaja sie przy
 * ewaluacji modulu, a `npm run build` w bramce `quality` biegnie bez kluczy
 * Supabase (patrz komentarz przy `shouldPrerenderWithoutData`). Pelna walidacja
 * publiczna wysadzilaby wtedy build na brakujacym `NEXT_PUBLIC_SUPABASE_*`,
 * mimo ze SEO potrzebuje wylacznie adresu bazowego.
 *
 * Brak `NEXT_PUBLIC_SITE_URL` jest tu twardym bledem. Wartosc domyslna musialaby
 * byc konkretna domena w kodzie — czyli dokladnie defekt, ktory ta zmiana usuwa:
 * deploy preview emitowalby kanoniki produkcyjne i nikt by tego nie zauwazyl.
 * Zmienna jest juz WYMAGANA w `publicEnvSchema`, wiec nie poszerza to kontraktu
 * operatora.
 *
 * UWAGA (natura `NEXT_PUBLIC_*`): Next.js wstawia te wartosc do bundla przy
 * `next build`. Ustawienie jej dopiero w czasie zadania nie zmieni kanonikow —
 * kazde srodowisko (preview, staging, produkcja) musi miec wlasny build. Dowod
 * na realnym artefakcie: `tests/e2e/public-pages.spec.ts` ("robots.txt...").
 */
export function getSiteUrl() {
  return parseSiteUrl({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

export function getPublicEnv() {
  return parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getServerEnv() {
  return parseServerEnv({ ...process.env });
}

export function getSupabaseAdminEnv() {
  const result = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: publicEnvSchema.shape.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    })
    .safeParse(process.env);

  if (!result.success) {
    throw formatEnvironmentError("administracyjna Supabase", result.error);
  }
  return result.data;
}

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
