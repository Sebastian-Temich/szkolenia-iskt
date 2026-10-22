"use client";

import { useFormStatus } from "react-dom";

import { Icon } from "@/components/ui";

/**
 * Przycisk wysylajacy formularz panelu ze stanem `pending` (ISK-402 / M3).
 *
 * Formularze panelu renderuja sie na SERWERZE (edytor szkolenia, trenera,
 * kategorii, notatka zgloszenia), wiec nie maja `useActionState`. `pending`
 * bierzemy z `useFormStatus`, ktory czyta stan NAJBLIZSZEGO formularza —
 * dlatego ten komponent musi stac wewnatrz `<form>`, nie obok niego.
 *
 * Powod istnienia: formularz wzorca (i nasz do tej pory) da sie wyslac
 * dowolna liczbe razy, bo nic nie blokuje przycisku po pierwszym klikniecieciu.
 * Przy `saveTraining` oznacza to dwa rownolegle RPC `save_training` na tym
 * samym wierszu. `disabled` + `aria-busy` zamyka to w jednym miejscu dla
 * wszystkich formularzy panelu.
 */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: string;
  /** Napis na czas wysylki; domyslnie „Zapisywanie…". */
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="panel-button"
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? (
        (pendingLabel ?? "Zapisywanie…")
      ) : (
        <>
          <Icon name="check" size={18} />
          {children}
        </>
      )}
    </button>
  );
}
