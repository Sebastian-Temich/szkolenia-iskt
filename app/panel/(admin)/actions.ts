"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/panel/auth";
import { invalidatePublicCatalog } from "@/lib/panel/catalog-cache";
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
  const id = formData.get("id");
  const query = idSchema.safeParse(id).success
    ? supabase.from("categories").update(parsed.data).eq("id", String(id))
    : supabase.from("categories").insert(parsed.data);
  const { error } = await query;
  if (error) fail("Nie udało się zapisać kategorii.");
  refreshCatalog();
  redirect("/panel/szkolenia");
}

export async function saveTrainer(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = trainerSchema.safeParse(formValues(formData));
  if (!parsed.success) fail("Niepoprawne dane trenera.");
  const id = formData.get("id");
  const query = idSchema.safeParse(id).success
    ? supabase.from("trainers").update(parsed.data).eq("id", String(id))
    : supabase.from("trainers").insert(parsed.data);
  const { error } = await query;
  if (error) fail("Nie udało się zapisać trenera.");
  refreshCatalog();
  redirect("/panel/trenerzy");
}

export async function saveTraining(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = trainingSchema.safeParse({
    ...formValues(formData),
    funding_available: formData.get("funding_available") === "on",
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
    const { error: clearError } = await supabase
      .from("training_trainers")
      .delete()
      .eq("training_id", trainingId);
    if (clearError) fail("Nie udało się zaktualizować trenerów.");
  } else {
    const { data, error } = await supabase
      .from("trainings")
      .insert(training)
      .select("id")
      .single();
    if (error || !data) fail("Nie udało się utworzyć szkolenia.");
    trainingId = data.id;
  }

  if (trainer_ids.length) {
    const { error } = await supabase.from("training_trainers").insert(
      trainer_ids.map((trainerId, index) => ({
        training_id: trainingId,
        trainer_id: trainerId,
        sort_order: (index + 1) * 10,
      })),
    );
    if (error) fail("Nie udało się przypisać trenerów.");
  }

  refreshCatalog();
  redirect("/panel/szkolenia");
}

export async function deleteCatalogItem(
  kind: "training" | "trainer" | "category",
  id: string,
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
  const { error } = await supabase.from(table).delete().eq("id", validId.data);
  if (error) fail("Nie udało się usunąć pozycji. Sprawdź jej powiązania.");
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
  revalidatePath("/panel/zgloszenia");
  revalidatePath(`/panel/zgloszenia/${validId.data}`);
}
