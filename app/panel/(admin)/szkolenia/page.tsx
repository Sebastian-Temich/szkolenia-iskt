import { cookies } from "next/headers";
import Link from "next/link";

import { Icon } from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";
import { FLASH_COOKIE, FLASH_PARAM, flashMessage } from "@/lib/panel/flash";
import { toOne } from "@/lib/supabase/embed";

import { deleteCatalogItem, setPublished } from "../actions";
import { PanelFlash } from "../panel-flash";
import { RowActions } from "../row-actions";

export default async function TrainingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireAdmin();
  const flash = flashMessage(
    (await searchParams)[FLASH_PARAM],
    (await cookies()).get(FLASH_COOKIE)?.value,
  );
  const [{ data: trainings }, { data: categories }] = await Promise.all([
    supabase
      .from("trainings")
      .select("id,title,slug,is_published,updated_at,categories(name)")
      .order("updated_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id,name,slug,is_published")
      .order("sort_order"),
  ]);
  return (
    <section>
      <div className="panel-title-row">
        <div>
          <p className="panel-eyebrow">Katalog</p>
          <h1>Szkolenia</h1>
        </div>
        <Link className="panel-button" href="/panel/szkolenia/nowe">
          <Icon name="plus" size={18} />
          Dodaj szkolenie
        </Link>
      </div>

      {/* Pasek potwierdzenia operacji. `Notice` (w `PanelFlash`) ma
          `role="status"` — wzorzec renderuje w tym miejscu zwykly `div`, wiec
          po zapisie czytnik ekranu nie oglasza nic. Bilet jest JEDNORAZOWY
          (ISK-414): bez pasujacego ciasteczka sam `?komunikat=` nie potwierdza
          niczego, a `PanelFlash` zdejmuje parametr z adresu po renderze. */}
      {flash ? <PanelFlash message={flash} /> : null}

      {!trainings?.length ? (
        <p className="panel-empty">
          Brak szkoleń. Dodaj pierwsze szkolenie przyciskiem powyżej.
        </p>
      ) : (
        <>
          {/* ISK-364 / P8: na waskim ekranie kolumna „Akcje" wychodzi poza
              kadr. Region jest etykietowany i `tabindex=0`, wiec da sie go
              przewinac z klawiatury; podpowiedz widoczna jest tylko ponizej
              48rem, gdzie przewijanie faktycznie wystepuje. */}
          <p className="panel-table-hint">
            Tabelę można przewijać w poziomie — kolumna „Akcje” jest po prawej
            stronie.
          </p>
          <div
            className="panel-table-wrap"
            role="region"
            aria-label="Lista szkoleń — tabela przewijana w poziomie"
            tabIndex={0}
          >
            {/* Wzorzec buduje te liste z `div`-ow w siatce CSS. Odtwarzamy jego
                FORME (naglowek na `--neutral-50`, 12 px/700 wersalikami, rytm
                16/24 px, kolumna akcji po prawej), ale na prawdziwej `table`
                z `th scope`: siatka z `div`-ow nie daje czytnikowi ekranu ani
                naglowkow kolumn, ani nawigacji po komorkach, a w tym wierszu
                stoja operacje nieodwracalne. */}
            <table className="panel-table">
              <thead>
                <tr>
                  <th scope="col">Szkolenie</th>
                  <th scope="col">Obszar</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="panel-table-col-actions">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody>
                {trainings.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      <span className="panel-table-title">{item.title}</span>
                      <span className="panel-table-meta">/{item.slug}</span>
                    </th>
                    <td>
                      <span className="panel-table-tag">
                        {toOne(item.categories)?.name ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          item.is_published
                            ? "panel-status is-live"
                            : "panel-status"
                        }
                      >
                        {item.is_published ? "Opublikowane" : "Szkic"}
                      </span>
                    </td>
                    <td className="panel-table-col-actions">
                      <RowActions
                        editHref={`/panel/szkolenia/${item.id}`}
                        publishAction={setPublished.bind(
                          null,
                          "training",
                          item.id,
                          !item.is_published,
                        )}
                        published={Boolean(item.is_published)}
                        deleteAction={deleteCatalogItem.bind(
                          null,
                          "training",
                          item.id,
                        )}
                        itemId={item.id}
                        itemName={item.title}
                        itemKindLabel="szkolenie"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="panel-section">
        <div className="panel-title-row">
          <div>
            <p className="panel-eyebrow">Słownik</p>
            <h2>Kategorie</h2>
          </div>
          <Link
            className="panel-button panel-button-quiet"
            href="/panel/szkolenia/kategorie/nowa"
          >
            <Icon name="plus" size={18} />
            Dodaj kategorię
          </Link>
        </div>
        <div className="panel-chip-list">
          {categories?.map((category) => (
            <span className="panel-chip" key={category.id}>
              {category.name}
              {/* Nazwa dostepna niesie TAKZE nazwe kategorii: w rzedzie
                  kilkunastu chipow samo „Edytuj" nie mowi czytnikowi ekranu,
                  ktora pozycje otworzy. */}
              <Link
                className="panel-icon-action"
                href={`/panel/szkolenia/kategorie/${category.id}`}
                aria-label={`Edytuj kategorię: ${category.name}`}
              >
                <Icon name="pencil" size={16} />
              </Link>
              <form
                action={setPublished.bind(
                  null,
                  "category",
                  category.id,
                  !category.is_published,
                )}
              >
                <button type="submit">
                  {category.is_published ? "Wycofaj" : "Publikuj"}
                </button>
              </form>
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}
