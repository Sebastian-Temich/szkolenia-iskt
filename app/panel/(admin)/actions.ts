"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { publishAuditAction, recordAdminAction } from "@/lib/panel/audit";
import { requireAdmin } from "@/lib/panel/auth";
import { invalidatePublicCatalog } from "@/lib/panel/catalog-cache";
import { isDeleteConfirmed } from "@/lib/panel/confirm-delete";
import {
  inquiryStatusSchema,
  isAllowedInquiryTransition,
} from "@/lib/panel/inquiry-status";
import {
  categorySchema,
  idSchema,
  trainerSchema,
  trainingSchema,
} from "@/lib/panel/schemas";

function fail(message: string): never {
  throw new Error(message);
}

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function refreshCatalog() {
  invalidatePublicCatalog({ revalidatePath, updateTag });
  revalidatePath("/panel/szkolenia");
  revalidatePath("/panel/trenerzy");
}

export async function saveCategory(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = categorySchema.safeParse(formValues(formData));
  if (!parsed.success) fail("Niepoprawne dane kategorii.");
  const existingId = idSchema.safeParse(formData.get("id"));
  if (existingId.success) {
    const { error } = await supabase
      .from("categories")
      .update(parsed.data)
      .eq("id", existingId.data);
    if (error) fail("Nie udało się zapisać kategorii.");
    await recordAdminAction(supabase, {
      action: "category.update",
      entity: "category",
      entityId: existingId.data,
    });
  } else {
    const { data, error } = await supabase
      .from("categories")
      .insert(parsed.data)
      .select("id")
      .single();
    if (error || !data) fail("Nie udało się zapisać kategorii.");
    await recordAdminAction(supabase, {
      action: "category.create",
      entity: "category",
      entityId: data.id as string,
    });
  }
  refreshCatalog();
  redirect("/panel/szkolenia");
}

export async function saveTrainer(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = trainerSchema.safeParse(formValues(formData));
  if (!parsed.success) fail("Niepoprawne dane trenera.");
  const existingId = idSchema.safeParse(formData.get("id"));
  if (existingId.success) {
    const { error } = await supabase
      .from("trainers")
      .update(parsed.data)
      .eq("id", existingId.data);
    if (error) fail("Nie udało się zapisać trenera.");
    await recordAdminAction(supabase, {
      action: "trainer.update",
      entity: "trainer",
      entityId: existingId.data,
    });
  } else {
    const { data, error } = await supabase
      .from("trainers")
      .insert(parsed.data)
      .select("id")
      .single();
    if (error || !data) fail("Nie udało się zapisać trenera.");
    await recordAdminAction(supabase, {
      action: "trainer.create",
      entity: "trainer",
      entityId: data.id as string,
    });
  }
  refreshCatalog();
  redirect("/panel/trenerzy");
}

export async function saveTraining(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = trainingSchema.safeParse({
    ...formValues(formData),
    funding_available: formData.get("funding_available") === "on",
    // Niezaznaczony checkbox nie trafia do FormData, wiec brak pola znaczy `false`
    // — tak samo jak przy dofinansowaniu.
    is_featured: formData.get("is_featured") === "on",
    trainer_ids: formData.getAll("trainer_ids"),
  });
  if (!parsed.success) fail("Niepoprawne dane szkolenia.");

  const { trainer_ids, ...training } = parsed.data;
  const rawId = formData.get("id");
  const id = idSchema.safeParse(rawId);
  let trainingId: string;

  if (id.success) {
    const { error } = await supabase
      .from("trainings")
      .update(training)
      .eq("id", id.data);
    if (error) fail("Nie udało się zapisać szkolenia.");
    trainingId = id.data;
  } else {
    const { data, error } = await supabase
      .from("trainings")
      .insert(training)
      .select("id")
      .single();
    if (error || !data) fail("Nie udało się utworzyć szkolenia.");
    trainingId = data.id;
  }

  // ISK-374 BL-D: wymiana przypisan trenerow idzie przez jedno RPC, bo DELETE i INSERT
  // wykonane jako dwa zapytania REST to dwie transakcje — blad INSERT (np. rownolegle
  // usuniety trener) zostawial szkolenie BEZ trenerow. Funkcja jest SECURITY INVOKER,
  // wiec RLS panelu nadal obowiazuje, a niepowodzenie wycofuje rowniez DELETE.
  const { error: trainersError } = await supabase.rpc("set_training_trainers", {
    p_training_id: trainingId,
    p_trainer_ids: trainer_ids,
  });
  if (trainersError)
    fail("Nie udało się przypisać trenerów. Poprzednie przypisania pozostały.");

  await recordAdminAction(supabase, {
    action: id.success ? "training.update" : "training.create",
    entity: "training",
    entityId: trainingId,
    details: { trainers: trainer_ids.length },
  });

  refreshCatalog();
  redirect("/panel/szkolenia");
}

