/**
 * Ekran braku uprawnien — ta sama forma co karta logowania (ISK-402 / M3).
 *
 * `Icon` jest importowana z WLASNEGO modulu, nie z `@/components/ui`:
 * `tests/unit/panel-brak-dostepu.test.ts` renderuje te strone przez
 * `react-dom/server` w srodowisku `node`, a indeks fundamentu wciaga
 * `links.tsx`, czyli `next/link`. Bezposredni import trzyma ten test wolny od
 * frameworka — to ten sam powod, dla ktorego `links.tsx` jest osobnym modulem
 * (patrz `docs/design-system.md`).
 */
import { Icon } from "@/components/ui/icon";

import { logout } from "../logowanie/actions";

/**
 * Jedyna strona panelu bez odczytu sesji, wiec Next prerenderowal ja statycznie.
 * `proxy.ts` wymusza na `/panel/*` CSP z nonce na zadanie, a zapisany prerender
 * mialby skrypty bez atrybutu `nonce` — przegladarka zablokowalaby je i strona
 * przestalaby dzialac (w trybie dev nie bylo by tego widac, bo tam kazde zadanie
 * renderuje sie od nowa). Patrz ADR-0006, „Nagłówki bezpieczeństwa" (ISK-360).
 */
export const dynamic = "force-dynamic";

export default function ForbiddenPage() {
  return (
    <main className="panel-login-shell">
      <section className="panel-login-card">
        <span className="panel-login-mark">
          <Icon name="lock" size={24} />
        </span>
        <div className="panel-login-head">
          <p className="panel-eyebrow">Brak uprawnień</p>
          <h1>To konto nie ma dostępu do panelu</h1>
          {/* ISK-373 / P11: stalo tu „Administrator musi byc wpisany do rejestru
              <code>admin_users</code>” — ekran ujawnial nazwe tabeli w bazie, co
              dla osoby bez uprawnien jest bezuzyteczne, a dla kogos badajacego
              powierzchnie ataku jest darmowa wskazowka. Jednoczesnie nie mowil,
              do kogo sie zglosic po dostep (kryterium 6 z DoD bramki UX). */}
          <p>
            Konto, na które się zalogowano, nie ma uprawnień administratora.
            Uprawnienia nadaje administrator ISKT.
          </p>
          <p>
            Jeśli dostęp jest Ci potrzebny, napisz na{" "}
            <a className="panel-inline-link" href="mailto:biuro@iskt.pl">
              biuro@iskt.pl
            </a>{" "}
            i podaj adres e-mail tego konta.
          </p>
        </div>
        <form action={logout}>
          <button className="panel-button" type="submit">
            <Icon name="log-out" size={18} />
            Wyloguj się
          </button>
        </form>
      </section>
    </main>
  );
}
