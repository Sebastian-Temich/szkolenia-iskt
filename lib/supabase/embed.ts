/**
 * PostgREST osadza relację do-jednego jako obiekt, ale typy generowane dla
 * supabase-js opisują ją jako tablicę. Bez normalizacji `?.[0]` zawsze daje
 * `undefined` i kolumna w interfejsie zostaje pusta.
 */
export function toOne<T>(embed: T | T[] | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed ?? null;
}
