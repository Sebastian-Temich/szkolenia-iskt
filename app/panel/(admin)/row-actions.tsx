"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui";
import { CONFIRM_DELETE_FIELD } from "@/lib/panel/confirm-delete";

type Props = {
  /** Adres edytora pozycji. */
  editHref: string;
  /** Akcja publikacji/wycofania z dowiazanymi `kind`, `id` i stanem docelowym. */
  publishAction: (formData: FormData) => void | Promise<void>;
  published: boolean;
  /** Akcja usuniecia z dowiazanymi `kind` i `id` — przyjmuje `FormData`. */
  deleteAction: (formData: FormData) => void | Promise<void>;
  /** Identyfikator pozycji; trafia do pola potwierdzenia. */
  itemId: string;
  /** Nazwa pozycji pokazywana w pytaniu — administrator ma wiedziec, co usuwa. */
  itemName: string;
  /** Rzeczownik w bierniku, np. „szkolenie", „trenera". */
  itemKindLabel: string;
};

/**
 * Rzad akcji wiersza: edycja, publikacja, usuniecie (ISK-402 / M3).
 *
 * POTWIERDZENIE JEST INLINE, BEZ MODALA
 * Wzorzec nie ma w panelu ani jednego modala — pierwsze klikniecie „Usun"
 * podmienia caly rzad przyciskow na pytanie w tym samym miejscu wiersza.
 * Wczesniej bylo tu natywne `<dialog>` z `showModal()` (ISK-364 / B6);
 * zamiana pociagnela za soba cztery przypadki `getByRole("dialog")`
 * w `tests/e2e/ux-blockers.spec.ts`.
 *
 * CZEGO TA ZAMIANA NIE ZMIENIA
 * Wymogu po stronie SERWERA. `deleteCatalogItem` dalej odrzuca zadanie bez
 * pola `confirmDeleteId` rownego `id` wiersza, wiec pominiecie pytania
 * (skrypt, wylaczony JavaScript, recznie zlozone zadanie) nadal nic nie
 * usuwa, a potwierdzenie z jednego wiersza nie usunie innego. Potwierdzenie
 * nie jest ozdoba UI — zmienil sie tylko sposob zadania pytania.
 *
 * CO TRZEBA BYLO DOPISAC RECZNIE
 * `<dialog>` dawal gratis zamkniecie Escape i pulapke fokusu. Przy
 * potwierdzeniu inline obsluge klawisza i przeniesienie fokusu robimy sami:
 * po otwarciu fokus idzie na „Anuluj" (nie na przycisk niszczacy), po
 * wycofaniu wraca na „Usun". Bez tego Escape nie mialby gdzie trafic —
 * przycisk, ktory wywolal pytanie, znika z drzewa.
 */
export function RowActions({
  editHref,
  publishAction,
  published,
  deleteAction,
  itemId,
  itemName,
  itemKindLabel,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    // Pierwsze przejscie to zwykly montaz wiersza — nie kradniemy fokusu.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (confirming) cancelRef.current?.focus();
    else triggerRef.current?.focus();
  }, [confirming]);

  if (confirming) {
    return (
      <div
        className="panel-confirm-inline"
        role="group"
        aria-label={`Potwierdzenie usunięcia: ${itemName}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") setConfirming(false);
        }}
      >
        <p className="panel-confirm-text">
          Usunąć {itemKindLabel} <strong>{itemName}</strong>? Tej operacji nie
          można cofnąć.
        </p>
        <form action={deleteAction}>
          <input
            type="hidden"
            name={CONFIRM_DELETE_FIELD}
            value={itemId}
            readOnly
          />
          <button type="submit" className="danger">
            Tak, usuń trwale
          </button>
        </form>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => setConfirming(false)}
        >
          Anuluj
        </button>
      </div>
    );
  }

  return (
    <div className="panel-actions panel-actions-end">
      {/* Edycja zostaje LINKIEM, nie icon-buttonem z `onClick`: prowadzi do
          osobnej trasy, wiec musi dac sie otworzyc w nowej karcie. Nazwa
          dostepna idzie przez `aria-label` — wzorzec uzywa tu `title`. */}
      <Link className="panel-icon-action" href={editHref} aria-label="Edytuj">
        <Icon name="pencil" size={16} />
      </Link>
      {/* „Publikuj"/„Wycofaj" zostaje przyciskiem TEKSTOWYM. Wzorzec nie ma
          w ogole pojecia publikacji, wiec nie ma tu czego odtwarzac, a ikona
          dla operacji zmieniajacej widocznosc pozycji na publicznej stronie
          jest dwuznaczna — stan („Opublikowane"/„Szkic") i operacja musza
          czytac sie wprost. */}
      <form action={publishAction}>
        <button type="submit">{published ? "Wycofaj" : "Publikuj"}</button>
      </form>
      <button
        ref={triggerRef}
        type="button"
        className="panel-icon-action is-danger"
        aria-label="Usuń"
        onClick={() => setConfirming(true)}
      >
        <Icon name="trash-2" size={16} />
      </button>
    </div>
  );
}
