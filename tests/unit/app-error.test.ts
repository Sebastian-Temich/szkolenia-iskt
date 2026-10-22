/**
 * ISK-411 / CR-I7 — granica bledu calej aplikacji (`app/error.tsx`).
 *
 * DLACZEGO TEN TEST JEST JEDNOSTKOWY, A NIE E2E
 * Pozostale trasy pominiete przez bramke dostepnosci (`/polityka-prywatnosci`,
 * oba widoki 404, formularze panelu, `/panel/brak-dostepu`) dostaly w ISK-411
 * pelny skan axe w `tests/e2e/dostepnosc.spec.ts`, bo da sie do nich NAWIGOWAC.
 * `app/error.tsx` renderuje sie wylacznie wtedy, gdy render segmentu rzuci
 * wyjatek, a produkt nie ma — i nie powinien miec — trasy, ktora rzuca na
 * zadanie. Dodanie takiej trasy po to, zeby bramka miala co kliknac, byloby
 * powierzchnia produkcyjna stworzona dla testu.
 *
 * Dlatego mierzymy tu STRUKTURE drzewa, czyli te reguly, ktore nie potrzebuja
 * ukladu: jeden `h1`, nazwa dostepna na jedynej akcji, brak wycieku komunikatu
 * wyjatku. Kontrast i geometria tego ekranu sa pokryte posrednio i realnie:
 * `app/not-found.tsx` uzywa DOKLADNIE tych samych klas (`empty-state`,
 * `empty-state-title`, `ui-button` z `ui-button-primary`), a on od ISK-411
 * przechodzi skan axe w przegladarce. Gdyby ktos zepsul kontrast tej formy,
 * wywroci sie bramka 404 — nie ten plik.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ErrorPage from "@/app/error";

function render(error: Error & { digest?: string }): string {
  return renderToStaticMarkup(
    createElement(ErrorPage, { error, reset: () => {} }),
  );
}

describe("app/error.tsx — granica bledu (ISK-411 / CR-I7)", () => {
  it("ma dokladnie jeden h1", () => {
    const html = render(new Error("cokolwiek"));
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it("nie przeskakuje poziomow naglowkow (jedyny naglowek to h1)", () => {
    const html = render(new Error("cokolwiek"));
    const poziomy = Array.from(html.matchAll(/<h([1-6])[\s>]/g)).map((m) =>
      Number(m[1]),
    );
    expect(poziomy).toEqual([1]);
  });

  it("jedyna akcja ma nazwe dostepna z tekstu", () => {
    const html = render(new Error("cokolwiek"));
    // `<button>` z sama ikona oglaszalby sie czytnikowi jako „przycisk".
    expect(html).toContain("Spróbuj ponownie");
    expect(html.match(/<button[\s>]/g) ?? []).toHaveLength(1);
  });

  /**
   * To jest asercja BEZPIECZENSTWA, nie kosmetyczna: komunikat wyjatku moze
   * nosic fragment zapytania, sciezke na dysku albo dane osobowe ze zgloszenia.
   * Komentarz w `app/error.tsx` obiecuje, ze `error` nie jest pokazywany —
   * nikt tego nie mierzyl.
   */
  it("nie pokazuje komunikatu wyjatku ani digestu", () => {
    const tajne = "SELECT * FROM inquiries WHERE email = jan@example.invalid";
    const error = Object.assign(new Error(tajne), { digest: "digest-4711" });
    const html = render(error);

    expect(html).not.toContain(tajne);
    expect(html).not.toContain("inquiries");
    expect(html).not.toContain("digest-4711");
  });
});
