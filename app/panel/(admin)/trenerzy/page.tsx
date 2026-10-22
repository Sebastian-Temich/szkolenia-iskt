import Link from "next/link";

import { Icon, IconChip, Notice } from "@/components/ui";
import { trainerInitials } from "@/lib/format";
import { requireAdmin } from "@/lib/panel/auth";
import { FLASH_PARAM, flashMessage } from "@/lib/panel/flash";

import { deleteCatalogItem, setPublished } from "../actions";
import { RowActions } from "../row-actions";

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireAdmin();
  const flash = flashMessage((await searchParams)[FLASH_PARAM]);
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
          <Icon name="plus" size={18} />
          Dodaj trenera
        </Link>
      </div>

      {flash ? (
        <Notice tone="success" className="panel-flash">
          {flash}
        </Notice>
      ) : null}

      {!trainers?.length ? (
        <p className="panel-empty">
          Brak trenerów. Dodaj pierwszy profil przyciskiem powyżej.
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
            aria-label="Lista trenerów — tabela przewijana w poziomie"
            tabIndex={0}
          >
            <table className="panel-table">
              <thead>
                <tr>
                  <th scope="col">Trener</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="panel-table-col-actions">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody>
                {trainers.map((trainer) => (
                  <tr key={trainer.id}>
                    <th scope="row">
                      <span className="panel-table-person">
                        {/* Krazek z inicjalami jest ORNAMENTEM obok pelnego
                            imienia w tej samej komorce, wiec idzie w opakowaniu
                            `aria-hidden`: inaczej czytnik ekranu przeczytalby
                            „A N  Anna Nowak". `IconChip` sam ukrywa tylko
                            warianty z ikona — przy tresci wlasnej nie moze
                            zalozyc, ze jest ozdoba. */}
                        <span aria-hidden="true">
                          <IconChip size="md" tone="brand" circle>
                            {trainerInitials(trainer.full_name)}
                          </IconChip>
                        </span>
                        <span>
                          <span className="panel-table-title">
                            {trainer.full_name}
                          </span>
                          <span className="panel-table-meta">
                            {trainer.headline || `/${trainer.slug}`}
                          </span>
                        </span>
                      </span>
                    </th>
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
                    <td className="panel-table-col-actions">
                      <RowActions
                        editHref={`/panel/trenerzy/${trainer.id}`}
                        publishAction={setPublished.bind(
                          null,
                          "trainer",
                          trainer.id,
                          !trainer.is_published,
                        )}
                        published={Boolean(trainer.is_published)}
                        deleteAction={deleteCatalogItem.bind(
                          null,
                          "trainer",
                          trainer.id,
                        )}
                        itemId={trainer.id}
                        itemName={trainer.full_name}
                        itemKindLabel="trenera"
                      />
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
