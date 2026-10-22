// Pomiar punktow zalamania i przepelnienia (ISK-412 / UX-K1 i "drobne").
//
// DLACZEGO OSOBNY SKRYPT, A NIE TEST
// DoD ISK-412 wymaga SUROWYCH LICZB w komentarzu do zgloszenia dla szerokosci
// 320 / 360 / 768 / 1024 / 1440 px. Bramka (`widoki-publiczne-rwd.spec.ts`)
// odpowiada na pytanie "czy jest defekt", a ten skrypt na pytanie "ile dokladnie
// wynosi" — i wypisuje to w formie, ktora da sie wkleic do raportu odbioru.
//
// Mierzy trasy, ktore NIE wymagaja lokalnego stacku Supabase (tak samo jak
// `measure-typography.mjs`): bez kluczy `publicClient()` zwraca `null` w fazie
// builda, wiec widoki renderuja stany puste, a NAWIGACJA, STOPKA, siatka
// "Jak to dziala" i oba ekrany 404 sa statyczne i mierzalne w pelni.
// Siatki zalezne od danych (wyroznione, katalog, trenerzy) pokrywa bramka e2e
// w CI, gdzie Supabase istnieje.
//
// PRZEPELNIENIE MIERZYMY NA DZIECIACH, NIGDY `document.scrollWidth`
// ISK-399 zapisal to jako pulapke weryfikacyjna: `overflow-x: hidden` na
// korzeniu zeruje `scrollWidth` na stale, element dalej wystaje, a bramka jest
// zielona. Dlatego pytamy kazdy element o jego wlasna geometrie.
//
// Uzycie: BASE_URL=http://localhost:4412 node scripts/measure-rwd.mjs
import { chromium } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4412";
const widths = (process.env.WIDTHS ?? "320,360,768,1024,1440")
  .split(",")
  .map(Number);
const routes = (
  process.env.ROUTES ?? "/,/szkolenia,/trenerzy,/kontakt,/nie-ma-takiej-strony"
).split(",");

const browser = await chromium.launch();
const page = await browser.newPage();

/**
 * Tryb nawigacji i rozwiazane kolumny siatek — jedna sonda, zeby naglowek
 * i korpus byly zmierzone w TYM SAMYM renderze. Rozjazd UX-K1 polegal na tym,
 * ze przelaczaly sie przy roznych szerokosciach, wiec pomiar osobno dla kazdego
 * z nich nie dowiodlby niczego o ich zgodnosci.
 */
function probeLayout() {
  return page.evaluate(() => {
    const widoczny = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      return getComputedStyle(el).display !== "none";
    };

    // `gridTemplateColumns` z `getComputedStyle` jest ROZWIAZANY do pikseli,
    // wiec widzi uklad uzyty, a nie zapis `repeat(4, 1fr)` z arkusza.
    const tory = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const value = getComputedStyle(el).gridTemplateColumns;
      const count = value.split(/\s+/).filter((t) => t.endsWith("px")).length;
      return { count, value };
    };

    return {
      navPelna: widoczny(".site-nav"),
      navPrzycisk: widoczny(".site-nav-toggle"),
      steps: tory(".home-steps"),
      scope: tory(".home-scope-grid"),
      footer: tory(".footer-grid"),
      featuredBand1: Boolean(document.querySelector(".home-featured-band-1")),
    };
  });
}

/** Elementy wychodzace poza kadr. Wylaczenia jak w bramce `widoki-publiczne-rwd`. */
function probeOverflow() {
  return page.evaluate(() => {
    const kadr = document.documentElement.clientWidth;
    const limit = kadr + 1;

    const opis = (el) => {
      const klasy = Array.from(el.classList).slice(0, 4).join(".");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
        klasy ? `.${klasy}` : ""
      }`;
    };

    const przycietyPrzezSekcje = (el) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        if (getComputedStyle(node).overflowX !== "visible") return true;
        node = node.parentElement;
      }
      return false;
    };

    const winowajcy = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      if (rect.right <= limit && rect.width <= limit) continue;
      if (przycietyPrzezSekcje(el)) continue;
      winowajcy.push(
        `${opis(el)} right=${Math.round(rect.right)} width=${Math.round(
          rect.width,
        )} kadr=${kadr}`,
      );
      if (winowajcy.length >= 8) break;
    }
    return { kadr, winowajcy };
  });
}

/** Skala naglowkow — po ROLI, bo rozmiar nie idzie za poziomem (ISK-412/UX-Z2). */
function probeHeadings() {
  return page.evaluate(() => {
    const rozmiary = (selector) =>
      Array.from(document.querySelectorAll(selector)).map(
        (el) => getComputedStyle(el).fontSize,
      );
    const unikalne = (list) => Array.from(new Set(list));

    return {
      h1: unikalne(rozmiary("h1")),
      h2: unikalne(rozmiary("h2")),
      pageTitle: unikalne(rozmiary(".ui-page-title")),
      sectionTitle: unikalne(rozmiary(".ui-section-title")),
      subsectionTitle: unikalne(rozmiary(".ui-subsection-title")),
      cardTitle: unikalne(
        rozmiary(
          ".ui-card-title,.training-card-title,.trainer-name,.home-path-title,.home-step-title,.home-funding-title,.home-scope-title,.empty-state-title",
        ),
      ),
    };
  });
}

for (const route of routes) {
  console.log(`\n================ ${route} ================`);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(`${baseUrl}${route}`, {
      // `domcontentloaded`, nie `networkidle`: bez lokalnego stacku Supabase
      // strona nie osiaga ciszy sieciowej i pomiar konczyl sie timeoutem.
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(400);
    const status = response?.status();

    const layout = await probeLayout();
    const overflow = await probeOverflow();

    const nav = layout.navPelna
      ? "pasek pelny"
      : layout.navPrzycisk
        ? "przycisk"
        : "brak";
    const steps = layout.steps ? `${layout.steps.count} kol.` : "—";
    const scope = layout.scope ? `${layout.scope.count} kol.` : "—";
    const footer = layout.footer ? `${layout.footer.count} kol.` : "—";

    console.log(
      `${String(width).padStart(4)}px status=${status} nav=${nav.padEnd(11)}` +
        ` jak-to-dziala=${steps.padEnd(7)} zakres=${scope.padEnd(7)}` +
        ` stopka=${footer.padEnd(7)} poza-kadrem=${overflow.winowajcy.length}`,
    );
    for (const w of overflow.winowajcy) console.log(`        ! ${w}`);
  }

  // Skala naglowkow nie zalezy od szerokosci inaczej niz przez `clamp`, wiec
  // mierzymy ja raz, na najszerszym kadrze, gdzie `clamp` jest nasycony.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const h = await probeHeadings();
  console.log(
    `  naglowki: h1=${JSON.stringify(h.h1)} h2=${JSON.stringify(h.h2)}` +
      ` | page=${JSON.stringify(h.pageTitle)} section=${JSON.stringify(h.sectionTitle)}` +
      ` subsection=${JSON.stringify(h.subsectionTitle)} card=${JSON.stringify(h.cardTitle)}`,
  );
}

await browser.close();
