"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nawigacja obszarow panelu — przelacznik segmentowy wzorca (ISK-402 / M3).
 *
 * DLACZEGO LINKI, A NIE PRZYCISKI
 * Wzorzec trzyma wybrana zakladke w stanie klienta (`s.adminTab`) i renderuje
 * dwa niepowiazane `button`y. W produkcie kazdy obszar jest osobna trasa, wiec
 * naturalna forma to link: da sie go otworzyc w nowej karcie, wkleic komus
 * i wrocic do niego przyciskiem „wstecz".
 *
 * DLACZEGO `aria-current`, A NIE SAM KOLOR
 * Bez `aria-current="page"` stan wybrany niesie wylacznie tlo pastylki
 * (WCAG 1.4.1), a czytnik ekranu oglasza wszystkie trzy pozycje identycznie.
 * Wzorzec nie ma tu zadnego atrybutu stanu.
 *
 * DLACZEGO BEZ LICZNIKOW
 * Wzorzec pisze „Szkolenia (12)". Bramka `panel-layout.spec.ts` wymaga
 * `name: "Szkolenia", exact: true` dla wszystkich czterech widokow panelu,
 * a licznik kazalby tej powloce odpytywac trzy tabele przy kazdym wejsciu
 * w dowolna podstrone panelu.
 */
const sections = [
  { href: "/panel/szkolenia", label: "Szkolenia" },
  { href: "/panel/trenerzy", label: "Trenerzy" },
  { href: "/panel/zgloszenia", label: "Zgłoszenia" },
] as const;

export function PanelNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Nawigacja panelu" className="panel-nav">
      {sections.map((section) => {
        // Podstrony obszaru (edycja, szczegol) tez zaznaczaja swoja zakladke —
        // administrator ma widziec, w ktorym obszarze jest, takze w edytorze.
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
