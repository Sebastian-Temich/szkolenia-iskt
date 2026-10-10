import Link from "next/link";

import { requireAdmin } from "@/lib/panel/auth";
import { toOne } from "@/lib/supabase/embed";

import { deleteCatalogItem, setPublished } from "../actions";
import { ConfirmDeleteButton } from "../confirm-delete-button";

export default async function TrainingsPage() {
  const { supabase } = await requireAdmin();
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
          Dodaj szkolenie
        </Link>
      </div>
      {!trainings?.length ? (
        <p className="panel-empty">Brak szkoleń. Dodaj pierwszą pozycję.</p>
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
            <table>
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Kategoria</th>
                  <th>Status</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {trainings.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>/{item.slug}</small>
                    </td>
                    <td>{toOne(item.categories)?.name ?? "—"}</td>
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
                    <td>
                      <div className="panel-actions">
                        <Link href={`/panel/szkolenia/${item.id}`}>Edytuj</Link>
                        <form
                          action={setPublished.bind(
                            null,
                            "training",
                            item.id,
                            !item.is_published,
                          )}
                        >
                          <button>
                            {item.is_published ? "Wycofaj" : "Publikuj"}
                          </button>
                        </form>
                        <ConfirmDeleteButton
                          action={deleteCatalogItem.bind(
                            null,
                            "training",
                            item.id,
                          )}
                          itemId={item.id}
                          itemName={item.title}
                          itemKindLabel="szkolenie"
                        />
                      </div>
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
          <Link href="/panel/szkolenia/kategorie/nowa">Dodaj kategorię</Link>
        </div>
        <div className="panel-chip-list">
          {categories?.map((category) => (
            <span className="panel-chip" key={category.id}>
              {category.name}
              <Link href={`/panel/szkolenia/kategorie/${category.id}`}>
                Edytuj
              </Link>
              <form
                action={setPublished.bind(
                  null,
                  "category",
                  category.id,
                  !category.is_published,
                )}
              >
                <button>
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
