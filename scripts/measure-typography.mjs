// Pomiar typografii i kroju przez `getComputedStyle` (ISK-364 / B2 i P1).
//
// Osobny skrypt, nie test Playwrighta, bo DoD wymaga surowych liczb w
// komentarzu do zgloszenia. Celowo mierzy trasy, ktore NIE czytaja bazy
// (`/kontakt` bez parametru, `/panel/logowanie`), zeby pomiar dal sie powtorzyc
// bez lokalnego stacku Supabase.
//
// Uzycie: BASE_URL=http://localhost:4373 node scripts/measure-typography.mjs
import { chromium } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4373";
const routes = (process.env.ROUTES ?? "/kontakt,/panel/logowanie").split(",");

const browser = await chromium.launch();
const page = await browser.newPage();

function metrics(selector) {
  return page
    .$eval(selector, (element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
      };
    })
    .catch(() => null);
}

for (const route of routes) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  console.log(`\n=== ${route} ===`);
  for (const selector of ["body", "h1", "h2", "p", "form legend", "label"]) {
    const m = await metrics(selector);
    if (!m) continue;
    console.log(
      `${selector.padEnd(14)} size=${m.fontSize.padEnd(8)} weight=${String(
        m.fontWeight,
      ).padEnd(4)} line=${m.lineHeight.padEnd(10)} family=${m.fontFamily}`,
    );
  }

  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts).map((face) => ({
      family: face.family,
      weight: face.weight,
      status: face.status,
    }));
  });
  console.log("document.fonts:", JSON.stringify(faces));

  const glyphs = await page.evaluate(async () => {
    await document.fonts.ready;
    const family = getComputedStyle(document.body).fontFamily;
    const first = family
      .split(",")[0]
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const ctx = document.createElement("canvas").getContext("2d");
    const width = (text, font) => {
      ctx.font = font;
      return Math.round(ctx.measureText(text).width * 100) / 100;
    };
    const sample = "Ćwiczenia: zażółć gęślą jaźń";
    return {
      firstFamily: first,
      available: document.fonts.check(`32px "${first}"`),
      sampleInFont: width(sample, `400 32px "${first}"`),
      sampleInMono: width(sample, "400 32px monospace"),
      a: width("a", `400 48px "${first}"`),
      aOgonek: width("ą", `400 48px "${first}"`),
      l: width("l", `400 48px "${first}"`),
      lKreska: width("ł", `400 48px "${first}"`),
    };
  });
  console.log("glyphs:", JSON.stringify(glyphs));
}

await browser.close();
