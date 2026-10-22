import { ICON_NAMES, type IconName } from "@/components/ui";

/**
 * `categories.icon` -> nazwa z zestawu `components/ui/icon-shapes.ts`.
 *
 * DLACZEGO MAPA, A NIE MIGRACJA
 * Kolumna `icon` jest wypelniona od zasiewu E2 nazwami z Lucide w wersji, ktora
 * byla aktualna wtedy (`code`, `flask`). Zestaw bundlowany w ISK-400 pochodzi
 * z `lucide-static@1.61.0`, gdzie te ikony nazywaja sie `code-xml`
 * i `flask-conical`. Przezwanie ikony u dostawcy nie moze wymagac migracji
 * bazy, wiec tlumaczenie siedzi w warstwie widoku.
 *
 * ISK-401 jest pierwszym miejscem, ktore te kolumne w ogole czyta — do tej pory
 * sekcja "Obszary" rysowala numer porzadkowy, a wypelniona kolumna lezala
 * martwa.
 */
const ALIASES: Record<string, IconName> = {
  code: "code-xml",
  flask: "flask-conical",
};

/** Ikona uzywana, gdy kolumna jest pusta albo wskazuje nazwe spoza zestawu. */
export const CATEGORY_ICON_FALLBACK: IconName = "layers";

/**
 * Nazwa ikony obszaru. Zawsze zwraca nazwe, ktora `Icon` potrafi narysowac —
 * nieznana wartosc w bazie (literowka administratora, nowa ikona u dostawcy)
 * nie moze wywalic calej sekcji, bo `Icon` dla nieznanej nazwy nie ma ksztaltu.
 */
export function categoryIconName(icon: string | null | undefined): IconName {
  if (!icon) return CATEGORY_ICON_FALLBACK;
  const key = icon.trim().toLowerCase();
  // `ALIASES[key]` jest `IconName | undefined` przy `noUncheckedIndexedAccess`,
  // wiec `key in ALIASES` nie zawezą typu — potrzebny jest odczyt do zmiennej.
  const alias = ALIASES[key];
  if (alias) return alias;
  return (ICON_NAMES as readonly string[]).includes(key)
    ? (key as IconName)
    : CATEGORY_ICON_FALLBACK;
}
