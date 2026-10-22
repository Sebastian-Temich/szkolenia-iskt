import { ICON_SHAPES, type IconName, type IconShape } from "./icon-shapes";

export type { IconName };

type Props = {
  name: IconName;
  /** Krawedz kwadratu w px. Wzorzec uzywa 14–24; `stroke` nie skaluje sie z rozmiarem. */
  size?: number;
  className?: string;
  /**
   * Nazwa dostepna. Podana — ikona staje sie `role="img"` z `aria-label`.
   * Pominieta — ikona jest `aria-hidden`, czyli dekoracja obok tekstu.
   *
   * To NIE jest `title`: `title` na SVG daje tooltip myszki, ktorego czytnik
   * ekranu nie zawsze oglosi, a klawiatura nie zobaczy nigdy. Wzorzec opiera
   * sie wlasnie na `title` (ISK-399 / M1 punkt 5) — tego nie odtwarzamy.
   */
  label?: string;
};

function shape(item: IconShape, key: number) {
  switch (item.tag) {
    case "path":
      return <path key={key} d={item.d} />;
    case "circle":
      return <circle key={key} cx={item.cx} cy={item.cy} r={item.r} />;
    case "rect":
      return (
        <rect
          key={key}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          rx={item.rx}
          ry={item.ry}
        />
      );
    case "line":
      return (
        <line key={key} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} />
      );
  }
}

/**
 * Ikona z zestawu bundlowanego w repozytorium (`icon-shapes.ts`).
 *
 * `stroke="currentColor"` i `fill="none"` oznaczaja, ze kolor ikony bierze sie
 * z `color` rodzica — dzieki temu `IconChip`, `Button` i `Badge` nie musza
 * ustawiac koloru ikony osobno, a kontrast liczy sie raz, dla tekstu i ikony
 * jednoczesnie.
 *
 * `focusable="false"` jest tu dla starszego Edge/IE, ktore wstawialy SVG do
 * kolejnosci Tab — niewidoczny przystanek w nawigacji klawiatura.
 */
export function Icon({ name, size = 20, className, label }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {ICON_SHAPES[name].map(shape)}
    </svg>
  );
}
