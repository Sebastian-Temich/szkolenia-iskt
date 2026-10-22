import { test } from "@playwright/test";
import { przejscieFocusem } from "../e2e/helpers/isk403-pomiar";

test("pierscien focusu na probce ze skompilowanym CSS", async ({ page }) => {
  await page.goto("file://" + process.env.PAPERCLIP_RUN_SCRATCH_DIR + "/fokus/probka.html");
  await page.evaluate(() => document.fonts.ready);
  const wynik = await przejscieFocusem(page, 7);
  for (const w of wynik) {
    console.log(
      `${String(w.indeks).padEnd(2)} ${w.selektor.padEnd(22)} pierscien=${String(w.maPierscien).padEnd(5)} grubosc=${w.szerokoscPierscienia} kolor=${w.kolorPierscienia} tlo=${w.tloOtoczenia} kontrast=${w.kontrast}`,
    );
  }
});
