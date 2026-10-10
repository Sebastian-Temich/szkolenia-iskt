import localFont from "next/font/local";

/**
 * Inter wczytujemy z pliku w repozytorium (`next/font/local`), nie z Google
 * Fonts. `docs/design-system.md` deklaruje build bez pobierania krojow z CDN,
 * a `next/font/google` sciaga plik w czasie builda — wariant lokalny utrzymuje
 * te wlasciwosc i nie dodaje dostawcy do `docs/zgodnosc/procesorzy.md`.
 *
 * Plik to wariant zmienny (os `wght` 100–900), wiec jedno zadanie pokrywa cala
 * skale wag z `@theme`. Licencja SIL OFL 1.1 lezy obok w `LICENSE-Inter.txt`.
 *
 * `fallback` trzymamy krotki (`system-ui`): `next/font` generuje z niego face
 * „<rodzina> Fallback" z `size-adjust`, zeby podmiana kroju po dociagnieciu
 * pliku nie przesuwala ukladu. Pelny stos systemowy siedzi raz, w `--font-sans`
 * — powtarzanie go tutaj dublowaloby go w wyliczonym `font-family`.
 */
export const interVariable = localFont({
  src: "./InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  preload: true,
  fallback: ["system-ui"],
});
