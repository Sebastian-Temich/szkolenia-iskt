/**
 * Nazwa pola potwierdzenia usuniecia (ISK-364 / B6). Lezy poza modulem
 * `"use server"`, bo plik akcji serwerowych moze eksportowac wylacznie funkcje
 * asynchroniczne — stala musi byc wspoldzielona osobno, zeby klient i serwer
 * mowily o tym samym polu.
 */
export const CONFIRM_DELETE_FIELD = "confirmDeleteId";

/**
 * Jedyne zrodlo prawdy o tym, czy zadanie usuniecia bylo potwierdzone.
 * Potwierdzenie nosi identyfikator pozycji, nie samo `true`: dzieki temu
 * potwierdzenie z jednego wiersza nie moze usunac innego, a brakujace lub
 * niezgodne pole nie przechodzi.
 */
export function isDeleteConfirmed(
  formData: FormData | null | undefined,
  id: string,
): boolean {
  const value = formData?.get(CONFIRM_DELETE_FIELD);
  return typeof value === "string" && value === id;
}
