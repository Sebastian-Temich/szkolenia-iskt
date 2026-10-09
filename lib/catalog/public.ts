import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { getPublicEnv } from "@/lib/env";

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

export const getPublishedTrainings = unstable_cache(
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

export const getPublishedTrainers = unstable_cache(
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
