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
        <p className="panel-eyebrow">Brak uprawnień</p>
        <h1>To konto nie ma dostępu do panelu</h1>
        <p>
          Administrator musi być wpisany do rejestru <code>admin_users</code>.
        </p>
        <form action={logout}>
          <button className="panel-button">Wyloguj się</button>
        </form>
      </section>
    </main>
  );
}
