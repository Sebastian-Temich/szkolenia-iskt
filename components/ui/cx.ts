/**
 * Sklejanie nazw klas. `false`, `null` i `undefined` wypadaja, zeby warunek
 * dal sie zapisac jako `cond && "klasa"` bez `"false"` w atrybucie.
 *
 * Pusty wynik zwraca `undefined`, nie `""`: React pomija wtedy atrybut
 * `class` w ogole, a nie renderuje `class=""`. Ma to znaczenie dla testow,
 * ktore asertuja na napisie HTML.
 */
export function cx(
  ...parts: readonly (string | false | null | undefined)[]
): string | undefined {
  const joined = parts.filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}
