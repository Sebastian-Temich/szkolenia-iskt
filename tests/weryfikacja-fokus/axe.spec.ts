import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("kontrola pozytywna axe (ten sam zestaw tagow co pomiar)", async ({ page }) => {
  await page.goto("file://" + process.env.PAPERCLIP_RUN_SCRATCH_DIR + "/fokus/axe-kontrola.html");
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  console.log("NARUSZENIA:", r.violations.length);
  for (const v of r.violations) console.log(`   ${v.impact}  ${v.id}  (${v.nodes.length})`);
  console.log("(brak dokumentu bez lang/title tez powinien wyjsc — to dowodzi, ze potok dziala)");
});
