// Jedno zrodlo prawdy dla naglowkow bezpieczenstwa (ISK-360, ustalenie W1 z bramki E7).
// Definicja musi zyc w `next.config.ts` i w kodzie aplikacji, nie w plikach dostawcy
// hostingu — to regula 3 z ADR-0006 („neutralnosc dostawcy"). Ten modul jest importowany
// zarowno przez `next.config.ts` (profil statyczny dla tras publicznych), jak i przez
// `proxy.ts` (profil z nonce dla `/panel/*`).
//
// Dwa profile CSP, bo trasy publiczne sa renderowane statycznie (ISR, `revalidate = 300`):
// nonce jest wartoscia na zadanie, wiec w preranderowanym HTML byloby nieaktualne. Trasy
// panelu sa dynamiczne (czytaja ciasteczka sesji), wiec moga dostac pelny nonce.
// Szczegoly i konsekwencje: ADR-0006, sekcja „Nagłówki bezpieczeństwa".

export type SecurityHeader = { key: string; value: string };

export type CspOptions = {
  /**
   * Nonce na zadanie. Gdy podany, `script-src` traci `'unsafe-inline'` (przegladarka
   * i tak ignoruje `'unsafe-inline'` w obecnosci nonce) i wymaga atrybutu `nonce`
   * na kazdym skrypcie inline.
   */
  nonce?: string;
  /**
   * Tryb deweloperski: webpack i React Refresh potrzebuja `'unsafe-eval'`, a HMR
   * gniazda WebSocket. Bez tego `npm run dev` i testy E2E w trybie dev padaja na
   * zablokowanych skryptach, a wyglada to jak zepsuta aplikacja.
   */
  development?: boolean;
  /**
   * Origin Supabase wyliczony z `NEXT_PUBLIC_SUPABASE_URL`. Dziś przegladarka nie
   * odpytuje Supabase bezposrednio (sesja idzie przez `proxy.ts`), ale
   * `lib/supabase/client.ts` istnieje i pierwsze jego uzycie bez tego wpisu
   * zostaloby zablokowane przez `connect-src`.
   */
  supabaseOrigin?: string;
};

export type BaselineOptions = {
  /** Wlaczenie HSTS; patrz `isHstsEnabled`. */
  hsts?: boolean;
};

/**
 * HSTS jest wylaczony domyslnie i wlaczany wylacznie zmienna srodowiskowa
 * `SECURITY_HSTS_ENABLED=true` (ADR-0006 regula 2: konfiguracja przez env, nie przez
 * wartosci zaszyte w kodzie). Powod: `includeSubDomains` z dwuletnim `max-age` jest
 * trudno odwracalny i wolno go wlaczyc tylko po potwierdzeniu HTTPS na calej domenie
 * `iskt.pl` wraz z subdomenami. Zakres ISK-360 pkt 2.
 */
export const HSTS_VALUE = "max-age=63072000; includeSubDomains";

export function isHstsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.SECURITY_HSTS_ENABLED === "true";
}

/** Zwraca origin (schemat + host + port) albo `undefined`, gdy wartosc nie jest URL-em. */
export function originFromUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const { nonce, development = false, supabaseOrigin } = options;

  const scriptSrc = ["'self'"];
  if (nonce) scriptSrc.push(`'nonce-${nonce}'`);
  else scriptSrc.push("'unsafe-inline'");
  if (development) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'"];
  if (supabaseOrigin) connectSrc.push(supabaseOrigin);
  if (development) connectSrc.push("ws:", "wss:");

  const directives: string[][] = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["object-src", "'none'"],
    // Oba naglowki celowo: `frame-ancestors` to wlasciwa blokada clickjackingu,
    // `X-Frame-Options: DENY` zostaje dla starszych przegladarek.
    ["frame-ancestors", "'none'"],
    ["frame-src", "'self'"],
    ["form-action", "'self'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'", "data:"],
    // `'unsafe-inline'` dla stylow zostaje: React renderuje atrybuty `style`,
    // a Next w trybie dev wstrzykuje `<style>`. Styl inline nie wykonuje kodu.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["script-src", ...scriptSrc],
    ["connect-src", ...connectSrc],
    ["manifest-src", "'self'"],
    ["worker-src", "'self'", "blob:"],
  ];

  // Na localhoscie po HTTP wymuszanie HTTPS zepsulo by `npm run dev`.
  if (!development) directives.push(["upgrade-insecure-requests"]);

  return directives.map((parts) => parts.join(" ")).join("; ");
}

/**
 * Naglowki niezalezne od trasy. CSP jest dopisywana osobno, bo rozni sie miedzy
 * profilem statycznym i profilem panelu z nonce.
 */
export function baselineSecurityHeaders(
  options: BaselineOptions = {},
): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];

  if (options.hsts) {
    headers.push({ key: "Strict-Transport-Security", value: HSTS_VALUE });
  }

  return headers;
}

/** Wyciaga nonce z gotowej polityki — uzywane w testach i przy diagnostyce. */
export function nonceFromPolicy(policy: string): string | undefined {
  return /'nonce-([A-Za-z0-9+/_-]+={0,2})'/.exec(policy)?.[1];
}

/**
 * Nonce generowany przez Web Crypto, bo `proxy.ts` moze zostac uruchomiony w
 * runtime Edge, gdzie `node:crypto` nie jest dostepny.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
