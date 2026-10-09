import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

const sharedServerFields = {
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  INQUIRY_NOTIFICATION_TO: z.email().optional(),
  FORM_THROTTLE_SALT: z.string().min(32).optional(),
  FORM_TOKEN_SECRET: z.string().min(32).optional(),
  TURNSTILE_ENABLED: z.enum(["true", "false"]).default("false"),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
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

export function parsePublicEnv(values: Environment) {
  const result = publicEnvSchema.safeParse(values);
  if (!result.success) {
    throw formatEnvironmentError("publiczna", result.error);
  }
  return result.data;
}

export function parseServerEnv(values: Environment) {
  const result = serverEnvSchema.safeParse(values);
  if (!result.success) {
    throw formatEnvironmentError("serwerowa", result.error);
  }
  return result.data;
}

export function getPublicEnv() {
  return parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
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
