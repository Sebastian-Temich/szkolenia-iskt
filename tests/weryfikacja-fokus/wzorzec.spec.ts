/**
 * ISK-403 — pomiar WZORCA tym samym detektorem co produkt.
 *
 * Cel podwojny: (1) baseline wzorca 360/768/1440 do zestawienia, (2) KONTROLA
 * POZYTYWNA detektora `elementyPozaViewportem` — karta podaje, ze wzorzec ma
 * przy 360 px 12 elementow poza viewportem. Jesli detektor tego nie zobaczy,
 * to jego zielony wynik na produkcie nic nie znaczy.
 *
 * Uzywamy `Szkolenia ISKT.html` (samowystarczalny render). NIE `.dc.html` —
 * tamten plik zawiera zahardkodowane dane logowania i dane osobowe.
 */
import { test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { elementyPozaViewportem, SZEROKOSCI } from "../e2e/helpers/isk403-pomiar";

const WZORZEC =
  "/Users/ST/Documents/ISKT/Aplikacje/Strona_www_szkolenia_iskt/Szablon strony szkolenia.iskt.pl/Szkolenia ISKT.html";
const KAT = path.join("artefakty", "isk403", "wzorzec");

test("wzorzec: zrzuty i elementy poza viewportem", async ({ page }) => {
  await mkdir(KAT, { recursive: true });
  for (const szerokosc of SZEROKOSCI) {
    await page.setViewportSize({ width: szerokosc, height: 900 });
    await page.goto("file://" + WZORZEC, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(KAT, `wzorzec-landing-${szerokosc}.png`),
      fullPage: true,
    });
    const poza = await elementyPozaViewportem(page, szerokosc);
    await writeFile(
      path.join(KAT, `wzorzec-landing-${szerokosc}.json`),
      JSON.stringify({ szerokosc, liczbaPozaViewportem: poza.length, poza }, null, 2),
      "utf8",
    );
    console.log(`WZORZEC @${szerokosc}px -> poza viewportem: ${poza.length}`);
    for (const e of poza.slice(0, 14)) {
      console.log(`     ${e.selektor}  right=${Math.round(e.right)} naddatek=${Math.round(e.naddatek)}`);
    }
  }
});
