import Link from "next/link";

import { requireAdmin } from "@/lib/panel/auth";

import { deleteCatalogItem, setPublished } from "../actions";

export default async function TrainersPage() {
  const { supabase } = await requireAdmin();
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id,full_name,headline,slug,is_published")
    .order("sort_order");
  return (
    <section>
      <div className="panel-title-row">
        <div>
          <p className="panel-eyebrow">Zespół</p>
          <h1>Trenerzy</h1>
        </div>
        <Link className="panel-button" href="/panel/trenerzy/nowy">
          Dodaj trenera
        </Link>
      </div>
      {!trainers?.length ? (
        <p className="panel-empty">Brak trenerów.</p>
      ) : (
        <div className="panel-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Osoba</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {trainers.map((trainer) => (
                <tr key={trainer.id}>
                  <td>
                    <strong>{trainer.full_name}</strong>
                    <small>{trainer.headline || `/${trainer.slug}`}</small>
                  </td>
                  <td>
                    <span
                      className={
                        trainer.is_published
                          ? "panel-status is-live"
                          : "panel-status"
                      }
                    >
                      {trainer.is_published ? "Opublikowany" : "Szkic"}
                    </span>
                  </td>
                  <td>
                    <div className="panel-actions">
                      <Link href={`/panel/trenerzy/${trainer.id}`}>Edytuj</Link>
                      <form
                        action={setPublished.bind(
                          null,
                          "trainer",
                          trainer.id,
                          !trainer.is_published,
                        )}
                      >
                        <button>
                          {trainer.is_published ? "Wycofaj" : "Publikuj"}
                        </button>
                      </form>
                      <form
                        action={deleteCatalogItem.bind(
                          null,
                          "trainer",
                          trainer.id,
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
    </section>
  );
}
