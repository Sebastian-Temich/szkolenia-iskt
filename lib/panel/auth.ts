import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function getPanelAccess() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return { status: "anonymous" as const, supabase };
  }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!admin) {
    return { status: "forbidden" as const, supabase, userId };
  }

  return { status: "admin" as const, supabase, userId };
}

export async function requireAdmin() {
  const access = await getPanelAccess();
  if (access.status === "anonymous") redirect("/panel/logowanie");
  if (access.status === "forbidden") redirect("/panel/brak-dostepu");
  return access;
}
