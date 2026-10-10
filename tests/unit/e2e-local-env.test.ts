// Bramka na pulapke ISK-369: `scripts/e2e-local.sh` musi podac routeowi
// `/api/inquiries` FORM_TOKEN_SECRET, FORM_THROTTLE_SALT i
// INQUIRY_NOTIFICATION_TO. Bez nich route zwraca 500 `server_misconfigured`,
// a sciezki formularza padaja na ekranie bledu w UI — objaw wskazuje na
// formularz, przyczyna siedzi w konfiguracji przebiegu. W CI te zmienne stoja
// na poziomie workflow (`ci.yml` -> `env`), wiec bramka e2e tego nie zobaczy.
//
// Test uruchamia PRAWDZIWY skrypt, podstawiajac na PATH atrapy `supabase`
// (zwraca parametry stacku) i `npx` (zamiast Playwrighta wypisuje widziane
// zmienne jako JSON). Zadne z tego nie dotyka Dockera ani przegladarki.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const script = fileURLToPath(
  new URL("../../scripts/e2e-local.sh", import.meta.url),
);

const stubDir = mkdtempSync(join(tmpdir(), "isk369-stub-"));

function writeStub(name: string, body: string): void {
  const file = join(stubDir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

writeStub(
  "supabase",
  [
    'cat <<"EOF"',
    'API_URL="http://127.0.0.1:54321"',
    'ANON_KEY="atrapa-anon"',
    'SERVICE_ROLE_KEY="atrapa-service-role"',
    'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
    "EOF",
  ].join("\n"),
);

// Atrapa Playwrighta: wypisuje na stdout to, co skrypt faktycznie wyeksportowal.
writeStub(
  "npx",
  `node -e 'const names = ["FORM_TOKEN_SECRET", "FORM_THROTTLE_SALT", "INQUIRY_NOTIFICATION_TO", "MAIL_TRANSPORT", "SUPABASE_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]; process.stdout.write(JSON.stringify(Object.fromEntries(names.map((n) => [n, process.env[n] ?? null]))));'`,
);

type Result = {
  status: number | null;
  stderr: string;
  env: Record<string, string | null>;
};

function runScript(extraEnv: Record<string, string> = {}): Result {
  // Celowo NIE dziedziczymy srodowiska: na maszynie deweloperskiej moga w nim
  // siedziec FORM_* i test sprawdzalby wtedy cokolwiek, byle nie skrypt.
  const result = spawnSync("bash", [script, "--atrapa"], {
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
      HOME: process.env.HOME ?? stubDir,
      ...extraEnv,
    },
  });

  let env: Record<string, string | null> = {};
  if (result.status === 0) {
    env = JSON.parse(result.stdout) as Record<string, string | null>;
  }
  return { status: result.status, stderr: result.stderr, env };
}

describe("scripts/e2e-local.sh — konfiguracja formularza", () => {
  it("eksportuje wszystkie trzy zmienne wymagane przez /api/inquiries", () => {
    const { status, env } = runScript();

    expect(status).toBe(0);
    // `lib/env.ts` wymaga min. 32 znakow dla sekretow i adresu e-mail dla adresata.
    expect(env.FORM_TOKEN_SECRET?.length ?? 0).toBeGreaterThanOrEqual(32);
    expect(env.FORM_THROTTLE_SALT?.length ?? 0).toBeGreaterThanOrEqual(32);
    expect(env.INQUIRY_NOTIFICATION_TO).toMatch(/^[^@\s]+@[^@\s]+\.invalid$/);
    // Hermetycznosc przebiegu (ADR-0005 D7) — nic nie wychodzi poza maszyne.
    expect(env.MAIL_TRANSPORT).toBe("log");
    expect(env.SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it("daje srodowisko, ktore przechodzi schemat serwerowy i brame routeu", () => {
    const { status, env } = runScript();
    expect(status).toBe(0);

    // `parseServerEnv` jest tym samym sprawdzeniem, ktore route wykonuje przez
    // `getServerEnv()`. Gdyby sekret byl krotszy niz 32 znaki albo adresat nie
    // byl adresem e-mail, rzuciloby tutaj — a w przebiegu e2e dopiero jako 500.
    const parsed = parseServerEnv(
      Object.fromEntries(
        Object.entries(env).filter(
          (entry): entry is [string, string] => entry[1] !== null,
        ),
      ),
    );

    // Dokladnie warunek z `app/api/inquiries/route.ts`.
    expect(
      Boolean(
        parsed.FORM_TOKEN_SECRET &&
        parsed.FORM_THROTTLE_SALT &&
        parsed.INQUIRY_NOTIFICATION_TO,
      ),
    ).toBe(true);
  });

  it("generuje sekrety na kazdy przebieg, zamiast trzymac stala w repozytorium", () => {
    const first = runScript();
    const second = runScript();

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.env.FORM_TOKEN_SECRET).not.toBe(second.env.FORM_TOKEN_SECRET);
    expect(first.env.FORM_THROTTLE_SALT).not.toBe(
      second.env.FORM_THROTTLE_SALT,
    );
    expect(first.env.FORM_TOKEN_SECRET).not.toBe(first.env.FORM_THROTTLE_SALT);
  });

  it("nie nadpisuje wartosci podanych przez operatora", () => {
    const token = "a".repeat(40);
    const salt = "b".repeat(40);
    const { status, env } = runScript({
      FORM_TOKEN_SECRET: token,
      FORM_THROTTLE_SALT: salt,
      INQUIRY_NOTIFICATION_TO: "ktos@example.invalid",
    });

    expect(status).toBe(0);
    expect(env.FORM_TOKEN_SECRET).toBe(token);
    expect(env.FORM_THROTTLE_SALT).toBe(salt);
    expect(env.INQUIRY_NOTIFICATION_TO).toBe("ktos@example.invalid");
  });

  it("przerywa z czytelnym komunikatem, gdy podany sekret jest za krotki", () => {
    const { status, stderr } = runScript({ FORM_TOKEN_SECRET: "za-krotki" });

    // Inaczej walidacja odpalilaby dopiero w czasie zadania i wrocila jako
    // ten sam 500 `server_misconfigured`, czyli znow mylacy objaw.
    expect(status).toBe(1);
    expect(stderr).toContain("FORM_TOKEN_SECRET");
    expect(stderr).toContain("min. 32");
  });
});
