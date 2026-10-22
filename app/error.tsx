"use client";

import { Button, Card, Icon } from "@/components/ui";

/**
 * Granica bledu calej aplikacji. Renderuje sie W MIEJSCU drzewa `app/layout.tsx`,
 * czyli bez naglowka i stopki z `app/(public)/layout.tsx` — stad wlasna, pelna
 * powloka (`main` + rytm sekcji + kontener).
 *
 * `error` zostaje w sygnaturze (Next przekazuje go zawsze), ale NIE jest pokazywany:
 * komunikat wyjatku moze zawierac szczegoly implementacji albo fragment danych,
 * a dla osoby odwiedzajacej strone jest bezuzyteczny. Jedyna uzyteczna akcja to
 * `reset()`, czyli ponowna proba renderu tego samego segmentu.
 *
 * Klasy `empty-state` / `empty-state-title` sa WSPOLNE ze stanami pustymi katalogu,
 * obszarow i trenerow — „nic tu nie ma, oto wyjscie” to jedna forma w calym serwisie.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="ui-section">
      <div className="ui-container">
        <Card className="empty-state" padding="roomy">
          <h1 className="empty-state-title">Nie udało się wczytać strony</h1>
          <p>Spróbuj ponownie. Jeśli problem nie znika, wróć później.</p>
          <Button onClick={() => reset()} size="sm" variant="primary">
            <Icon name="rotate-ccw" size={18} />
            Spróbuj ponownie
          </Button>
        </Card>
      </div>
    </main>
  );
}
