import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";
import {
  HSTS_VALUE,
  baselineSecurityHeaders,
  buildContentSecurityPolicy,
  createNonce,
  isHstsEnabled,
  nonceFromPolicy,
  originFromUrl,
} from "@/lib/security/headers";

// Regresja klasy W1 z bramki E7 (ISK-360): brak naglowkow bezpieczenstwa.
// Test pilnuje dwoch rzeczy: tresci polityki oraz tego, ze jest ona zadeklarowana
// w `next.config.ts`, a nie w pliku dostawcy hostingu (regula 3 z ADR-0006).

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part): [string, string[]] => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name ?? "", sources];
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  it("domyka scenariusz clickjackingu panelu i podstawowe wektory", () => {
    const parsed = directives(buildContentSecurityPolicy());

    expect(parsed.get("default-src")).toEqual(["'self'"]);
    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
    expect(parsed.get("object-src")).toEqual(["'none'"]);
    expect(parsed.get("base-uri")).toEqual(["'self'"]);
    expect(parsed.get("form-action")).toEqual(["'self'"]);
  });

  it("z nonce nie dopuszcza skryptow inline bez atrybutu nonce", () => {
    const policy = buildContentSecurityPolicy({ nonce: "abc123==" });
    const scriptSrc = directives(policy).get("script-src");

    expect(scriptSrc).toContain("'nonce-abc123=='");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(nonceFromPolicy(policy)).toBe("abc123==");
  });

  it("bez nonce zostawia 'unsafe-inline' dla skryptow bootstrapu Next", () => {
    // Trasy publiczne sa preranderowane (ISR), wiec nonce na zadanie nie ma jak
    // trafic do zapisanego HTML. To swiadome ustepstwo, opisane w ADR-0006.
    const scriptSrc = directives(buildContentSecurityPolicy()).get(
      "script-src",
    );

    expect(scriptSrc).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("'unsafe-eval' i WebSocket tylko w trybie deweloperskim", () => {
    const dev = directives(buildContentSecurityPolicy({ development: true }));
    const prod = directives(buildContentSecurityPolicy({ development: false }));

    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
    expect(dev.has("upgrade-insecure-requests")).toBe(false);

    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(prod.get("connect-src")).toEqual(["'self'"]);
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
  });

  it("dopuszcza origin Supabase w connect-src, gdy jest skonfigurowany", () => {
    const policy = buildContentSecurityPolicy({
      supabaseOrigin: originFromUrl("http://127.0.0.1:54321/rest/v1"),
    });

    expect(directives(policy).get("connect-src")).toEqual([
      "'self'",
      "http://127.0.0.1:54321",
    ]);
  });

  it("nie wpisuje do polityki wartosci, ktora nie jest URL-em", () => {
    expect(originFromUrl("to-nie-url")).toBeUndefined();
    expect(originFromUrl(undefined)).toBeUndefined();
  });
});

describe("createNonce", () => {
  it("generuje rozne wartosci akceptowane przez parser nonce Next.js", () => {
    const first = createNonce();
    const second = createNonce();

    expect(first).not.toBe(second);
    // Ten sam wzorzec, ktorego uzywa Next w `getScriptNonceFromHeader`.
    expect(first).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
    expect(nonceFromPolicy(buildContentSecurityPolicy({ nonce: first }))).toBe(
      first,
    );
  });
});

describe("baselineSecurityHeaders", () => {
  it("zawiera naglowki wymagane w ustaleniu W1", () => {
    const keys = baselineSecurityHeaders().map((header) => header.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
      ]),
    );
    expect(
      baselineSecurityHeaders().find((h) => h.key === "X-Content-Type-Options")
        ?.value,
    ).toBe("nosniff");
    expect(
      baselineSecurityHeaders().find((h) => h.key === "Referrer-Policy")?.value,
    ).toBe("strict-origin-when-cross-origin");
    expect(
      baselineSecurityHeaders().find((h) => h.key === "X-Frame-Options")?.value,
    ).toBe("DENY");
  });

  it("HSTS jest wylaczony domyslnie i wlaczany wylacznie zmienna srodowiskowa", () => {
    expect(isHstsEnabled({})).toBe(false);
    expect(isHstsEnabled({ SECURITY_HSTS_ENABLED: "1" })).toBe(false);
    expect(isHstsEnabled({ SECURITY_HSTS_ENABLED: "true" })).toBe(true);

    expect(
      baselineSecurityHeaders().some(
        (h) => h.key === "Strict-Transport-Security",
      ),
    ).toBe(false);
    expect(
      baselineSecurityHeaders({ hsts: true }).find(
        (h) => h.key === "Strict-Transport-Security",
      )?.value,
    ).toBe(HSTS_VALUE);
    expect(HSTS_VALUE).toBe("max-age=63072000; includeSubDomains");
  });
});

describe("next.config.ts", () => {
  it("deklaruje naglowki w konfiguracji aplikacji, nie w plikach dostawcy", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const rules = await nextConfig.headers!();

    const baseline = rules.find((rule) => rule.source === "/:path*");
    expect(baseline?.headers.map((h) => h.key)).toEqual(
      expect.arrayContaining([
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
      ]),
    );

    // Strona glowna ma wlasny wpis, bo `/:path(...)` nie dopasowuje korzenia.
    const root = rules.find((rule) => rule.source === "/");
    expect(root?.headers[0]?.key).toBe("Content-Security-Policy");
    expect(root?.headers[0]?.value).toContain("frame-ancestors 'none'");
  });

  it("nie nakłada statycznej CSP na trasy panelu — tam polityke ustawia proxy.ts", async () => {
    const rules = await nextConfig.headers!();
    const cspRules = rules.filter((rule) =>
      rule.headers.some((h) => h.key === "Content-Security-Policy"),
    );
    expect(cspRules.length).toBeGreaterThan(0);

    // Dwa naglowki CSP na jednej odpowiedzi oznaczaja czesc wspolna polityk,
    // czyli ciche oslabienie profilu panelu. Zaden wpis nie moze lapac `/panel`.
    const patterns = cspRules.map((rule) => sourceToRegExp(rule.source));
    for (const path of ["/panel", "/panel/zgloszenia", "/panel/zgloszenia/1"]) {
      expect(patterns.some((pattern) => pattern.test(path))).toBe(false);
    }
    for (const path of ["/", "/szkolenia", "/szkolenia/kurs-ai", "/kontakt"]) {
      expect(patterns.some((pattern) => pattern.test(path))).toBe(true);
    }
  });
});

/**
 * Minimalne odwzorowanie skladni `source` z `next.config.ts` na wyrazenie
 * regularne — tyle, ile potrzeba do sprawdzenia wylaczenia `/panel`. Rownowaznosc
 * z faktycznym routingiem Next potwierdza test E2E
 * `tests/e2e/naglowki-bezpieczenstwa.spec.ts` na uruchomionym serwerze.
 */
function sourceToRegExp(source: string): RegExp {
  const pattern = source
    .replace(/\/:path\*/g, "(?:/.*)?")
    .replace(/\/:path\((.*)\)/g, "/$1");
  return new RegExp(`^${pattern}$`);
}
