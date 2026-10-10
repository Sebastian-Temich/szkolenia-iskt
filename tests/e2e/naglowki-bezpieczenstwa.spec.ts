import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

// Bramka regresji dla ustalenia W1 z bramki E7 (ISK-360). Scenariusz, ktory ma
// byc domkniety: atakujacy osadza adres panelu w przezroczystym `<iframe>`
// i przechwytuje klikniecia zalogowanego administratora.
//
// Dlaczego test E2E obok jednostkowego: `next.config.ts` moze deklarowac
// poprawne reguly, a routing Next i tak nie dopasuje ich do trasy. Tylko
// odpowiedz uruchomionego serwera potwierdza, ze naglowek realnie wychodzi.

const PUBLIC_PATHS = ["/", "/szkolenia", "/trenerzy", "/kontakt"] as const;

const REQUIRED = [
  ["x-frame-options", "DENY"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
] as const;

type HeaderBearing = { headersArray(): { name: string; value: string }[] };

function headerValues(response: HeaderBearing, name: string): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === name)
    .map((header) => header.value);
}

/**
 * Dwa naglowki `Content-Security-Policy` na jednej odpowiedzi nie sa bledem HTTP
 * — przegladarka wymusza wtedy czesc wspolna polityk. Taka konfiguracja czyta sie
 * jak dzialajaca, a faktycznie oslabia profil panelu, dlatego liczba naglowkow
 * jest tu asercja, nie szczegolem.
 */
function singlePolicy(response: HeaderBearing): string {
  const values = headerValues(response, "content-security-policy");
  expect(values).toHaveLength(1);
  return values[0]!;
}

function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|Refused to/i.test(message.text())
    ) {
      violations.push(message.text());
    }
  });
  return violations;
}

for (const path of PUBLIC_PATHS) {
  test(`${path} zwraca naglowki bezpieczenstwa`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);

    for (const [name, value] of REQUIRED) {
      expect(headerValues(response, name)).toEqual([value]);
    }

    const policy = singlePolicy(response);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");

    // HSTS jest wlaczany wylacznie przez SECURITY_HSTS_ENABLED i nie moze
    // pojawic sie przypadkiem na srodowisku bez potwierdzonego HTTPS.
    expect(headerValues(response, "strict-transport-security")).toEqual([]);
  });
}

test("trasy publiczne nie dostaja nonce, bo sa preranderowane", async ({
  request,
}) => {
  // Nonce w preranderowanym HTML byloby stale, czyli bezwartosciowe. Ten test
  // pilnuje, zeby profil statyczny nie zostal przez przypadek podmieniony na
  // profil panelu — wtedy strony publiczne przestalyby sie uruchamiac.
  const policy = singlePolicy(await request.get("/"));
  expect(policy).not.toContain("nonce-");
  expect(policy).toContain("script-src 'self' 'unsafe-inline'");
});

test("panel dostaje polityke z nonce, a kazdy skrypt inline ten nonce nosi", async ({
  request,
}) => {
  const response = await request.get("/panel/logowanie");
  expect(response.status()).toBe(200);

  const policy = singlePolicy(response);
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce, "polityka panelu musi zawierac nonce").toBeTruthy();
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("'unsafe-inline' 'unsafe-eval'");

  const scriptSrc = /script-src ([^;]+)/.exec(policy)?.[1] ?? "";
  expect(scriptSrc).not.toContain("'unsafe-inline'");

  // Dowod, ze nonce faktycznie dociera do renderu, a nie tylko do naglowka. Sam
  // naglowek z nonce bez tego sprzezenia jest gorszy od braku CSP: przegladarka
  // blokuje wtedy wszystkie skrypty bootstrapu i panel przestaje dzialac.
  const html = await response.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) {
    expect(tag, `skrypt bez nonce: ${tag}`).toContain(`nonce="${nonce}"`);
  }
});

test.describe("panel pod wymuszona polityka", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("administrator przechodzi przez panel bez naruszen CSP", async ({
    page,
  }) => {
    const violations = collectCspViolations(page);

    await loginAsAdmin(page);
    await page.goto("/panel/zgloszenia");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Odpowiedz juz uwierzytelnionej trasy panelu — tej, ktora wedlug raportu
    // E7 renderuje pelne dane osobowe.
    const response = await page.request.get("/panel/zgloszenia");
    expect(response.status()).toBe(200);
    const policy = singlePolicy(response);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("nonce-");
    expect(headerValues(response, "x-frame-options")).toEqual(["DENY"]);

    expect(violations).toEqual([]);
  });
});
