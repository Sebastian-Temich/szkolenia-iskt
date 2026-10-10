import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  buildContentSecurityPolicy,
  createNonce,
  originFromUrl,
} from "@/lib/security/headers";

export async function proxy(request: NextRequest) {
  // Mocniejszy profil CSP dla panelu: `script-src` bez `'unsafe-inline'`, z nonce na
  // zadanie (ISK-360 / ustalenie W1 z bramki E7). Trasy publiczne zostaja na profilu
  // statycznym z `next.config.ts`, bo sa preranderowane (ISR) i nonce na zadanie nie
  // mialby jak trafic do zapisanego HTML.
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV !== "production",
    supabaseOrigin: originFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });

  // Nonce trafia do skryptow inline Next (payload RSC, bootstrap) dlatego, ze Next
  // czyta go z naglowka `content-security-policy` *zadania* (`parseRequestHeaders`).
  // Dlatego ustawiamy polityke na zadaniu, a nie tylko na odpowiedzi: Next kopiuje
  // wprawdzie naglowki odpowiedzi middleware'u na zadanie, ale to szczegol jego
  // implementacji (`server/lib/router-utils/resolve-routes.js`), nie kontrakt.
  // Klonujemy caly zestaw naglowkow, bo nadpisanie zadania z middleware'u usuwa te,
  // ktorych nie ma w przekazanym obiekcie.
  const respond = () => {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  let response = respond();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = respond();
        cookies.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        if (headers) {
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && request.nextUrl.pathname !== "/panel/logowanie") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/panel/logowanie";
    loginUrl.searchParams.set("powrot", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  return response;
}

export const config = { matcher: ["/panel/:path*"] };
