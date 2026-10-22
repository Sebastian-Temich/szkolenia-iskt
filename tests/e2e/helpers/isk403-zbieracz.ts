/**
 * ISK-403 — wspolny zbieracz pomiarow.
 *
 * Kazdy pomiar zapisuje sie NATYCHMIAST do wlasnego pliku JSON. Pierwsza wersja
 * trzymala wszystko w tablicy modulowej i pisala plik w `afterAll`: gdy jeden
 * krok padl, serial-mode pominal reszte, a plik mial luki, ktore z zewnatrz
 * wygladaly jak "zmierzone i czyste". Zapis po kazdym widoku sprawia, ze
 * brakujacy widok jest widoczny jako brakujacy plik.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import {
  elementyPozaViewportem,
  hierarchiaNaglowkow,
  landmarki,
  maleCeleDotykowe,
  siatkiPrzekraczajaceKontener,
  zaladowaneKroje,
} from "./isk403-pomiar";

export const KATALOG = path.join("artefakty", "isk403");
export const ZRZUTY = path.join(KATALOG, "zrzuty");
export const POMIARY = path.join(KATALOG, "pomiary");

export async function przygotujKatalogi(): Promise<void> {
  await mkdir(ZRZUTY, { recursive: true });
  await mkdir(POMIARY, { recursive: true });
}

/**
 * Mierzy jeden widok na jednej szerokosci: zrzut pelnej strony, axe WCAG 2.1 AA,
 * elementy poza viewportem, siatki, naglowki, landmarki, cele dotykowe, kroje.
 */
export async function zmierzWidok(
  page: Page,
  klucz: string,
  sciezka: string,
  szerokosc: number,
): Promise<void> {
  await page.setViewportSize({ width: szerokosc, height: 900 });
  await page.goto(sciezka, { waitUntil: "networkidle" });
  // Pudelka mierzymy PO podmianie kroju — inaczej liczby pochodza z layoutu
  // sprzed zaladowania fontu.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const nazwaZrzutu = `${klucz}-${szerokosc}.png`;
  await page.screenshot({
    path: path.join(ZRZUTY, nazwaZrzutu),
    fullPage: true,
  });

  const axeWynik = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const rekord = {
    klucz,
    sciezka,
    szerokosc,
    url: page.url(),
    tytul: await page.title(),
    zrzut: nazwaZrzutu,
    axe: axeWynik.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      liczba: v.nodes.length,
      opis: v.description,
      cele: v.nodes.slice(0, 6).map((n) => String(n.target.join(" "))),
    })),
    pozaViewportem: await elementyPozaViewportem(page, szerokosc),
    siatki: await siatkiPrzekraczajaceKontener(page),
    naglowki: await hierarchiaNaglowkow(page),
    landmarki: await landmarki(page),
    maleCele: await maleCeleDotykowe(page),
    kroje: await zaladowaneKroje(page),
  };

  await writeFile(
    path.join(POMIARY, `${klucz}-${szerokosc}.json`),
    JSON.stringify(rekord, null, 2),
    "utf8",
  );
}

/** Zapisuje dowolny dodatkowy pomiar (np. przejscie focusem) pod wlasnym kluczem. */
export async function zapiszPomiar(
  klucz: string,
  dane: unknown,
): Promise<void> {
  await writeFile(
    path.join(POMIARY, `${klucz}.json`),
    JSON.stringify(dane, null, 2),
    "utf8",
  );
}
