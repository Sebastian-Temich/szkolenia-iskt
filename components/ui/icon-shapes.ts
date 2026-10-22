/**
 * ISK-400 — ksztalty ikon, plik wygenerowany. NIE edytowac pojedynczych
 * sciezek recznie: dane powstaly mechanicznie z `lucide-static@1.61.0`
 * (licencja ISC), a zestaw nazw pochodzi z wzorca ISKT Greenovation.
 *
 * Dlaczego dane w repozytorium, a nie biblioteka ikon:
 * wzorzec pobiera kazda ikone z `unpkg.com/lucide-static` w runtime
 * (`fetch` + `dangerouslySetInnerHTML`). Granice ISK-399 zabraniaja i nowego
 * CDN-a (to nowy procesor w `docs/zgodnosc/procesorzy.md`), i nowej zaleznosci
 * zewnetrznej. Caly zestaw to kilka kB danych, wiec bundlujemy same ksztalty:
 * zero sieci w runtime i w czasie builda, zero pozycji w `package.json`
 * i pelna kontrola nad tym, co trafia do DOM.
 *
 * Ksztalty sa rozlozone na liste elementow, a nie trzymane jako napis HTML,
 * zeby `Icon` sklejal je przez `createElement`. `dangerouslySetInnerHTML` nie
 * pojawia sie w drzewie w ogole — nawet dla danych uznanych za zaufane.
 *
 * Geometria zaklada `viewBox="0 0 24 24"` i kreske `stroke-width: 2`
 * z `stroke-linecap/linejoin: round`. Ustawia je `Icon`, nie te dane, dlatego
 * zmiana rozmiaru ikony NIE zmienia grubosci kreski (tak samo jak we wzorcu).
 */

export type IconShape =
  | { tag: "path"; d: string }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | {
      tag: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      ry?: number;
    }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number };

