"use client";

import Link from "next/link";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Icon } from "@/components/ui";
import { CONFIRM_DELETE_FIELD } from "@/lib/panel/confirm-delete";

/**
 * Tab i Shift+Tab kraza wewnatrz pytania — pulapka fokusu, ktora dawal
 * `<dialog open>` z `showModal()`. Elementy czytamy z DOM w momencie
 * nacisniecia, zeby lista nie rozjechala sie z faktyczna trescia grupy.
 */
function trapTab(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"])',
    ),
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey ? active === first : active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

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
 *
 * ZAMKNIECIE FOKUSU — ODTWORZONE W ISK-414
 * Pierwsza wersja obslugiwala Escape na samej GRUPIE, a „Anuluj" byl w niej
 * ostatnim elementem fokusowalnym. Tab z „Anuluj" wychodzil wiec na „Edytuj"
 * nastepnego wiersza i zostawial wiersz A uzbrojony oraz nieodwolywalny
 * Escapem; dwa wiersze mogly byc uzbrojone naraz, czego `showModal()`
 * nie dopuszczal. Dokladamy trzy rzeczy, ktore `<dialog>` dawal gratis:
 *
 *  1. Tab i Shift+Tab KRAZA wewnatrz pytania (`trapTab`), wiec klawiatura
 *     nie wychodzi z uzbrojonego wiersza bez decyzji;
 *  2. Escape wisi na `document`, nie na grupie — dziala takze wtedy, gdy
 *     fokus zdazyl wyjsc (mysz, `focus()` z zewnatrz);
 *  3. przeniesienie fokusu POZA grupe wycofuje pytanie, wiec uzbrojony moze
 *     byc najwyzej jeden wiersz.
 *
 * Punkt 3 reaguje tylko na fokus, ktory ma konkretny nowy cel
 * (`relatedTarget`). Celowo NIE wycofujemy pytania, gdy fokus po prostu
 * przepada (`relatedTarget === null`): tak wyglada m.in. klikniecie przycisku
 * w przegladarce, ktora nie nadaje mu fokusu (Safari na macOS), a wycofanie
 * pytania na `mousedown` zabraloby wlasny przycisk „Tak, usun trwale" przed
 * dojsciem `click` — potwierdzone usuniecie przestaloby dzialac.
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
  /**
   * Czy po zamknieciu pytania oddac fokus przyciskowi „Usun".
   *
   * Tak JEST przy jawnej rezygnacji (Escape, „Anuluj") — przycisk, ktory
   * otworzyl pytanie, znika z drzewa, wiec klawiatura musi dostac z powrotem
   * swoje miejsce w tabeli. Tak NIE JEST, gdy pytanie wycofuje sie samo, bo
   * fokus wyszedl poza nie: wtedy oddanie fokusu ODEBRALOBY go elementowi,
   * na ktory uzytkownik wlasnie przeszedl (zmierzone: fokus wracal na „Usun"
   * wiersza A, a Enter na uzbrojonym wierszu B nie mial gdzie trafic).
   */
  const returnFocus = useRef(false);

  const cancel = () => {
    returnFocus.current = true;
    setConfirming(false);
  };

  useEffect(() => {
    // Pierwsze przejscie to zwykly montaz wiersza — nie kradniemy fokusu.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (confirming) {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  // Escape na `document`, nie na grupie: pytanie ma byc odwolywalne takze
  // wtedy, gdy fokus jest poza nim (patrz nota „ZAMKNIECIE FOKUSU" wyzej).
  useEffect(() => {
    if (!confirming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  if (confirming) {
    return (
      <div
        className="panel-confirm-inline"
        role="group"
        aria-label={`Potwierdzenie usunięcia: ${itemName}`}
        onKeyDown={trapTab}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          // Bez `returnFocus`: fokus zostaje tam, gdzie uzytkownik przeszedl.
          if (next && !event.currentTarget.contains(next)) setConfirming(false);
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
        <button ref={cancelRef} type="button" onClick={cancel}>
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
