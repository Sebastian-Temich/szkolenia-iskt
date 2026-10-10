// Fabryki danych dla testow E2E. Wszystko fikcyjne: prefiks [TEST], adresy w
// domenie example.invalid, unikalne slugi — zeby nie kolidowac z seedem [DEMO]
// ani miedzy przebiegami (ADR-0005 D7).
import { randomUUID } from "node:crypto";

import { serviceClient } from "./stack";

export const sfx = () => randomUUID().slice(0, 8);

export type TrainingSeed = {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
  categoryName: string;
};

/** Pierwsza opublikowana kategoria z seeda [DEMO] — stabilny punkt zaczepienia dla filtra. */
export async function publishedCategory(): Promise<{
  id: string;
  name: string;
  slug: string;
}> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("categories")
    .select("id,name,slug")
    .eq("is_published", true)
    .order("sort_order")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function createTraining(opts: {
  published: boolean;
  categoryId?: string;
  titlePrefix?: string;
}): Promise<TrainingSeed> {
  const svc = serviceClient();
  const category = opts.categoryId
    ? { id: opts.categoryId, name: "", slug: "" }
    : await publishedCategory();
  const slug = `test-szkolenie-${sfx()}`;
  const title = `${opts.titlePrefix ?? "[TEST] Szkolenie"} ${slug}`;
  const { data, error } = await svc
    .from("trainings")
    .insert({
      slug,
      title,
      summary: "Fikcyjne szkolenie na potrzeby testow E2E.",
      description: "Opis fikcyjnego szkolenia na potrzeby testow E2E.",
      category_id: category.id,
      is_published: opts.published,
      published_at: opts.published ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    slug,
    title,
    categoryId: category.id,
    categoryName: category.name,
  };
}

export async function deleteTraining(id: string): Promise<void> {
  const svc = serviceClient();
  await svc.from("trainings").delete().eq("id", id);
}

/** Zgloszenie ze statusem `nowe` — punkt startowy sciezki D5.8. */
export async function createInquiry(): Promise<{ id: string; email: string }> {
  const svc = serviceClient();
  const email = `zgloszenie-${sfx()}@example.invalid`;
  const { data, error } = await svc
    .from("inquiries")
    .insert({
      kind: "osoba",
      full_name: `[TEST] Zglaszajacy ${sfx()}`,
      email,
      phone: "+48 600 000 000",
      // Wymagane przez CHECK `inquiries_has_subject`: zgloszenie musi wskazywac
      // albo konkretne szkolenie (`training_id`), albo obszar zainteresowania.
      interest_area: "[TEST] Obszar zainteresowania",
      message: "Fikcyjna tresc zgloszenia na potrzeby testow E2E.",
      rodo_ack: true,
      rodo_clause_version: "draft-2026-10",
      status: "nowe",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, email };
}

/**
 * Czysci licznik limitu czestosci. Bez tego trzy zgloszenia wyslane przez testy
 * formularza blokuja kolejny przebieg w oknie 10 minut (ADR-0004 §3 warstwa 3).
 */
export async function clearThrottle(): Promise<void> {
  const svc = serviceClient();
  await svc
    .from("form_submission_throttle")
    .delete()
    .gte("created_at", new Date(Date.now() - 25 * 60 * 60_000).toISOString());
}
