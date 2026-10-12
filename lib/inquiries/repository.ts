import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  InquiryRecord,
  InquiryRepository,
  NotificationStatus,
} from "@/lib/inquiries/service";

// Repozytorium zgloszen oparte o klienta service_role (ADR-0004 §1 pkt 4). Przegladarka NIGDY
// nie pisze do `inquiries` — zapis wylacznie ta warstwa serwerowa. Status 'nowe' i
// notification_status 'pending' pochodza z DEFAULT w migracji 20261009120500_inquiries.sql.

export function createSupabaseInquiryRepository(client: SupabaseClient): InquiryRepository {
  return {
    async insert(record: InquiryRecord) {
      const { data, error } = await client
        .from("inquiries")
        .insert({
          kind: record.kind,
          full_name: record.fullName,
          email: record.email,
          phone: record.phone,
          company_name: record.companyName ?? null,
          training_id: record.trainingId ?? null,
          interest_area: record.interestArea ?? null,
          message: record.message,
          rodo_ack: record.rodoAck,
          rodo_clause_version: record.rodoClauseVersion,
          source_path: record.sourcePath ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async markNotification(id: string, status: NotificationStatus, detail) {
      const patch: Record<string, unknown> = { notification_status: status };
      if (status === "sent") {
        patch.notification_sent_at = (detail.sentAt ?? new Date()).toISOString();
        patch.notification_error = null;
      } else {
        // Wylacznie kod techniczny — bez danych osobowych (ADR-0004 §6).
        patch.notification_error = detail.errorCode ?? "error";
      }
      const { error } = await client.from("inquiries").update(patch).eq("id", id);
      if (error) throw error;
    },

    async recordSuspectedSpam(id: string) {
      const { error } = await client.from("admin_audit_log").insert({
        action: "inquiry.suspected_spam",
        entity: "inquiry",
        entity_id: id,
        details: {},
      });
      if (error) throw error;
    },
  };
}
