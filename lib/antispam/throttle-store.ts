import type { SupabaseClient } from "@supabase/supabase-js";

import type { ThrottleOutcome, ThrottleStore } from "@/lib/antispam/throttle";

// Magazyn limitu czestosci oparty o tabele `form_submission_throttle` (service_role).
// Zadnych polityk RLS dla rol klienckich — zapis/odczyt wylacznie warstwa serwerowa.

export function createSupabaseThrottleStore(client: SupabaseClient): ThrottleStore {
  return {
    async countAcceptedSince(clientHash, since) {
      const { count, error } = await client
        .from("form_submission_throttle")
        .select("id", { count: "exact", head: true })
        .eq("client_hash", clientHash)
        .eq("outcome", "accepted")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async record(clientHash: string, outcome: ThrottleOutcome, at: Date) {
      const { error } = await client.from("form_submission_throttle").insert({
        client_hash: clientHash,
        outcome,
        created_at: at.toISOString(),
      });
      if (error) throw error;
    },
  };
}