export const ICON_SHAPES = {
  // Zestaw publiczny — ISK-400 punkt 3, kolejnosc z karty.
  "arrow-right": [
    { tag: "path", d: "M5 12h14" },
    { tag: "path", d: "m12 5 7 7-7 7" },
  ],
  "arrow-left": [
    { tag: "path", d: "m12 19-7-7 7-7" },
    { tag: "path", d: "M19 12H5" },
  ],
  check: [{ tag: "path", d: "M20 6 9 17l-5-5" }],
  cpu: [
    { tag: "path", d: "M12 20v2" },
    { tag: "path", d: "M12 2v2" },
    { tag: "path", d: "M17 20v2" },
    { tag: "path", d: "M17 2v2" },
    { tag: "path", d: "M2 12h2" },
    { tag: "path", d: "M2 17h2" },
    { tag: "path", d: "M2 7h2" },
    { tag: "path", d: "M20 12h2" },
    { tag: "path", d: "M20 17h2" },
    { tag: "path", d: "M20 7h2" },
    { tag: "path", d: "M7 20v2" },
    { tag: "path", d: "M7 2v2" },
    { tag: "rect", x: 4, y: 4, width: 16, height: 16, rx: 2 },
    { tag: "rect", x: 8, y: 8, width: 8, height: 8, rx: 1 },
  ],
  leaf: [
    {
      tag: "path",
      d: "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20",
    },
    {
      tag: "path",
      d: "M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13",
    },
  ],
  languages: [
    { tag: "path", d: "m5 8 6 6" },
    { tag: "path", d: "m4 14 6-6 2-3" },
    { tag: "path", d: "M2 5h12" },
    { tag: "path", d: "M7 2h1" },
    { tag: "path", d: "m22 22-5-10-5 10" },
    { tag: "path", d: "M14 18h6" },
  ],
  "code-xml": [
    { tag: "path", d: "m18 16 4-4-4-4" },
    { tag: "path", d: "m6 8-4 4 4 4" },
    { tag: "path", d: "m14.5 4-5 16" },
  ],
  "flask-conical": [
    {
      tag: "path",
      d: "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2",
    },
    { tag: "path", d: "M6.453 15h11.094" },
    { tag: "path", d: "M8.5 2h7" },
  ],
  "graduation-cap": [
    {
      tag: "path",
      d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
    },
    { tag: "path", d: "M22 10v6" },
    { tag: "path", d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" },
  ],
  "building-2": [
    { tag: "path", d: "M10 12h4" },
    { tag: "path", d: "M10 8h4" },
    { tag: "path", d: "M14 21v-3a2 2 0 0 0-4 0v3" },
    {
      tag: "path",
      d: "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
    },
    { tag: "path", d: "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" },
  ],
  clock: [
    { tag: "circle", cx: 12, cy: 12, r: 10 },
    { tag: "path", d: "M12 6v6l4 2" },
  ],
  monitor: [
    { tag: "rect", x: 2, y: 3, width: 20, height: 14, rx: 2 },
    { tag: "line", x1: 8, y1: 21, x2: 16, y2: 21 },
    { tag: "line", x1: 12, y1: 17, x2: 12, y2: 21 },
  ],
  gauge: [
    { tag: "path", d: "m12 14 4-4" },
    { tag: "path", d: "M3.34 19a10 10 0 1 1 17.32 0" },
  ],
  calendar: [
    { tag: "path", d: "M8 2v3" },
    { tag: "path", d: "M16 2v3" },
    { tag: "rect", x: 3, y: 3, width: 18, height: 18, rx: 2 },
    { tag: "path", d: "M3 9h18" },
  ],
  search: [
    { tag: "path", d: "m21 21-4.34-4.34" },
    { tag: "circle", cx: 11, cy: 11, r: 8 },
  ],
  "clipboard-list": [
    { tag: "rect", x: 8, y: 2, width: 8, height: 4, rx: 1, ry: 1 },
    {
      tag: "path",
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    },
    { tag: "path", d: "M12 11h4" },
    { tag: "path", d: "M12 16h4" },
    { tag: "path", d: "M8 11h.01" },
    { tag: "path", d: "M8 16h.01" },
  ],
  "book-open": [
    { tag: "path", d: "M12 5v16" },
    {
      tag: "path",
      d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
    },
  ],
  award: [
    {
      tag: "path",
      d: "m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",
    },
    { tag: "circle", cx: 12, cy: 8, r: 6 },
  ],
  target: [
    { tag: "circle", cx: 12, cy: 12, r: 10 },
    { tag: "circle", cx: 12, cy: 12, r: 6 },
    { tag: "circle", cx: 12, cy: 12, r: 2 },
  ],
  layers: [
    {
      tag: "path",
      d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
    },
    {
      tag: "path",
      d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
    },
    {
      tag: "path",
      d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
    },
  ],
  handshake: [
    { tag: "path", d: "m11 17 2 2a1 1 0 1 0 3-3" },
    {
      tag: "path",
      d: "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4",
    },
    { tag: "path", d: "m21 3 1 11h-2" },
    { tag: "path", d: "M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" },
    { tag: "path", d: "M3 4h8" },
  ],
  "trending-up": [
    { tag: "path", d: "M16 7h6v6" },
    { tag: "path", d: "m22 7-8.5 8.5-5-5L2 17" },
  ],
  banknote: [
    { tag: "rect", x: 2, y: 6, width: 20, height: 12, rx: 2 },
    { tag: "circle", cx: 12, cy: 12, r: 2 },
    { tag: "path", d: "M6 12h.01M18 12h.01" },
  ],
  wallet: [
    {
      tag: "path",
      d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    },
    { tag: "path", d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" },
  ],
  "shield-check": [
    {
      tag: "path",
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    },
    { tag: "path", d: "m9 12 2 2 4-4" },
  ],
  mail: [
    { tag: "path", d: "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" },
    { tag: "rect", x: 2, y: 4, width: 20, height: 16, rx: 2 },
  ],
  phone: [
    {
      tag: "path",
      d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
    },
  ],
  "map-pin": [
    {
      tag: "path",
      d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    },
    { tag: "circle", cx: 12, cy: 10, r: 3 },
  ],
  lock: [
    { tag: "rect", x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 },
    { tag: "path", d: "M7 11V7a5 5 0 0 1 10 0v4" },
  ],
  // Panel. Wzorzec ich uzywa (akcje w tabelach, wylogowanie,
  // potwierdzenia, statusy zgloszen), ale lista na ISK-400 je pominela.
  // Dodane tu, zeby M3 nie musial wracac do warstwy fundamentu.
  plus: [
    { tag: "path", d: "M5 12h14" },
    { tag: "path", d: "M12 5v14" },
  ],
  pencil: [
    {
      tag: "path",
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    },
    { tag: "path", d: "m15 5 4 4" },
  ],
  "trash-2": [
    { tag: "path", d: "M10 11v6" },
    { tag: "path", d: "M14 11v6" },
    { tag: "path", d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" },
    { tag: "path", d: "M3 6h18" },
    { tag: "path", d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" },
  ],
  eye: [
    {
      tag: "path",
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    },
    { tag: "circle", cx: 12, cy: 12, r: 3 },
  ],
  "log-out": [
    { tag: "path", d: "m16 17 5-5-5-5" },
    { tag: "path", d: "M21 12H9" },
    { tag: "path", d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" },
  ],
  "rotate-ccw": [
    { tag: "path", d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" },
    { tag: "path", d: "M3 3v5h5" },
  ],
  "circle-check": [
    { tag: "circle", cx: 12, cy: 12, r: 10 },
    { tag: "path", d: "m16 9-5.5 5.5L8 12" },
  ],
  "mail-check": [
    {
      tag: "path",
      d: "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8",
    },
    { tag: "path", d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" },
    { tag: "path", d: "m16 19 2 2 4-4" },
  ],
  "mail-x": [
    {
      tag: "path",
      d: "M22 12.532V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8.792",
    },
    { tag: "path", d: "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" },
    { tag: "path", d: "m16.5 16.5 5 5" },
    { tag: "path", d: "m21.5 16.5-5 5" },
  ],
  // Brak we wzorcu: `Select` ma `appearance: none` i rysuje wlasna
  // strzalke glifem `\u25be` z kroju tekstowego. Glif nie skaluje sie z ikonami
  // i bierze metryki fontu, wiec zastepujemy go ikona z tego samego zestawu.
  "chevron-down": [{ tag: "path", d: "m6 9 6 6 6-6" }],
} as const satisfies Record<string, readonly IconShape[]>;

/** Nazwy ikon dostepne w aplikacji. Zamkniety zbior — literowka to blad typu. */
export type IconName = keyof typeof ICON_SHAPES;

/** Nazwy w kolejnosci alfabetycznej. Uzywane przez test kompletnosci zestawu. */
export const ICON_NAMES: readonly IconName[] = (
  Object.keys(ICON_SHAPES) as IconName[]
).sort();
