import { createClient } from "@supabase/supabase-js";

import { unaccentPl } from "@/lib/catalog";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
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

function mapTraining(row: Record<string, unknown>): Training {
  const links = (row.training_trainers ?? []) as Array<{
    trainer: Trainer | null;
  }>;
  return {
    ...(row as unknown as Omit<Training, "trainers">),
    program: (row.program ?? []) as ProgramSection[],
    learning_outcomes: (row.learning_outcomes ?? []) as string[],
    trainers: links.map((link) => link.trainer).filter(Boolean) as Trainer[],
  };
}

export async function getCategories(): Promise<Category[]> {
  const client = publicClient();
  if (!client) return [];
  const { data, error } = await client
    .from("categories")
    .select("id,slug,name,description")
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
      "*,category:categories!inner(id,slug,name,description),training_trainers(trainer:trainers(id,slug,full_name,headline,bio,competences,photo_url))",
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
      "*,category:categories(id,slug,name,description),training_trainers(trainer:trainers(id,slug,full_name,headline,bio,competences,photo_url))",
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
