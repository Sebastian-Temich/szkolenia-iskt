import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dziennik operacji administracyjnych (ADR-0003, model-danych.md §3.8; ISK-374 BL-A).
 *
 * Tabela `admin_audit_log` nie ma polityki INSERT dla roli `authenticated` — jedynym
 * wejsciem z sesji panelu jest funkcja `log_admin_action()` (SECURITY DEFINER, wymaga
 * `is_admin()`, wymusza `actor_id = auth.uid()`). Dlatego zapis idzie przez RPC, a nie
 * przez `from("admin_audit_log").insert(...)`: ten drugi zostalby odrzucony przez RLS.
 *
 * Wpis powstaje PO udanej mutacji. Blad zapisu dziennika jest celowo glosny — operacja
 * administracyjna bez sladu w dzienniku jest wlasnie tym, czego ADR-0003 zabrania, wiec
 * administrator musi sie o tym dowiedziec, zamiast zobaczyc cichy sukces.
 */

export type AuditEntity = "training" | "trainer" | "category" | "inquiry";

export type AuditAction =
  | `${Exclude<AuditEntity, "inquiry">}.${"create" | "update" | "delete" | "publish" | "unpublish"}`
  | "inquiry.status_change";

/** Wartosci proste — `details` opisuje operacje, nie tresc rekordu. */
export type AuditDetails = Record<string, string | number | boolean | null>;

export type AuditEntry = {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  details?: AuditDetails;
};

/**
 * Lustro ograniczenia `admin_audit_log_details_no_pii` z migracji 20261009120800.
 * Baza odrzuca takie klucze sama; tutaj zatrzymujemy je wczesniej, zeby defekt warstwy
 * aplikacji byl widoczny jako jednoznaczny blad, a nie jako `check_violation` z Postgresa.
 */
export const FORBIDDEN_AUDIT_DETAIL_KEYS = [
  "email",
  "phone",
  "full_name",
  "company_name",
  "message",
  "interest_area",
] as const;

export function assertNoPiiInAuditDetails(details: AuditDetails | undefined) {
  if (!details) return;
  const found = Object.keys(details).filter((key) =>
    (FORBIDDEN_AUDIT_DETAIL_KEYS as readonly string[]).includes(key),
  );
  if (found.length) {
    throw new Error(
      `Dziennik audytu nie przyjmuje danych osobowych (klucze: ${found.join(", ")}).`,
    );
  }
}

export async function recordAdminAction(
  client: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  assertNoPiiInAuditDetails(entry.details);
  const { error } = await client.rpc("log_admin_action", {
    p_action: entry.action,
    p_entity: entry.entity,
    p_entity_id: entry.entityId,
    p_details: entry.details ?? {},
  });
  if (error) {
    throw new Error(
      `Nie udało się zapisać operacji w dzienniku audytu (${entry.action}).`,
    );
  }
}

/** Nazwa operacji publikacji/wycofania — jedno zrodlo prawdy dla akcji i testow. */
export function publishAuditAction(
  entity: Exclude<AuditEntity, "inquiry">,
  published: boolean,
): AuditAction {
  return `${entity}.${published ? "publish" : "unpublish"}`;
}
