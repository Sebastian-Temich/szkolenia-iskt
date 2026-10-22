/**
 * ISK-400 — fundament UI wzorca ISKT Greenovation.
 *
 * Jedno wejscie dla widokow: `import { Button, Card } from "@/components/ui"`.
 * Styl kazdego komponentu siedzi w `@layer components` w `app/globals.css`
 * pod prefiksem `ui-`; tutaj jest tylko struktura, semantyka i dostepnosc.
 *
 * API i decyzje projektowe: `docs/design-system.md`.
 */

export { cx } from "./cx";

export { Icon, type IconName } from "./icon";
export { ICON_NAMES, ICON_SHAPES, type IconShape } from "./icon-shapes";

export {
  Button,
  IconButton,
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./button";

export { Card, cardClassName, type CardPadding, type CardTone } from "./card";
export { Badge, type BadgeTone } from "./badge";
export { IconChip, type IconChipSize, type IconChipTone } from "./icon-chip";

export { Eyebrow, SectionHeading, SubsectionTitle } from "./section-heading";
export { PageHeader } from "./page-header";

export {
  Checkbox,
  Field,
  Input,
  SearchInput,
  Select,
  Textarea,
  fieldDescribedBy,
} from "./field";

export { SegmentedControl, type SegmentedOption } from "./segmented-control";
export { FilterPillToggle, filterPillClassName } from "./filter-pill";

// Warianty nawigacyjne — jedyne miejsce w tej warstwie, ktore zna `next/link`.
export { ButtonLink, CardLink, FilterPillLink } from "./links";
export { Notice, type NoticeTone } from "./notice";
