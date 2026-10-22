type CatalogInvalidators = {
  revalidatePath: (path: string, type?: "page" | "layout") => void;
  updateTag: (tag: string) => void;
};

export function invalidatePublicCatalog({
  revalidatePath,
  updateTag,
}: CatalogInvalidators) {
  updateTag("catalog");
  // Strona główna też czyta katalog — sekcja „Szkolenia, które wyróżniamy” filtruje
  // `is_featured`, a flagę da się teraz ustawić z panelu (ISK-374 BL-C). Bez tej
  // inwalidacji zmiana byłaby widoczna na „/” dopiero po wygaśnięciu ISR (300 s).
  revalidatePath("/");
  revalidatePath("/szkolenia");
  revalidatePath("/szkolenia/[slug]", "page");
  revalidatePath("/trenerzy");
}
