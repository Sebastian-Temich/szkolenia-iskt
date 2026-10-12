import { describe, expect, it, vi } from "vitest";

import { invalidatePublicCatalog } from "@/lib/panel/catalog-cache";

describe("inwalidacja katalogu po publikacji", () => {
  it("wygasza tag danych ISR i wszystkie publiczne widoki katalogu", () => {
    const revalidatePath = vi.fn();
    const updateTag = vi.fn();

    invalidatePublicCatalog({ revalidatePath, updateTag });

    expect(updateTag).toHaveBeenCalledWith("catalog");
    // Strona główna filtruje `is_featured` (ISK-374 BL-C), więc też musi być wygaszona.
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/szkolenia");
    expect(revalidatePath).toHaveBeenCalledWith("/szkolenia/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/trenerzy");
  });
});
