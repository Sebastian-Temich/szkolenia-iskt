import Link from "next/link";

import { IconChip } from "@/components/ui";

/**
 * Start panelu (ISK-402 / M3).
 *
 * H1 „Zarzadzanie oferta" wprost z karty i ze wzorca. Wczesniej stal tu
 * „Panel administratora" — ten napis przeniosl sie na ekran logowania, a tutaj
 * jest `panel-eyebrow`, czyli dokladnie jak we wzorcu. Zmiana pociagnela
 * asercje w `tests/e2e/panel.spec.ts`.
 *
 * Wzorzec nie ma strony startowej panelu: wchodzi od razu w zakladke
 * „Szkolenia". Produkt ma `/panel` jako osobna trase (i cztery bramki ja
 * mierza), wiec zostaje jako spis obszarow — trzy karty w formie wzorca.
 */
const areas = [
  {
    href: "/panel/szkolenia",
    icon: "graduation-cap",
    title: "Szkolenia",
    lead: "Twórz, edytuj i publikuj ofertę.",
  },
  {
    href: "/panel/trenerzy",
    icon: "award",
    title: "Trenerzy",
    lead: "Zarządzaj profilami prowadzących.",
  },
  {
    href: "/panel/zgloszenia",
    icon: "mail",
    title: "Zgłoszenia",
    lead: "Obsługuj kontakt od klientów.",
  },
] as const;

export default function PanelHome() {
  return (
    <section>
      <div className="panel-title-row">
        <div>
          <p className="panel-eyebrow">Panel administratora</p>
          <h1>Zarządzanie ofertą</h1>
        </div>
      </div>
      <div className="panel-grid">
        {areas.map((area) => (
          <Link className="panel-card" href={area.href} key={area.href}>
            <IconChip icon={area.icon} size="lg" tone="soft" />
            <h2>{area.title}</h2>
            <p>{area.lead}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
