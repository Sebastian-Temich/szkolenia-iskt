import { test } from "@playwright/test";
import { siatkiPrzekraczajaceKontener } from "../e2e/helpers/isk403-pomiar";

test("kontrola pozytywna detektora siatek", async ({ page }) => {
  await page.goto("file://" + process.env.PAPERCLIP_RUN_SCRATCH_DIR + "/fokus/siatka.html");
  const w = await siatkiPrzekraczajaceKontener(page);
  console.log("WYKRYTE siatki poza kontenerem:", JSON.stringify(w, null, 1));
  console.log("(oczekiwane: tylko #zla — 200+200+24=424 > 360)");
});
