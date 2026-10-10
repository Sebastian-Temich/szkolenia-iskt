type CatalogInvalidators = {
  revalidatePath: (path: string, type?: "page" | "layout") => void;
  updateTag: (tag: string) => void;
};

export function invalidatePublicCatalog({
  revalidatePath,
  updateTag,
}: CatalogInvalidators) {
  updateTag("catalog");
  revalidatePath("/szkolenia");
  revalidatePath("/szkolenia/[slug]", "page");
  revalidatePath("/trenerzy");
}
