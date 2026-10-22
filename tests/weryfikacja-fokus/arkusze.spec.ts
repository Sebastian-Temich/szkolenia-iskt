/**
 * ISK-403 — arkusze zestawieniowe do raportu.
 *
 * Komplet zrzutow jest kryterium odbioru, ale 48 pojedynczych plikow jest
 * nieczytelne na karcie. Skladamy wiec arkusze: wzorzec OBOK produktu dla
 * landingu (rdzen porownania) oraz arkusze stykowe wszystkich widokow.
 * Sklad robimy przegladarka, ktora juz mamy — bez nowej zaleznosci.
 */
import { test } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const KORZEN = process.cwd();
const ZRZUTY = path.join(KORZEN, "artefakty", "isk403", "zrzuty");
const WZORZEC = path.join(KORZEN, "artefakty", "isk403", "wzorzec");
const WYJSCIE = path.join("artefakty", "isk403", "arkusze");

const STYL = `
  body{margin:0;background:#0e1511;color:#f6faf4;font:13px/1.4 -apple-system,system-ui,sans-serif}
  h2{font-size:17px;margin:20px 16px 10px;color:#a6d08a}
  .rzad{display:flex;gap:14px;padding:0 16px 18px;align-items:flex-start}
  .kol{display:flex;flex-direction:column;gap:6px}
  .tyt{font-weight:600;font-size:12px;color:#cfe3c3}
  img{display:block;border:1px solid #2c3a30;background:#fff;object-fit:contain;object-position:top}
`;

async function arkusz(page: import("@playwright/test").Page, nazwa: string, html: string) {
  await mkdir(WYJSCIE, { recursive: true });
  await page.setViewportSize({ width: 1500, height: 1000 });
  // Arkusz MUSI byc prawdziwym plikiem file://. Przy `setContent` strona ma
  // adres `about:blank`, a Chromium nie wczytuje do niej podzasobow `file://` —
  // pierwsza wersja dawala arkusze z samymi ikonami zepsutych obrazkow i test
  // i tak byl zielony. Zapisujemy wiec HTML obok zrzutow i tam nawigujemy.
  const strona = path.join(KORZEN, WYJSCIE, `${nazwa}.html`);
  await writeFile(strona, `<!doctype html><meta charset="utf-8"><style>${STYL}</style>${html}`, "utf8");
  await page.goto("file://" + strona, { waitUntil: "load" });
  // Twardy dowod, ze kazdy obrazek faktycznie sie zaladowal.
  const zepsute = await page.evaluate(() =>
    Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).length,
  );
  if (zepsute > 0) throw new Error(`arkusz ${nazwa}: ${zepsute} obrazkow sie nie zaladowalo`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(WYJSCIE, `${nazwa}.png`), fullPage: true });
  await rm(strona, { force: true });
}

function kadr(plik: string, tytul: string, wys: number, szer: number) {
  return `<div class="kol"><div class="tyt">${tytul}</div><img src="file://${plik}" width="${szer}" height="${wys}"></div>`;
}

test("arkusz: wzorzec obok produktu (landing)", async ({ page }) => {
  let html = "";
  for (const w of [360, 768, 1440]) {
    const szer = w === 1440 ? 460 : w === 768 ? 380 : 260;
    html += `<h2>Landing @ ${w} px — WZORZEC obok PRODUKTU (V1)</h2><div class="rzad">
      ${kadr(path.join(WZORZEC, `wzorzec-landing-${w}.png`), "WZORZEC", 900, szer)}
      ${kadr(path.join(ZRZUTY, `landing-${w}.png`), "PRODUKT V1", 900, szer)}
    </div>`;
  }
  await arkusz(page, "porownanie-landing-wzorzec-produkt", html);
});

const PUBLICZNE = ["landing", "katalog", "kurs", "trenerzy", "kontakt", "polityka"];
const PANEL = ["panel-logowanie", "panel-pulpit", "panel-szkolenia", "panel-trenerzy", "panel-zgloszenia", "panel-brak-dostepu"];
const BRZEGOWE = ["katalog-brak-wynikow", "katalog-filtr-obszar", "kurs-404"];

for (const [nazwa, widoki] of [
  ["arkusz-widoki-publiczne", PUBLICZNE],
  ["arkusz-panel", PANEL],
  ["arkusz-stany-brzegowe", BRZEGOWE],
] as const) {
  test(`arkusz stykowy: ${nazwa}`, async ({ page }) => {
    let html = "";
    for (const v of widoki) {
      html += `<h2>${v} — 360 / 768 / 1440 px</h2><div class="rzad">
        ${kadr(path.join(ZRZUTY, `${v}-360.png`), "360", 700, 230)}
        ${kadr(path.join(ZRZUTY, `${v}-768.png`), "768", 700, 330)}
        ${kadr(path.join(ZRZUTY, `${v}-1440.png`), "1440", 700, 520)}
      </div>`;
    }
    await arkusz(page, nazwa, html);
  });
}
