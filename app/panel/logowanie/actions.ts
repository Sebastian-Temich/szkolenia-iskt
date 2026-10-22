"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * `fieldErrors` dotyczy WYLACZNIE formatu pol (puste, niepoprawny adres).
 * Odmowa uwierzytelnienia zostaje komunikatem na poziomie formularza i NIE
 * mowi, ktore pole bylo zle — inaczej formularz stalby sie wyliczaczem
 * istniejacych kont. To rozroznienie jest celowe: „walidacja per-pole"
 * z karty ISK-402 dotyczy formatu, nie wyniku uwierzytelnienia.
 */
export type LoginState = {
  message: string;
  fieldErrors?: { email?: string; password?: string };
};

const loginSchema = z.object({
  email: z.email("Podaj adres e-mail w formacie nazwa@domena."),
  password: z.string().min(1, "Podaj hasło."),
});

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return {
      message: "",
      fieldErrors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error)
    return {
      message: "Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.",
    };

  redirect("/panel");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/panel/logowanie");
}
