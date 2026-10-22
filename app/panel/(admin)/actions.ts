"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { publishAuditAction, recordAdminAction } from "@/lib/panel/audit";
import { requireAdmin } from "@/lib/panel/auth";
import { invalidatePublicCatalog } from "@/lib/panel/catalog-cache";
import { isDeleteConfirmed } from "@/lib/panel/confirm-delete";
import { withFlash } from "@/lib/panel/flash";
import {
  inquiryStatusSchema,
  isAllowedInquiryTransition,
} from "@/lib/panel/inquiry-status";
import {
  categorySchema,
  idSchema,
  inquiryNoteSchema,
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
  let savedId: string;
  if (existingId.success) {
    const { error } = await supabase
      .from("categories")
      .update(parsed.data)
      .eq("id", existingId.data);
    if (error) fail("Nie udało się zapisać kategorii.");
    savedId = existingId.data;
  } else {
    const { data, error } = await supabase
      .from("categories")
      .insert(parsed.data)
      .select("id")
      .single();
    if (error || !data) fail("Nie udało się zapisać kategorii.");
    savedId = data.id as string;
  }
  // ISK-374 U2: inwalidacja cache idzie PRZED zapisem dziennika. Mutacja jest juz
  // zacommitowana, wiec nieudany dziennik (celowo glosny) nie moze dodatkowo zostawic
  // publicznych stron z nieaktualna trescia do wygasniecia ISR.
  refreshCatalog();
  await recordAdminAction(supabase, {
    action: existingId.success ? "category.update" : "category.create",
    entity: "category",
    entityId: savedId,
  });
  redirect(withFlash("/panel/szkolenia", "kategoria-zapisana"));
}

export async function saveTrainer(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = trainerSchema.safeParse(formValues(formData));
  if (!parsed.success) fail("Niepoprawne dane trenera.");
  const existingId = idSchema.safeParse(formData.get("id"));
  let savedId: string;
  if (existingId.success) {
    const { error } = await supabase
      .from("trainers")
      .update(parsed.data)
      .eq("id", existingId.data);
    if (error) fail("Nie udało się zapisać trenera.");
    savedId = existingId.data;
  } else {
    const { data, error } = await supabase
      .from("trainers")
      .insert(parsed.data)
      .select("id")
      .single();
    if (error || !data) fail("Nie udało się zapisać trenera.");
    savedId = data.id as string;
  }
  // Kolejnosc jak w saveCategory — patrz nota ISK-374 U2 wyzej.
  refreshCatalog();
  await recordAdminAction(supabase, {
    action: existingId.success ? "trainer.update" : "trainer.create",
    entity: "trainer",
    entityId: savedId,
  });
  redirect(withFlash("/panel/trenerzy", "trener-zapisany"));
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

  // ISK-374 BL-D + U1: zapis wiersza `trainings`, wymiana przypisan trenerow i wpis w
  // dzienniku audytu ida JEDNYM wywolaniem RPC, bo jako osobne zapytania REST byly osobnymi
  // transakcjami. Blad wymiany trenerow (np. rownolegle usuniety trener — `trainer_id` ma FK)
  // zostawial zapisany tytul, puste przypisania, PUSTY dziennik i nieuniewazniony cache, a
  // komunikat mowil tylko o trenerach. Teraz albo wszystko, albo nic — dlatego komunikat bledu
  // moze uczciwie stwierdzic, ze zadna zmiana nie weszla (wczesniej nie mogl).
  const { data: savedId, error } = await supabase.rpc("save_training", {
    p_training_id: id.success ? id.data : null,
    p_training: training,
    p_trainer_ids: trainer_ids,
  });
  if (error || !savedId)
    fail(
      id.success
        ? "Nie udało się zapisać szkolenia. Żadna zmiana nie została wprowadzona."
        : "Nie udało się utworzyć szkolenia. Żadna zmiana nie została wprowadzona.",
    );

  refreshCatalog();
  redirect(withFlash("/panel/szkolenia", "szkolenie-zapisane"));
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
  // ISK-374 BL-A + U2: usuniecie i wpis w dzienniku ida jednym RPC, czyli w JEDNEJ transakcji.
  // Wpis skladany po commicie usuniecia nie chronil tego, czego wymaga ADR-0003: gdy zapis
  // dziennika padl, pozycja byla juz nieodwracalnie usunieta i nadal bez sladu. Teraz nieudany
  // dziennik wycofuje usuniecie, wiec stan „usuniete bez sladu" jest nieosiagalny.
  // Funkcja zglasza blad takze wtedy, gdy DELETE nie objal zadnego wiersza (RLS filtruje
  // DELETE jak WHERE, wiec wczesniej byl to cichy sukces).
  const { error } = await supabase.rpc("delete_catalog_item", {
    p_kind: kind,
    p_id: validId.data,
  });
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
  // Kolejnosc jak w saveCategory — patrz nota ISK-374 U2. Przy publikacji jest to
  // najwazniejsze: to wlasnie ta operacja zmienia widocznosc pozycji na publicznych stronach.
  refreshCatalog();
  await recordAdminAction(supabase, {
    action: publishAuditAction(kind, published),
    entity: kind,
    entityId: validId.data,
  });
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
  // ISK-374 U3: `details` zawiera TYLKO status docelowy. `from` pochodzilo z odczytu przed
  // UPDATE-em, wiec przy dwoch rownoleglych zmianach zapisywaloby stan z momentu odczytu, a
  // nie faktyczny poprzedni — dziennik audytu klamalby wzgledem `inquiry_status_history`,
  // ktora dostaje prawdziwe `from`/`to` z `OLD.status` w triggerze. Jedno zrodlo prawdy dla
  // przejscia: ta historia. Samo przejscie jest bezpieczne niezaleznie od tego odczytu —
  // niedozwolone odrzuca trigger `enforce_inquiry_admin_update()`.
  // Zadnych danych osobowych zgloszenia (ograniczenie admin_audit_log_details_no_pii
  // odrzucilo by je i tak).
  await recordAdminAction(supabase, {
    action: "inquiry.status_change",
    entity: "inquiry",
    entityId: validId.data,
    details: { to: validStatus.data },
  });
}