/**
 * Usuniecie jest nieodwracalne, a przycisk stoi w jednym rzedzie z „Wycofaj",
 * wiec potwierdzenie jest wymagane po stronie SERWERA, nie tylko w UI
 * (ISK-364 / B6). Klient dokleja `confirmDeleteId` dopiero po jawnym
 * potwierdzeniu w okienku — zadanie bez tego pola konczy sie bledem i nie
 * dotyka bazy. Kolejnosc jest istotna: sprawdzenie potwierdzenia poprzedza
 * jakiekolwiek wywolanie do bazy.
 */
export async function deleteCatalogItem(
  kind: "training" | "trainer" | "category",
  id: string,
  formData?: FormData,
) {
  const validId = idSchema.safeParse(id);
  if (!validId.success) fail("Niepoprawny identyfikator.");
  if (!isDeleteConfirmed(formData, validId.data)) {
    fail("Usunięcie wymaga potwierdzenia.");
  }
  const { supabase } = await requireAdmin();
  const table =
    kind === "training"
      ? "trainings"
      : kind === "trainer"
        ? "trainers"
        : "categories";
  const { error } = await supabase.from(table).delete().eq("id", validId.data);
  if (error) fail("Nie udało się usunąć pozycji. Sprawdź jej powiązania.");
  // Usuniecie jest nieodwracalne (dla szkolenia dodatkowo kasuje przypisania trenerow
  // przez `on delete cascade`), wiec wpis w dzienniku jest tu najwazniejszy: bez niego
  // nie da sie ustalic kto i kiedy (ISK-374 BL-A).
  await recordAdminAction(supabase, {
    action: `${kind}.delete`,
    entity: kind,
    entityId: validId.data,
  });
  refreshCatalog();
}

export async function setPublished(
  kind: "training" | "trainer" | "category",
  id: string,
  published: boolean,
) {
  const validId = idSchema.safeParse(id);
  if (!validId.success) fail("Niepoprawny identyfikator.");
  const { supabase } = await requireAdmin();
  const table =
    kind === "training"
      ? "trainings"
      : kind === "trainer"
        ? "trainers"
        : "categories";
  const { error } = await supabase
    .from(table)
    .update({
      is_published: published,
      published_at: published ? new Date().toISOString() : null,
    })
    .eq("id", validId.data);
  if (error) fail("Nie udało się zmienić publikacji.");
  await recordAdminAction(supabase, {
    action: publishAuditAction(kind, published),
    entity: kind,
    entityId: validId.data,
  });
  refreshCatalog();
}

export async function changeInquiryStatus(id: string, nextStatus: string) {
  const validId = idSchema.safeParse(id);
  const validStatus = inquiryStatusSchema.safeParse(nextStatus);
  if (!validId.success || !validStatus.success)
    fail("Niepoprawna zmiana statusu.");
  const { supabase } = await requireAdmin();

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("status")
    .eq("id", validId.data)
    .single();
  const currentStatus = inquiryStatusSchema.safeParse(inquiry?.status);
  if (!currentStatus.success) fail("Nie znaleziono zgłoszenia.");
  if (!isAllowedInquiryTransition(currentStatus.data, validStatus.data))
    fail("Ta zmiana statusu nie jest dozwolona.");

  const { error } = await supabase
    .from("inquiries")
    .update({ status: validStatus.data })
    .eq("id", validId.data);
  if (error) fail("Nie udało się zmienić statusu.");
  // Same statusy — bez danych osobowych zgloszenia (ograniczenie
  // admin_audit_log_details_no_pii odrzucilo by je i tak).
  await recordAdminAction(supabase, {
    action: "inquiry.status_change",
    entity: "inquiry",
    entityId: validId.data,
    details: { from: currentStatus.data, to: validStatus.data },
  });
  revalidatePath("/panel/zgloszenia");
  revalidatePath(`/panel/zgloszenia/${validId.data}`);
}
