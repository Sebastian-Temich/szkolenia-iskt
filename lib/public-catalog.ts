import { createClient } from "@supabase/supabase-js";

import { unaccentPl } from "@/lib/catalog";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /**
   * Nazwa ikony obszaru. Kolumna istnieje od migracji E2 i jest wypelniona
   * w zasiewie (`cpu`, `leaf`, `languages`, `code`, `flask`), ale do ISK-401
   * nie czytal jej ani jeden widok — sekcja "Obszary" rysowala numer
   * porzadkowy. Zestaw ikon nie zna nazw `code` ani `flask`, wiec mapowanie
   * robi `lib/category-icon.ts`, a nie baza: przezwanie ikony w zestawie nie
   * moze wymagac migracji.
   */
  icon: string | null;
};

export type Trainer = {
  id: string;
  slug: string;
  full_name: string;
  headline: string | null;
  bio: string | null;
  competences: string[];
  photo_url: string | null;
};

export type ProgramSection = { title: string; items: string[] };

export type Training = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string | null;
  category_id: string;
  category: Category | null;
  level: string | null;
  duration_hours: number | null;
  /**
   * Cena katalogowa netto. Kolumna (`numeric(10,2)`) byla pobierana od E2 —
   * zapytania ponizej selektuja `*` — ale nie bylo jej w tym typie, wiec
   * zaden widok nie mial jak jej pokazac. PostgREST serializuje `numeric`
   * jako liczbe JSON; `formatPriceNet()` i tak przyjmuje tez napis, bo to
   * zachowanie zalezy od wersji PostgREST, a nie od naszego kontraktu.
   *
   * ISK-399 / D1: cena to WYLACZNIE ta wartosc. Wzorzec liczy "pelna x 0.2"
   * i formatuje cene jako napis w danych prototypu — tego nie przenosimy.
   */
  price_net_pln: number | string | null;
  funding_available: boolean;
  funding_note: string | null;
  program: ProgramSection[];
  learning_outcomes: string[];
  target_audience: string | null;
  terms_note: string | null;
  is_featured: boolean;
  is_published: boolean;
  seo_title: string | null;
  seo_description: string | null;
  trainers: Trainer[];
};

export const MISSING_PUBLIC_CONFIG =
  "Brak publicznej konfiguracji Supabase (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) — patrz docs/runbook/lokalne-uruchomienie.md.";

/**
 * `npm run build` w bramce `quality` biegnie bez kluczy Supabase (kontrakt: całe CI
 * bez sekretów), więc prerender bez konfiguracji daje pusty katalog. Poza fazą
 * builda brak konfiguracji jest błędem — głośnym, żeby strona nigdy nie udawała,
 * że katalog jest po prostu pusty.
 */
function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    return createClient(url, key, { auth: { persistSession: false } });
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return null;
  }
  throw new Error(MISSING_PUBLIC_CONFIG);
}

/**
 * Kolejnosc prowadzacych.
 *
 * `training_trainers.sort_order` istnieje od migracji E2, ale embed go nie
 * pobieral i nie sortowal — PostgREST zwracal wiersze w kolejnosci, ktora nie
 * jest czescia kontraktu, wiec karta "Prowadzacy" na szczegole szkolenia
 * ustawiala ludzi losowo miedzy odpowiedziami. Sortujemy po stronie klienta,
 * a nie przez `order({ referencedTable })`, bo ta sama funkcja mapujaca
 * obsluguje `getTrainings` i `getTraining`, a sortowanie po stronie klienta
 * da sie przetestowac jednostkowo bez bazy.
 *
 * `sort_order` rowne u dwoch osob jest w bazie dopuszczalne, wiec remis
 * rozstrzyga `full_name` lokalnie — inaczej kolejnosc znow bylaby zalezna od
 * zapytania.
 */
export type TrainerLink = {
  sort_order: number | null;
  trainer: Trainer | null;
};

/**
 * Wyeksportowana osobno, zeby dala sie przetestowac jednostkowo bez bazy —
 * `mapTraining` jest wewnetrzne i dostepne tylko przez zapytanie.
 */
export function orderTrainerLinks(links: TrainerLink[]): Trainer[] {
  return links
    .filter((link): link is TrainerLink & { trainer: Trainer } =>
      Boolean(link.trainer),
    )
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.trainer.full_name.localeCompare(b.trainer.full_name, "pl"),
    )
    .map((link) => link.trainer);
}

function mapTraining(row: Record<string, unknown>): Training {
  return {
    ...(row as unknown as Omit<Training, "trainers">),
    program: (row.program ?? []) as ProgramSection[],
    learning_outcomes: (row.learning_outcomes ?? []) as string[],
    trainers: orderTrainerLinks((row.training_trainers ?? []) as TrainerLink[]),
  };
}

export async function getCategories(): Promise<Category[]> {
  const client = publicClient();
  if (!client) return [];
  const { data, error } = await client
    .from("categories")
    .select("id,slug,name,description,icon")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw new Error("Nie udało się pobrać kategorii.");
  return data as Category[];
}

export async function getTrainings(
  filters: { category?: string; q?: string } = {},
) {
  const client = publicClient();
  if (!client) return [] as Training[];

  let query = client
    .from("trainings")
    .select(
      "*,category:categories!inner(id,slug,name,description,icon),training_trainers(sort_order,trainer:trainers(id,slug,full_name,headline,bio,competences,photo_url))",
    )
    .eq("is_published", true)
    .order("sort_order");
  if (filters.category) query = query.eq("categories.slug", filters.category);
  if (filters.q)
    query = query.textSearch("search_tsv", unaccentPl(filters.q), {
      config: "simple",
      type: "websearch",
    });
  const { data, error } = await query;
  if (error) throw new Error("Nie udało się pobrać katalogu szkoleń.");
  return (data as unknown as Record<string, unknown>[]).map(mapTraining);
}

export async function getTraining(slug: string): Promise<Training | null> {
  const client = publicClient();
  if (!client) return null;
  const { data, error } = await client
    .from("trainings")
    .select(
      "*,category:categories(id,slug,name,description,icon),training_trainers(sort_order,trainer:trainers(id,slug,full_name,headline,bio,competences,photo_url))",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw new Error("Nie udało się pobrać szkolenia.");
  return data ? mapTraining(data as unknown as Record<string, unknown>) : null;
}

export async function getTrainers(): Promise<Trainer[]> {
  const client = publicClient();
  if (!client) return [];
  const { data, error } = await client
    .from("trainers")
    .select("id,slug,full_name,headline,bio,competences,photo_url")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw new Error("Nie udało się pobrać trenerów.");
  return data as Trainer[];
}