/**
 * Notatka wewnetrzna zgloszenia (ISK-402).
 *
 * UWAGA PRZY ODBIORZE: ta akcja i jej pole w UI sa DODANE w M3, a nie
 * przestylizowane. Karta ISK-402 i `specyfikacja-wizualna` §6 zakladaly, ze
 * „produkt ma" notatke i trzeba ja tylko ubrac w forme wzorca. Zmierzony stan
 * na `origin/main` byl inny: kolumna `admin_note` istniala w bazie razem
 * z kolumnowym grantem `update (status, admin_note) to authenticated`
 * (migracja `20261012120000`), jawnym dopuszczeniem w triggerze
 * `enforce_inquiry_admin_update()` i testem integracyjnym — ale w `app/`
 * i `lib/` nie bylo ani jednego wystapienia `admin_note`. Backend traktowal
 * notatke jak funkcje produktu, warstwa widoku nigdy jej nie dostala.
 *
 * Zadnej migracji to nie wymaga: korzystamy z istniejacej kolumny, istniejacego
 * grantu i istniejacego triggera. Jedyne, czego nie bylo, to 40 linii UI.
 *
 * Granica uprawnien: `update` idzie WYLACZNIE po `admin_note`. Grant kolumnowy
 * dopuszcza tylko `(status, admin_note)`, wiec probka z szersza lista kolumn
 * skonczylaby sie `permission denied for table inquiries` — i tak ma byc.
 */
export async function saveInquiryNote(id: string, formData: FormData) {
  const validId = idSchema.safeParse(id);
  if (!validId.success) fail("Niepoprawny identyfikator.");
  const parsed = inquiryNoteSchema.safeParse(formData.get("admin_note") ?? "");
  if (!parsed.success)
    fail(parsed.error.issues[0]?.message ?? "Niepoprawna notatka.");

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("inquiries")
    .update({ admin_note: parsed.data })
    .eq("id", validId.data);
  if (error) fail("Nie udało się zapisać notatki.");

  revalidatePath(`/panel/zgloszenia/${validId.data}`);
  // `details` NIE nosi tresci notatki: notatka opisuje osobe, ktora zlozyla
  // zgloszenie, a `admin_audit_log_details_no_pii` i ADR-0003 zabraniaja danych
  // osobowych w dzienniku. Zapisujemy sam fakt operacji i to, czy pole zostalo
  // wyczyszczone — tyle wystarczy, zeby odtworzyc historie zmian.
  await recordAdminAction(supabase, {
    action: "inquiry.note_update",
    entity: "inquiry",
    entityId: validId.data,
    details: { cleared: parsed.data === null },
  });
  redirect(withFlash(`/panel/zgloszenia/${validId.data}`, "notatka-zapisana"));
}
