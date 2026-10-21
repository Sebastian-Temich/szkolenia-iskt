// Provisioning danych do dowodu "szkic nie jest publicznie dostepny".
//
// Seed demonstracyjny E2 zawiera wylacznie szkolenia opublikowane, wiec test
// wchodzacy na wymyslony slug dowodzilby tylko tego, ze nieistniejacy rekord
// daje 404 — a nie tego, ze 404 dostaje realny, nieopublikowany wiersz. Tutaj
// zakladamy taki wiersz kluczem service_role (wylacznie lokalny stack) i
// usuwamy go po tescie.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SETUP_HINT =
  "Dowod 404 dla szkicu wymaga lokalnego stacku Supabase: ustaw NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (patrz docs/runbook/lokalne-uruchomienie.md).";

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.API_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(SETUP_HINT);
  return createClient(url, key, { auth: { persistSession: false } });
}

export type DraftTraining = { slug: string; remove: () => Promise<void> };

export async function createDraftTraining(): Promise<DraftTraining> {
  const service = serviceClient();
  const category = await service
    .from("categories")
    .select("id")
    .limit(1)
    .single();
  if (category.error)
    throw new Error(`${SETUP_HINT} (${category.error.message})`);

  const slug = `e2e-szkic-nieopublikowany-${Date.now()}`;
  const inserted = await service
    .from("trainings")
    .insert({
      slug,
      title: "[TEST] Szkic nieopublikowany",
      summary: "Rekord testowy: nie moze byc widoczny publicznie.",
      category_id: category.data.id,
      is_published: false,
      published_at: null,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);

  const id = inserted.data.id;
  return {
    slug,
    remove: async () => {
      await service.from("trainings").delete().eq("id", id);
    },
  };
}
