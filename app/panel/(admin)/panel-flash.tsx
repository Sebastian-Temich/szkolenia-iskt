"use client";

import { useEffect } from "react";

import { Notice } from "@/components/ui";
import { FLASH_PARAM } from "@/lib/panel/flash";

/**
 * Pasek potwierdzenia zapisu — i JEDNORAZOWE zuzycie biletu (ISK-414 / CR-I8).
 *
 * Serwer decyduje, czy banner wstaje (`flashMessage` wymaga zgodnosci adresu
 * z ciasteczkiem). Tutaj jest druga polowa naprawy: zaraz po wyrenderowaniu
 * zdejmujemy `?komunikat=` z adresu przez `history.replaceState`, wiec
 * przeladowanie (F5, powrot do zakladki) renderuje strone BEZ parametru i bez
 * bannera. Bez tego banner byl lepki i po NIEUDANEJ pozniejszej edycji nadal
 * potwierdzal sukces.
 *
 * `history.replaceState`, a nie `router.replace`: ten drugi jest nawigacja —
 * odpytuje serwer i przerysowuje strone, zeby skasowac wlasny banner. Natywne
 * API jest w App Routerze wspierane wprost i nie unieważnia nic poza adresem.
 *
 * Banner zostaje widoczny do konca tego wyswietlenia (nie gasimy go ze stanu):
 * `role="status"` ma zostac przeczytany, a nie mignac.
 */
export function PanelFlash({ message }: { message: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FLASH_PARAM)) return;
    url.searchParams.delete(FLASH_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  return (
    <Notice tone="success" className="panel-flash">
      {message}
    </Notice>
  );
}
