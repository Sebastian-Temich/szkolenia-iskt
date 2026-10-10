import { logout } from "../logowanie/actions";

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
