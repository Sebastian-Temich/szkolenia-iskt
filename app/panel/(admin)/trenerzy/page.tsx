import Link from "next/link";

import { requireAdmin } from "@/lib/panel/auth";

import { deleteCatalogItem, setPublished } from "../actions";
import { ConfirmDeleteButton } from "../confirm-delete-button";

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
            aria-label="Lista trenerów — tabela przewijana w poziomie"
            tabIndex={0}
          >
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
                        <Link href={`/panel/trenerzy/${trainer.id}`}>
                          Edytuj
                        </Link>
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
                        <ConfirmDeleteButton
                          action={deleteCatalogItem.bind(
                            null,
                            "trainer",
                            trainer.id,
                          )}
                          itemId={trainer.id}
                          itemName={trainer.full_name}
                          itemKindLabel="trenera"
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
    </section>
  );
}
