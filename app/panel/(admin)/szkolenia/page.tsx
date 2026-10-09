import Link from "next/link";

import { requireAdmin } from "@/lib/panel/auth";

import { deleteCatalogItem, setPublished } from "../actions";

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
        <div className="panel-table-wrap">
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
                  <td>
                    {item.categories?.[0]?.name}
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
                      <form
                        action={deleteCatalogItem.bind(
                          null,
                          "training",
                          item.id,
                        )}
                      >
                        <button className="danger">Usuń</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
