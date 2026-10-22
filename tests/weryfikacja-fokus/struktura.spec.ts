import { test } from "@playwright/test";
import { hierarchiaNaglowkow } from "../e2e/helpers/isk403-pomiar";
const WZORZEC =
  "/Users/ST/Documents/ISKT/Aplikacje/Strona_www_szkolenia_iskt/Szablon strony szkolenia.iskt.pl/Szkolenia ISKT.html";
test("inwentarz sekcji wzorca", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("file://" + WZORZEC, { waitUntil: "load" });
  await page.waitForTimeout(600);
  const n = await hierarchiaNaglowkow(page);
  console.log("WZORZEC h1=" + n.liczbaH1 + " przeskoki=" + JSON.stringify(n.przeskoki));
  for (const p of n.poziomy) console.log(`  h${p.poziom}  ${p.tekst}`);
});
