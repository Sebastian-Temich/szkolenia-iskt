import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { getPublicEnv, shouldPrerenderWithoutData } from "@/lib/env";

function publicClient() {
  const env = getPublicEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

const cachedTrainings = unstable_cache(
  async () => {
    const { data } = await publicClient()
      .from("trainings")
      .select(
        "id,title,slug,summary,level,duration_hours,price_net_pln,categories(name)",
      )
      .order("sort_order");
    return data ?? [];
  },
  ["published-trainings"],
  { revalidate: 3600, tags: ["catalog"] },
);

const cachedTrainers = unstable_cache(
  async () => {
    const { data } = await publicClient()
      .from("trainers")
      .select("id,full_name,slug,headline,bio,photo_url")
      .order("sort_order");
    return data ?? [];
  },
  ["published-trainers"],
  { revalidate: 3600, tags: ["catalog"] },
);

/**
 * Build bez konfiguracji publicznej omija cache świadomie: pusta powłoka nie
 * może trafić do cache danych ISR, bo przetrwałaby pierwsze żądania na
 * poprawnie skonfigurowanym środowisku.
 */
export async function getPublishedTrainings() {
  if (shouldPrerenderWithoutData()) return [];
  return cachedTrainings();
}

export async function getPublishedTrainers() {
  if (shouldPrerenderWithoutData()) return [];
  return cachedTrainers();
}
