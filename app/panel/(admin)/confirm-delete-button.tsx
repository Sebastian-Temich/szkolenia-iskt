"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CONFIRM_DELETE_FIELD } from "@/lib/panel/confirm-delete";

type Props = {
  /** Akcja serwerowa z dowiazanymi `kind` i `id` — przyjmuje `FormData`. */
  action: (formData: FormData) => void | Promise<void>;
  /** Identyfikator pozycji; trafia do pola potwierdzenia. */
  itemId: string;
  /** Nazwa pozycji pokazywana w pytaniu — administrator ma wiedziec, co usuwa. */
  itemName: string;
  /** Rzeczownik w bierniku, np. „szkolenie", „trenera". */
  itemKindLabel: string;
};

/**
 * Krok potwierdzenia przed nieodwracalnym usunieciem (ISK-364 / B6).
 *
 * Przed poprawka przycisk „Usun" stal w jednym rzedzie z „Wycofaj" i wysylal
 * akcje serwerowa wprost z `<form action=…>` — jedno nieuwazne klikniecie
 * trwale usuwalo pozycje katalogu. Teraz pierwsze klikniecie otwiera modalne
 * pytanie z nazwa pozycji; dopiero przycisk w pytaniu wysyla formularz.
 *
 * Uzywamy natywnego `<dialog>` z `showModal()`, bo tabela siedzi w kontenerze
 * z `overflow-x: auto` — zwykly popover byl by przyciety przy ostatnim
 * wierszu. Warstwa `top layer` nie podlega obcinaniu, a `<dialog>` daje
 * zamkniecie Escape i pulapke fokusu bez wlasnego kodu.
 *
 * Potwierdzenie nie jest wylacznie ozdoba UI: `deleteCatalogItem` odrzuca
 * zadanie bez pola `confirmDeleteId`, wiec pominiecie okienka (skrypt,
 * wylaczony JS, recznie zlozone zadanie) tez nic nie usuwa.
 */
export function ConfirmDeleteButton({
  action,
  itemId,
  itemName,
  itemKindLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <form action={action} className="panel-delete">
      <button
        ref={triggerRef}
        type="button"
        className="danger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Usuń
      </button>

      <dialog
        ref={dialogRef}
        className="panel-confirm"
        aria-labelledby={titleId}
        // Escape i klikniecie tla zamykaja dialog natywnie — synchronizujemy stan.
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
      >
        {/* Zawartosc renderujemy TYLKO przy otwartym pytaniu. Zamkniety
            `<dialog>` trzyma swoje dzieci w DOM, wiec nazwa pozycji
            wystepowalaby dwa razy na stronie (raz w wierszu tabeli, raz tutaj)
            — zapytania po tekscie trafialyby w dwa elementy. Przy okazji
            zamkniety formularz nie ma czym potwierdzic, wiec przypadkowe
            wyslanie (np. Enter w innym miejscu wiersza) nic nie usuwa. */}
        {open ? (
          <>
            <p className="panel-confirm-text" id={titleId}>
              Usunąć {itemKindLabel} <strong>{itemName}</strong>? Tej operacji
              nie można cofnąć.
            </p>
            <div className="panel-confirm-actions">
              <input
                type="hidden"
                name={CONFIRM_DELETE_FIELD}
                value={itemId}
                readOnly
              />
              <button type="submit" className="danger">
                Tak, usuń trwale
              </button>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                formNoValidate
              >
                Anuluj
              </button>
            </div>
          </>
        ) : null}
      </dialog>
    </form>
  );
}
