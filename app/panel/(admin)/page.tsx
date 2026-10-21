import Link from "next/link";

export default function PanelHome() {
  return (
    <section>
      <p className="panel-eyebrow">Centrum zarządzania</p>
      <h1>Panel administratora</h1>
      <div className="panel-grid">
        <Link className="panel-card" href="/panel/szkolenia">
          <h2>Szkolenia</h2>
          <p>Twórz, edytuj i publikuj ofertę.</p>
        </Link>
        <Link className="panel-card" href="/panel/trenerzy">
          <h2>Trenerzy</h2>
          <p>Zarządzaj profilami prowadzących.</p>
        </Link>
        <Link className="panel-card" href="/panel/zgloszenia">
          <h2>Zgłoszenia</h2>
          <p>Obsługuj kontakt od klientów.</p>
        </Link>
      </div>
    </section>
  );
}
