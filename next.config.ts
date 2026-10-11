import type { NextConfig } from "next";

import {
  baselineSecurityHeaders,
  buildContentSecurityPolicy,
  isHstsEnabled,
  originFromUrl,
} from "./lib/security/headers";

// Naglowki bezpieczenstwa sa definiowane tutaj, a nie w plikach dostawcy hostingu
// (`vercel.json`, `netlify.toml`) — regula 3 z ADR-0006. Wartosci pochodza z
// `lib/security/headers.ts`, wspolnego z `proxy.ts`.
//
// Dwie reguly CSP, bo `/panel/*` dostaje mocniejsza polityke z nonce, ustawiana
// przez `proxy.ts`. Gdyby profil statyczny obowiazywal rowniez tam, odpowiedz
// panelu mialaby dwa naglowki `Content-Security-Policy` i obowiazywalaby ich czesc
// wspolna — nieczytelne i latwe do przeoczenia przy debugowaniu.
const PANEL_EXCLUDED = "/:path((?!panel$|panel/).*)";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const staticCsp = buildContentSecurityPolicy({
      development: process.env.NODE_ENV !== "production",
      supabaseOrigin: originFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    });
    const csp = [{ key: "Content-Security-Policy", value: staticCsp }];

    return [
      {
        source: "/:path*",
        headers: baselineSecurityHeaders({ hsts: isHstsEnabled() }),
      },
      // `/:path(...)` wymaga niepustego segmentu, wiec korzen trasy potrzebuje
      // osobnego wpisu — bez niego strona glowna zostaje bez CSP.
      { source: "/", headers: csp },
      { source: PANEL_EXCLUDED, headers: csp },
    ];
  },
};

export default nextConfig;
