import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  assertNoPiiInAuditDetails,
  publishAuditAction,
  recordAdminAction,
} from "@/lib/panel/audit";

function clientWith(result: { error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("wpis w dzienniku audytu (ISK-374 BL-A)", () => {
  it("zapisuje operację przez RPC log_admin_action, nie bezpośrednim INSERT-em", async () => {
    // Bezposredni INSERT z sesji panelu odrzuca RLS — admin_audit_log ma tylko
    // polityke SELECT. Dlatego kontrakt tej funkcji to RPC.
    const { client, rpc } = clientWith({ error: null });
    await recordAdminAction(client, {
      action: "training.delete",
      entity: "training",
      entityId: "11111111-1111-4111-8111-111111111111",
    });

    expect(rpc).toHaveBeenCalledWith("log_admin_action", {
      p_action: "training.delete",
      p_entity: "training",
      p_entity_id: "11111111-1111-4111-8111-111111111111",
      p_details: {},
    });
  });

  it("nie przekazuje actor_id — autora wpisu ustala baza z sesji", async () => {
    const { client, rpc } = clientWith({ error: null });
    await recordAdminAction(client, {
      action: "inquiry.status_change",
      entity: "inquiry",
      entityId: "22222222-2222-4222-8222-222222222222",
      details: { from: "nowe", to: "zamkniete" },
    });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args)).not.toContain("p_actor_id");
    expect(args.p_details).toEqual({ from: "nowe", to: "zamkniete" });
  });

  it("zgłasza błąd, gdy zapis dziennika się nie udał", async () => {
    // Operacja administracyjna bez sladu w dzienniku jest wlasnie tym, czego
    // ADR-0003 zabrania — cichy sukces bylby gorszy od bledu.
    const { client } = clientWith({ error: { message: "permission denied" } });
    await expect(
      recordAdminAction(client, {
        action: "training.publish",
        entity: "training",
        entityId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toThrow(/dziennik/i);
  });

  it("odrzuca dane osobowe w details przed wysłaniem do bazy", async () => {
    const { client, rpc } = clientWith({ error: null });
    await expect(
      recordAdminAction(client, {
        action: "inquiry.status_change",
        entity: "inquiry",
        entityId: "44444444-4444-4444-8444-444444444444",
        details: { email: "jan@example.invalid" } as never,
      }),
    ).rejects.toThrow(/danych osobowych/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lustro ograniczenia bazy: każdy zakazany klucz jest wyłapany", () => {
    for (const key of [
      "email",
      "phone",
      "full_name",
      "company_name",
      "message",
      "interest_area",
    ]) {
      expect(() => assertNoPiiInAuditDetails({ [key]: "x" })).toThrow();
    }
    expect(() =>
      assertNoPiiInAuditDetails({ from: "nowe", to: "w_toku", trainers: 2 }),
    ).not.toThrow();
  });

  it("nazwy operacji publikacji odpowiadają encji i kierunkowi zmiany", () => {
    expect(publishAuditAction("training", true)).toBe("training.publish");
    expect(publishAuditAction("training", false)).toBe("training.unpublish");
    expect(publishAuditAction("category", true)).toBe("category.publish");
  });
});
