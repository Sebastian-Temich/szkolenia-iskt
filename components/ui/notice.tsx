import type { ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export type NoticeTone = "success" | "error" | "info";

/**
 * Tylko potwierdzenie ma ikone domyslna — tak jak we wzorcu (`circle-check`
 * w pasku flash panelu). Zestaw nie ma znaku ostrzezenia ani bledu, a wstawic
 * tu `mail-x` czy `shield-check` tylko po to, zeby "cos bylo", znaczyloby
 * nadac komunikatowi znaczenie, ktorego ikona nie niesie. Ton bledu nosi
 * kolor i tekst; ikone mozna podac jawnie, gdy widok ma na nia sensowna nazwe.
 */
const DEFAULT_ICON: Record<NoticeTone, IconName | null> = {
  success: "circle-check",
  error: null,
  info: null,
};

type Props = {
  tone?: NoticeTone;
  /** Ikona wiodaca. `null` wylacza ja calkiem. */
  icon?: IconName | null;
  children: ReactNode;
  className?: string;
};

/**
 * Komunikat o wyniku operacji — potwierdzenie wyslania, blad zapisu, nota.
 *
 * `role="status"` + `aria-live="polite"` sa tu ZAWSZE. Wzorzec renderuje
 * zwykly `div`, wiec po wyslaniu formularza czytnik ekranu nie oglasza nic:
 * uzytkownik niewidzacy nie wie, czy zgloszenie poszlo (ISK-399 / M1 punkt 5).
 *
 * UWAGA przy uzyciu: zeby `aria-live` zadzialalo, region musi byc w drzewie
 * ZANIM pojawi sie tresc. Komponent wstawiony do DOM razem z komunikatem
 * czesto nie zostanie ogloszony. W widokach trzymamy wiec kontener na stale
 * i podajemy `children` warunkowo — tak samo jak `Field` robi z bledem pola.
 *
 * `tone="error"` nie uzywa `role="alert"` swiadomie: `alert` przerywa biezaca
 * wypowiedz czytnika, co przy bledzie walidacji pola kasuje uzytkownikowi
 * informacje o polu, w ktorym wlasnie jest.
 */
export function Notice({ tone = "info", icon, children, className }: Props) {
  const name = icon === null ? null : (icon ?? DEFAULT_ICON[tone]);

  return (
    <div
      className={cx("ui-notice", `ui-notice-${tone}`, className)}
      role="status"
      aria-live="polite"
    >
      {name ? <Icon name={name} size={18} /> : null}
      <span>{children}</span>
    </div>
  );
}
