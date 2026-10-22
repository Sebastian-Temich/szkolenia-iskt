"use client";

import Image from "next/image";
import { useState } from "react";

import { trainerInitials } from "@/lib/format";

type Props = {
  photoUrl: string | null;
  fullName: string;
  size?: number;
};

/**
 * ISK-373 / P18. Wczesniej `trainer.photo_url ? <Image/> : <div class="avatar"/>`
 * decydowalo wylacznie po obecnosci adresu, a nie po tym, czy zasob da sie
 * wczytac. Trener ze zdjeciem zwracajacym 404 dostawal `naturalWidth = 0`
 * i `alt = ""`, czyli PUSTY zielony krazek — degradacja gorsza niz brak zdjecia,
 * bo przy braku `photo_url` zastepnik z inicjalami rysowal sie poprawnie.
 * Scenariusz jest realny: usuniety plik, przeniesiony CDN, wygasly podpis URL.
 *
 * Zastepnik jest tu W DWOCH warstwach, bo kazda sama w sobie ma luke:
 *
 * 1. Zdjecie lezy NA inicjalach (`.avatar-photo` jest pozycjonowane absolutnie
 *    w `.avatar`), a nie zamiast nich. Gdy zasob zwroci 404, przegladarka nie
 *    rysuje nic — `alt` jest pusty — i spod przezroczystego `img` widac
 *    inicjaly. Ta warstwa dziala BEZ JavaScriptu i przed hydratacja.
 * 2. `onError` usuwa martwy element z drzewa, zeby stan DOM zgadzal sie z tym,
 *    co widac, i zeby `data-avatar` dalo sie zmierzyc. Samo `onError` nie
 *    wystarczyloby jako jedyna warstwa, bo blad wczytania zwykle wypada przed
 *    hydratacja; `next/image` wprawdzie ponawia wtedy zadanie (`img.src =
 *    img.src` w efekcie ukladu, komentarz „Replay events from during
 *    hydration” w `next/dist/client/image-component.js`), ale to zachowanie
 *    frameworka, nie kontrakt tej aplikacji.
 *
 * `alt` zostaje pusty swiadomie: nazwisko stoi obok w `h2` tej samej karty,
 * wiec opis zdjecia bylby powtorzeniem dla czytnika ekranu (WCAG 1.1.1 —
 * zdjecie jest dekoracyjne wobec sasiedniego tekstu).
 */
export function TrainerAvatar({ photoUrl, fullName, size = 144 }: Props) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div className="avatar" data-avatar={showPhoto ? "photo" : "initials"}>
      <span aria-hidden="true">{trainerInitials(fullName)}</span>
      {showPhoto ? (
        <Image
          src={photoUrl!}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="avatar-photo"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
