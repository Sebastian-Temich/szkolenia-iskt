import { getCategories, getTrainings } from "@/lib/public-catalog";

import { HomeSections } from "./home-sections";

export const revalidate = 300;

/**
 * Strona glowna. Zapytania do bazy zostaja tutaj, po stronie serwera; kompozycja
 * sekcji i jeden wspoldzielony stan audytorium siedza w `home-sections.tsx`.
 *
 * `revalidate` ZOSTAJE: trasa musi byc preranderowana, bo profil CSP tras
 * publicznych (`next.config.ts`) nie ma nonce, a nonce w zapisanym HTML byloby
 * stale, czyli bezwartosciowe. Bramka `tests/e2e/naglowki-bezpieczenstwa.spec.ts`
 * mierzy to wprost ("trasy publiczne nie dostaja nonce, bo sa preranderowane").
 * Dlatego strona glowna NIE wydaje tokenu formularza i nie hostuje formularza
 * zgloszenia — odstepstwo opisane w `home-sections.tsx`.
 *
 * Wyroznione bierzemy wylacznie z `is_featured`, maksymalnie cztery (wzorzec ma
 * tu siatke 4-kolumnowa). Wzorzec dopelnia brakujace miejsca szkoleniami
 * NIEwyroznionymi, zeby zawsze bylo ich cztery — tego nie przenosimy: sekcja
 * nazywa sie "Wyróżnione szkolenia", wiec nie moze pokazywac pozycji, ktorych
 * administrator nie wyroznil. Gdy nie ma zadnej, sekcja ma stan pusty.
 */
export default async function Home() {
  const [categories, trainings] = await Promise.all([
    getCategories(),
    getTrainings(),
  ]);
  const featured = trainings
    .filter((training) => training.is_featured)
    .slice(0, 4);

  return (
    <main>
      <HomeSections categories={categories} featured={featured} />
    </main>
  );
}
