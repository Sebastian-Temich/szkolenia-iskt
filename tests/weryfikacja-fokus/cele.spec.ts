import { test } from "@playwright/test";
import { maleCeleDotykowe } from "../e2e/helpers/isk403-pomiar";

test("filtr malych celow dotykowych", async ({ page }) => {
  await page.goto("file://" + process.env.PAPERCLIP_RUN_SCRATCH_DIR + "/fokus/cele.html");
  const wynik = await maleCeleDotykowe(page);
  console.log("ZGLOSZONE jako male cele:");
  for (const w of wynik) console.log(`   ${w.selektor} ${w.width}x${w.height}`);
  console.log("(oczekiwane: #rodoAck i #maly-przycisk; BEZ #company_website, BEZ a.underline, BEZ #duzy-przycisk)");
});
