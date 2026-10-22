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

  /**
   * Adres konta — do pigulki konta w naglowku panelu (ISK-402 / M3).
   * Wzorzec ma w tym miejscu ZASZYTY w kliencie napis „admin@iskt.pl";
   * pokazujemy adres z faktycznej sesji, zeby administrator wiedzial, na
   * ktorym koncie pracuje, zanim cokolwiek opublikuje albo usunie.
   * Zadnego nowego zapytania: adres jest w tym samym zestawie roszczen, z
   * ktorego i tak czytamy `sub`. Jawne sprawdzenie typu, bo `claims` to
   * slownik `unknown` — brak adresu nie moze wylozyc powloki panelu.
   */
  const email =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : undefined;

  const { data: admin } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!admin) {
    return { status: "forbidden" as const, supabase, userId, email };
  }

  return { status: "admin" as const, supabase, userId, email };
}

export async function requireAdmin() {
  const access = await getPanelAccess();
  if (access.status === "anonymous") redirect("/panel/logowanie");
  if (access.status === "forbidden") redirect("/panel/brak-dostepu");
  return access;
}
