// WCAG 2.1 AA — bramka dostepnosci E6.
//
// ADR-0005 D4 wymienia siedem widokow do skanu axe: strona glowna, katalog,
// szczegol szkolenia, trenerzy, kontakt, formularz i logowanie. "Formularz"
// traktujemy jako osobny przypadek od "kontaktu": formularz po nieudanej
// walidacji ma inne drzewo dostepnosci (aria-invalid, komunikaty bledow,
// aria-live) niz formularz czysty, a wlasnie tam naruszenia sa najczestsze.
//
// Skan automatyczny wylapuje ~30% naruszen WCAG, dlatego nizej doklejamy
// jawne testy nawigacji klawiatura i powiazania etykiet — rzeczy, ktorych axe
// nie sprawdza, a ktore decyduja o uzywalnosci dla czytnika ekranu.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { clearThrottle, createInquiry, sfx } from "./helpers/data";
import { awaitFormTokenMaturity } from "./helpers/form";
import { contrastSamples, formatSample } from "./helpers/kontrast";
import { serviceClient } from "./helpers/stack";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
}

/** Zwiezly opis naruszen — bez tego komunikat bledu to sciana JSON-a. */
function describe(violations: Awaited<ReturnType<typeof scan>>["violations"]) {
  return violations.map(
    (v) =>
      `${v.id} (${v.impact}) — ${v.help}; wezly: ${v.nodes
        .map((n) => n.target.join(" "))
        .join(", ")}`,
  );
}

/**
 * ISK-410 / CR-B1 — slepa plama nr 2.
 *
 * Kazdy skan wyzej patrzyl wylacznie na `results.violations`. Tymczasem axe
 * NIE zglasza naruszenia kontrastu nad gradientem: nie potrafi wskazac
 * jednego piksela tla, wiec przenosi wynik do `results.incomplete`
 * ("needs review"). Dokladnie tam wyladowal CR-B1 — biel 4,47:1 na
 * `--gradient-brand`. `grep -rn "incomplete" tests/` zwracal zero trafien, to
 * znaczy, ze caly ten kubelek byl u nas niewidzialny i bramka przepuszczala
 * naruszenie, ktore axe faktycznie zauwazyl.
 *
 * Nie pomijamy go globalnie — zamiast tego sprawdzamy kazdy niepewny wynik
 * `color-contrast` wlasna arytmetyka (`contrastSamples`, ktory od ISK-410
 * sklada gradienty) i zadamy, by przechodzil prog AA. Niepewnosc axe zamienia
 * sie wiec w twardy pomiar, a nie w wyjatek.
 */
const INCOMPLETE_DO_SPRAWDZENIA = ["color-contrast"];

async function rozstrzygnijNiepewne(
  page: Page,
  results: Awaited<ReturnType<typeof scan>>,
) {
  const niepewne = results.incomplete.filter((r) =>
    INCOMPLETE_DO_SPRAWDZENIA.includes(r.id),
  );

  const zaNiskie: string[] = [];
  for (const regula of niepewne) {
    for (const node of regula.nodes) {
      // `target` axe to selektor CSS tego wezla — mierzymy dokladnie jego.
      const selector = node.target.join(" ");
      const probki = await contrastSamples(page, selector);
      for (const probka of probki) {
        if (probka.ratio < probka.required) {
          zaNiskie.push(`${selector} → ${formatSample(probka)}`);
        }
      }
    }
  }

  // Kubelki inne niz `color-contrast` wypisujemy, ale nie wywracamy na nich
  // bramki: `incomplete` bywa tam szumem (np. `aria-*` na tresci z CMS-a).
  // Jawna lista zamiast globalnego pominiecia — gdy pojawi sie nowa regula,
  // widac ja w logu i mozna swiadomie zdecydowac.
  const pozostale = results.incomplete
    .filter((r) => !INCOMPLETE_DO_SPRAWDZENIA.includes(r.id))
    .map((r) => `${r.id} x${r.nodes.length}`);
  if (pozostale.length > 0) {
    console.log(`axe incomplete (nieoceniane): ${pozostale.join(", ")}`);
  }

  return zaNiskie;
}

/**
 * ISK-411 / CR-I7: `/polityka-prywatnosci` nie bylo ani skanowane przez axe,
 * ani w petli naglowkow — a jest to trasa wymagana prawnie i linkowana ze
 * stopki kazdego widoku.
 */
const views: Array<[name: string, path: string]> = [
  ["strona glowna", "/"],
  ["katalog", "/szkolenia"],
  ["szczegol szkolenia", "/szkolenia/wprowadzenie-do-ai"],
  ["trenerzy", "/trenerzy"],
  ["kontakt", "/kontakt"],
  ["polityka prywatnosci", "/polityka-prywatnosci"],
  ["logowanie", "/panel/logowanie"],
];

/**
 * Trasy bledu — ISK-411 / CR-I7.
 *
 * Do tej pory `app/not-found.tsx` (56 linii, dodane w ISK-401) NIE BYLO
 * renderowane przez zaden test, a `app/(public)/szkolenia/[slug]/not-found.tsx`
 * mialo wylacznie naga asercje statusu (`public-pages.spec.ts`) — wzorzec
 * wakatowego testu 404: status 404 oddaje takze wbudowany, nieostylowany ekran
 * Next.js, wiec ta asercja przechodzila zarowno przed dodaniem tych widokow,
 * jak i po.
 *
 * Status trzymamy w tablicy i asertujemy, bo to on odrozni nasz widok od
 * przypadkowego 200 na zlej trasie.
 */
const widokiBledu: Array<[name: string, path: string, status: number]> = [
  ["404 globalny", "/nie-ma-takiego-adresu", 404],
  ["404 szczegolu szkolenia", "/szkolenia/nie-ma-takiego-szkolenia", 404],
];

for (const [name, path] of views) {
  test(`axe: ${name} (${path}) bez naruszen krytycznych`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const results = await scan(page);
    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(describe(critical)).toEqual([]);

    // ISK-410: to, czego axe nie umial rozstrzygnac (gradienty marki),
    // dowazamy wlasna arytmetyka zamiast milczaco pomijac.
    expect(await rozstrzygnijNiepewne(page, results)).toEqual([]);
  });
}

for (const [name, path, status] of widokiBledu) {
  test(`axe: ${name} (${path}) bez naruszen krytycznych`, async ({ page }) => {
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} musi oddac ${status} — inaczej skanujemy nie ten widok`,
    ).toBe(status);

    // Dowod, ze to NASZ ekran, a nie wbudowany Next.js: tamten ma angielski
    // komunikat i zero naszych klas. Bez tej asercji usuniecie
    // `app/not-found.tsx` nie zmienilo by wyniku testu.
    await expect(page.locator(".empty-state-title")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Nie znaleźliśmy");

    const results = await scan(page);
    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(describe(critical)).toEqual([]);

    // ISK-410: ekrany bledu tez nosza naglowek i stopke z powierzchniami
    // markowymi, wiec kubelek `incomplete` obowiazuje je tak samo.
    expect(await rozstrzygnijNiepewne(page, results)).toEqual([]);
  });
}

// Panelu nie ma na liscie siedmiu widokow z ADR-0005 D4, ale administrator tez
// korzysta z klawiatury i czytnika ekranu.
//
// Te trzy widoki z tabela byly do ISK-359 oznaczone `test.fail()` z powodu
// defektu POW-4 (`docs/qa/raport-e6.md`): `th` i `td small` malowane
// `--color-text-muted` (#7e857a) daly ~3.8:1 na bialym tle, a WCAG 2.1 AA
// wymaga 4.5:1. Po przejsciu na `--color-text-secondary` (#5b6157 ≈ 6.4:1)
// adnotacja jest zdjeta — te przypadki musza przechodzic normalnie, inaczej
// bramka nie pilnuje niczego.
//
// Trzeci element krotki to DOWOD, ze widok sie wyrenderowal — bo skan pustej
// strony nie dowodzi niczego. Byl tu `hasTable: boolean` i pilnowal dokladnie
// tego: pusta lista nie renderuje ani `th`, ani `td small`, wiec test
// przechodzilby bez sprawdzenia kontrastu, ktorego dotyczy.
// `/panel/szkolenia` i `/panel/trenerzy` maja dane z seeda [DEMO], ale
// `inquiries` seed celowo nie zawiera — zgloszenie dla widoku
// `/panel/zgloszenia` zakladamy wiec sami w `beforeAll`. Bez tego bramka jest
// zielona lokalnie (gdzie zgloszenia zostaly po innych testach) i czerwona
// w CI na swiezej bazie.
//
// ISK-411 / CR-I7 zamienia ten boolean na selektor, bo doklada trasy, ktorych
// ta lista nie miala wcale: formularze edycji (trzy) i ekran braku uprawnien.
// Dla nich "jest tresc" nie znaczy "jest wiersz tabeli", a skan formularza,
// ktory sie nie zbudowal, byl by tak samo wakatowy jak skan pustej tabeli.
// Formularze sa najwiekszym skupieniem kontrolek w produkcie (pola, etykiety,
// `aria-describedby`, checkboxy trenerow), czyli miejscem najbardziej podatnym
// na naruszenia — i jedynym, ktore nie mialo skanu. Adres `nowe` jest
// swiadomy: nie wymaga zasiewu, wiec bramka nie zalezy od danych, a renderuje
// ten sam formularz co edycja istniejacego rekordu.
const panelViews: Array<[name: string, path: string, dowod: string]> = [
  ["panel — start", "/panel", "h1"],
  ["panel — szkolenia", "/panel/szkolenia", "tbody tr"],
  ["panel — trenerzy", "/panel/trenerzy", "tbody tr"],
  ["panel — zgloszenia", "/panel/zgloszenia", "tbody tr"],
  // UWAGA NA SEGMENT "nowy" — kazdy formularz ma INNA forme gramatyczna
  // (`id === "nowe"` / `"nowy"` / `"nowa"`), bo tak brzmi rzeczownik, ktory
  // opisuje. Pomylka nie daje bledu: `isNew` wychodzi `false`, strona szuka
  // rekordu o id "nowe" i oddaje 404 — czyli bramka skanowalaby ekran 404
  // zamiast formularza. Zmierzone w CI (ISK-411), stad selektory `dowod`
  // wskazuja KONKRETNE pole danego edytora, a nie ogolne `form input`: to
  // dowodzi, ze wyrenderowal sie wlasciwy widok, a nie jakikolwiek input.
  ["panel — formularz szkolenia", "/panel/szkolenia/nowe", "#training-title"],
  ["panel — formularz trenera", "/panel/trenerzy/nowy", "#trainer-full-name"],
  [
    "panel — formularz kategorii",
    "/panel/szkolenia/kategorie/nowa",
    "#category-name",
  ],
  [
    "panel — brak uprawnien",
    "/panel/brak-dostepu",
    'form button[type="submit"]',
  ],
];

test.describe("axe: panel administratora (poza wymaganym minimum ADR-0005 D4)", () => {
  test.beforeAll(async () => {
    await createInquiry();
  });

  for (const [name, path, dowod] of panelViews) {
    test(`${name} bez naruszen krytycznych`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(path);

      // Skan widoku, ktory sie nie wyrenderowal, nie dowodzi niczego.
      await expect(page.locator(dowod).first()).toBeVisible();

      const results = await scan(page);
      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(describe(critical)).toEqual([]);
    });
  }

  // ISK-372 / B3: szczegolu zgloszenia nie bylo na tej liscie, bo sciezka jest
  // parametryzowana (`/panel/zgloszenia/[id]`) — i to jedyny widok w panelu,
  // na ktorym bramka UX znalazla naruszenie 1.4.3 (biale "Ustaw: W toku" na
  // tle strony, 1,03:1). Dlatego zakladamy zgloszenie i skanujemy ten adres
  // jawnie; lista nie wystarcza, bo przycisku przejscia statusu na niej nie ma.
  test("panel — szczegol zgloszenia bez naruszen krytycznych", async ({
    page,
  }) => {
    const inquiry = await createInquiry();
    try {
      await loginAsAdmin(page);
      await page.goto(`/panel/zgloszenia/${inquiry.id}`);

      // Skan bez akcji nie dowodzilby niczego o B3.
      await expect(
        page.getByRole("button", { name: "Ustaw: W toku" }),
      ).toBeVisible();

      const results = await scan(page);
      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(describe(critical)).toEqual([]);
    } finally {
      await serviceClient().from("inquiries").delete().eq("id", inquiry.id);
    }
  });
});

test("axe: formularz w stanie bledu walidacji bez naruszen krytycznych", async ({
  page,
}) => {
  await page.goto("/kontakt");
  // Wymuszamy bledy: pusty formularz + brak zgody RODO.
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(page.locator("#rodoAck-error")).toBeVisible();

  const results = await scan(page);
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(describe(critical)).toEqual([]);
});

test.describe("nawigacja klawiatura (WCAG 2.1.1, 2.4.3, 2.4.7)", () => {
  test("katalog: Tab dociera do pol filtra i do pierwszego wyniku, focus jest widoczny", async ({
    page,
  }) => {
    await page.goto("/szkolenia");

    // Przechodzimy Tabem i zbieramy kolejnosc elementow interaktywnych.
    //
    // ISK-410 / CR-I5: wczesniej warunek brzmial "jest outline ALBO jest
    // jakikolwiek box-shadow" i NIGDY nie porownywal stanu zafokusowanego ze
    // spoczynkowym. Karty (`.ui-card-interactive`) oraz inne elementy nosza
    // cien dekoracyjny juz w spoczynku, wiec drugi czlon byl spelniony zanim
    // focus w ogole dotarl do elementu. Scenariusz, ktory tamta asercja
    // przepuszczala: ktos dopisuje `outline: none` linkowi karty bez
    // pierscienia zastepczego — test zielony, uzytkownik klawiatury traci
    // wskaznik. Teraz mierzymy ROZNICE: styl w spoczynku kontra styl po
    // zafokusowaniu, i zadamy, by cokolwiek sie realnie zmienilo.
    const order: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;

        /** Cechy, ktorymi CSS moze narysowac wskaznik focusu. */
        const odczyt = (node: HTMLElement) => {
          const s = getComputedStyle(node);
          return {
            outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
            outlineOffset: s.outlineOffset,
            boxShadow: s.boxShadow,
            border: `${s.borderStyle} ${s.borderWidth} ${s.borderColor}`,
            background: `${s.backgroundColor} ${s.backgroundImage}`,
            color: s.color,
            textDecoration: s.textDecorationLine,
          };
        };

        const zafokusowany = odczyt(el);

        // Stan spoczynkowy TEGO SAMEGO elementu: zdejmujemy focus, czytamy,
        // przywracamy. `preventScroll` zeby nie przesuwac widoku w trakcie
        // przechodzenia Tabem (inaczej kolejne `Tab` moglyby trafic indziej).
        el.blur();
        const spoczynkowy = odczyt(el);
        el.focus({ preventScroll: true });

        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute("name"),
          text: (el.textContent ?? "").trim().slice(0, 40),
          outlineWidth: parseFloat(style.outlineWidth || "0"),
          outlineStyle: style.outlineStyle,
          // Ktore cechy zmienily sie miedzy spoczynkiem a focusem.
          zmienione: (
            Object.keys(zafokusowany) as Array<keyof typeof zafokusowany>
          ).filter((k) => zafokusowany[k] !== spoczynkowy[k]),
          spoczynkowy,
          zafokusowany,
        };
      });
      if (!info) continue;
      order.push(`${info.tag}:${info.name ?? info.text}`);

      // Sam fakt roznicy nie wystarcza — zmiana musi byc WIDOCZNA, czyli
      // dotyczyc rysowanej cechy. Zmiana samego `outline-offset` przy
      // `outline-style: none` niczego nie pokazuje, wiec outline liczymy
      // tylko razem z niezerowa szerokoscia i stylem innym niz `none`.
      const maOutline =
        info.zafokusowany.outline !== info.spoczynkowy.outline &&
        info.outlineStyle !== "none" &&
        info.outlineWidth > 0;
      const innaWidocznaZmiana = info.zmienione.some((k) =>
        [
          "boxShadow",
          "border",
          "background",
          "color",
          "textDecoration",
        ].includes(k),
      );

      expect(
        maOutline || innaWidocznaZmiana,
        `Element ${info.tag} (${info.name ?? info.text}) wyglada po zafokusowaniu TAK SAMO jak w spoczynku — ` +
          `brak wskaznika focusu. Spoczynek: ${JSON.stringify(info.spoczynkowy)}; ` +
          `focus: ${JSON.stringify(info.zafokusowany)}`,
      ).toBe(true);
    }

    // Pola filtra musza byc osiagalne z klawiatury, w kolejnosci dokumentu.
    const q = order.findIndex((o) => o === "input:q");
    expect(
      q,
      `Nie dotarlem Tabem do pola szukania. Kolejnosc: ${order.join(" > ")}`,
    ).toBeGreaterThanOrEqual(0);

    // Druga polowa tej asercji szukala `select:category` i wymagala, zeby stal
    // PO polu frazy. Listy rozwijanej nie ma: obszar wybiera sie rzedem linkow
    // (`FilterPillLink`), ktory w dokumencie stoi PRZED formularzem szukania.
    // Zamiana nie jest zluzowaniem — link musi spelnic to, czego `<select>`
    // nie musial:
    //  1. byc w naturalnej kolejnosci Tab (zaden nie moze miec `tabindex=-1`),
    //  2. nosic `aria-current="page"` na pozycji biezacej, bo stan wybranego
    //     obszaru niesie inaczej wylacznie kolor tla (WCAG 1.4.1), a czytnik
    //     ekranu czytalby wszystkie pigulki identycznie,
    //  3. dac sie uruchomic z klawiatury (Enter), czyli zmienic filtr bez myszy.
    const pierwszaPigulka = order.findIndex((o) => o === "a:Wszystkie");
    expect(
      pierwszaPigulka,
      `Nie dotarlem Tabem do filtra obszarow. Kolejnosc: ${order.join(" > ")}`,
    ).toBeGreaterThanOrEqual(0);
    expect(pierwszaPigulka).toBeLessThan(q);

    const filtry = page.getByRole("navigation", { name: "Filtr obszarów" });
    const pigulki = filtry.getByRole("link");
    // Filtr z jedna pozycja nie jest filtrem — pomiar musi miec na czym stac.
    expect(await pigulki.count()).toBeGreaterThan(1);
    expect(
      await pigulki.evaluateAll(
        (nodes) =>
          nodes.filter((node) => node.getAttribute("tabindex") === "-1").length,
      ),
    ).toBe(0);

    // Bez filtra biezaca pozycja to "Wszystkie" — dokladnie jedna.
    const biezaca = filtry.locator('[aria-current="page"]');
    await expect(biezaca).toHaveCount(1);
    await expect(biezaca).toHaveText("Wszystkie");

    // Zmiana obszaru wylacznie klawiatura: Enter na pigulce przestawia filtr
    // i przenosi `aria-current` na nowa pozycje.
    const obszar = filtry.locator('a[href*="category="]').first();
    await obszar.focus();
    await expect(obszar).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/category=/);
    await expect(filtry.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      /category=/,
    );
  });

  test(
    "formularz: calosc da sie wypelnic i wyslac bez myszy",
    { tag: "@form-submit" },
    async ({ page }) => {
      // Adres musi byc unikatowy na wykonanie: ten test jest powtarzany
      // (`--repeat-each`), `inquiries` nie ma unikatu na e-mailu, a asercja
      // nizej uzywa `.single()` — staly adres wywrocilby ja na drugim przebiegu
      // bledem o wielu wierszach, czytanym jak defekt zapisu.
      const email = `klawiatura-${sfx()}@example.invalid`;
      try {
        // Ten test realnie wysyla zgloszenie, wiec liczy sie do limitu 3/10 min.
        await clearThrottle();
        await page.goto("/kontakt");

        // Focus na pierwszym polu i dalej wylacznie klawiatura.
        await page.getByLabel("Imię i nazwisko").focus();
        await page.keyboard.type("[TEST] Klawiatura Testowa");
        await page.keyboard.press("Tab");
        await page.keyboard.type(email);

        // Nie zakladamy sztywnej kolejnosci pozostalych pol — sprawdzamy to, co
        // jest istotne dla WCAG 2.1.1: kazde pole jest osiagalne i edytowalne
        // z klawiatury, a zgoda RODO da sie zaznaczyc Spacja.
        await page.getByLabel("Telefon").focus();
        await page.keyboard.type("+48 600 100 200");
        await page.getByLabel("Interesujące szkolenie lub obszar").focus();
        await page.keyboard.type("[TEST] Obszar");
        await page.getByLabel("Wiadomość").focus();
        await page.keyboard.type("Zgloszenie wypelnione wylacznie klawiatura.");

        const consent = page.getByRole("checkbox", {
          name: /Potwierdzam zapoznanie się z informacją RODO/,
        });
        await consent.focus();
        await page.keyboard.press("Space");
        await expect(consent).toBeChecked();

        // Przycisk wysylki jest osiagalny i reaguje na Enter.
        const submit = page.getByRole("button", { name: "Wyślij zgłoszenie" });
        await submit.focus();
        await expect(submit).toBeFocused();
        // Token czasowy (ADR-0004 §3) odrzuca wyslanie szybsze niz 3 s — i robi to
        // "cicho", oddajac ekran sukcesu. Bez tego czekania test przeszedlby,
        // nie zapisawszy niczego.
        await awaitFormTokenMaturity(page);
        await page.keyboard.press("Enter");

        await expect(page.getByRole("status")).toContainText(
          "Dziękujemy za zgłoszenie",
        );

        // Ekran potwierdzenia nic nie dowodzi: handler oddaje 200 z tym samym
        // komunikatem takze przy cichym odrzuceniu (za mlody token, honeypot,
        // zly podpis). Dowodem przejscia sciezki klawiaturowej jest wiersz
        // w bazie — bez tego test przechodzilby rowniez przed naprawa tokenu.
        const { data } = await serviceClient()
          .from("inquiries")
          .select("full_name,rodo_ack")
          .eq("email", email)
          .single();
        expect(data?.full_name).toBe("[TEST] Klawiatura Testowa");
        expect(data?.rodo_ack).toBe(true);
      } finally {
        await serviceClient().from("inquiries").delete().eq("email", email);
      }
    },
  );

  test("brak pulapki focusu: z formularza da sie wyjsc Tabem do konca dokumentu", async ({
    page,
  }) => {
    await page.goto("/kontakt");
    await page.getByLabel("Imię i nazwisko").focus();

    // Po dostatecznej liczbie Tabow focus musi opuscic formularz
    // (trafic do stopki/nawigacji albo wyjsc do chrome przegladarki).
    let leftForm = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const insideForm = await page.evaluate(() =>
        Boolean(document.activeElement?.closest("form")),
      );
      if (!insideForm) {
        leftForm = true;
        break;
      }
    }
    expect(leftForm, "Focus nie opuscil formularza — pulapka focusu").toBe(
      true,
    );
  });
});

/**
 * Jeden `h1` i brak przeskokow w hierarchii (WCAG 1.3.1). Wyciagniete z petli
 * w ISK-411, bo ta sama asercja obowiazuje teraz takze trasy bledu i CALY
 * panel — do tej pory petla iterowala wylacznie po `views`, wiec ZADNA strona
 * administracyjna nie miala egzekwowania jednego `h1` (CR-I7).
 */
async function sprawdzNaglowki(page: Page, path: string): Promise<void> {
  /*
   * WYSCIG ZE STRUMIENIOWANIEM ODPOWIEDZI (ISK-413).
   *
   * `page.goto()` konczy sie na zdarzeniu `load`, a to NIE znaczy, ze cala
   * odpowiedz serwera doszla: trasa `/szkolenia/[slug]` jest dynamiczna
   * (`revalidate = 300`, zapytanie do bazy w komponencie serwerowym), wiec
   * Next wysyla najpierw powloke, a tresc — razem z `h1` ekranu 404 —
   * dostrumieniowuje pozniej. Na obciazonym runnerze `document` w momencie
   * pomiaru mial ZERO naglowkow i bramka padala na poprawnym produkcie.
   *
   * ZMIERZONE, nie domniemane. Ten sam test, ta sama asercja, cztery przebiegi:
   *   7m10s -> PASS, 11m02s -> FAIL, 7m09s -> PASS, 14m25s -> FAIL.
   * Czyli korelacja z czasem przebiegu, nie z zawartoscia zmian. Potwierdza to
   * asymetria: `/nie-ma-takiego-adresu` (404 globalny, strona statyczna, bez
   * strumieniowania) nie padl ANI RAZU — padala wylacznie trasa dynamiczna.
   * `chromium-forms` ma `retries: 0`, wiec jedno takie trafienie czerwieni
   * cala bramke.
   *
   * To oczekiwanie NIE oslabia asercji. Jest ograniczone czasem, a licznik
   * `h1` ponizej wykonuje sie tak czy tak: strona, ktora naprawde nie ma `h1`,
   * dalej pada — tylko z czytelnym komunikatem zamiast z golego timeoutu.
   * Wzorzec jest ten sam, co w petli panelu nizej, gdzie `dowod` czeka na
   * wlasciwy widok, zeby bramka nie mierzyla przypadkiem ekranu 404.
   */
  await page
    .locator("h1")
    .first()
    .waitFor({ state: "attached", timeout: 15_000 })
    .catch(() => {
      // Brak `h1` po czasie to realny defekt — oddajemy go asercji nizej.
    });

  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
      Number(h.tagName.slice(1)),
    ),
  );

  expect(
    levels.filter((l) => l === 1).length,
    `${path}: oczekuje dokladnie jednego h1, jest: ${levels.filter((l) => l === 1).length}`,
  ).toBe(1);

  // WCAG 1.3.1: poziom nie moze przeskoczyc o wiecej niz 1 w dol.
  for (let i = 1; i < levels.length; i++) {
    expect(
      levels[i]! - levels[i - 1]!,
      `Przeskok h${levels[i - 1]} -> h${levels[i]} w ${path}; cala hierarchia: ${levels.join(",")}`,
    ).toBeLessThanOrEqual(1);
  }
}

test.describe("semantyka tresci", () => {
  for (const [name, path] of views) {
    test(`${name}: dokladnie jeden h1 i brak przeskokow w hierarchii naglowkow`, async ({
      page,
    }) => {
      await page.goto(path);
      await sprawdzNaglowki(page, path);
    });
  }

  for (const [name, path, status] of widokiBledu) {
    test(`${name}: dokladnie jeden h1 i brak przeskokow w hierarchii naglowkow`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(status);
      await sprawdzNaglowki(page, path);
    });
  }

  // CR-I7: panel nie mial tej bramki ani na jednej trasie.
  //
  // `dowod` jest tu z tego samego powodu co w petli axe, i nie jest ozdoba:
  // przy pierwszym przebiegu w CI trzy trasy formularzy mialy zly segment
  // ("nowe" zamiast "nowy"/"nowa") i oddawaly 404. Ekran 404 ma DOKLADNIE
  // JEDEN `h1`, wiec te trzy testy naglowkow przeszly — mierzac 404, nie
  // formularz. Bez dowodu wlasciwego widoku bramka naglowkow jest wakatowa
  // dla kazdej trasy, ktora da sie pomylic.
  test.describe("panel administratora", () => {
    for (const [name, path, dowod] of panelViews) {
      test(`${name}: dokladnie jeden h1 i brak przeskokow w hierarchii naglowkow`, async ({
        page,
      }) => {
        await loginAsAdmin(page);
        await page.goto(path);
        await expect(page.locator(dowod).first()).toBeVisible();
        await sprawdzNaglowki(page, path);
      });
    }
  });

  test("trenerzy: brak zdjecia nie zostawia obrazka bez alt", async ({
    page,
  }) => {
    // W modelu danych `trainers.photo_url` moze byc NULL. Widok musi wtedy
    // pominac <img> zamiast renderowac pusty src, i nigdy nie zostawiac obrazu
    // bez atrybutu `alt`.
    //
    // Puste `alt` jest bledem wszedzie POZA jawnie dekoracyjnym zdjeciem
    // trenera: `TrainerAvatar` (`.avatar-photo`) celowo oddaje `alt=""`, bo
    // nazwisko stoi obok w naglowku karty, wiec opis bylby powtorzeniem dla
    // czytnika ekranu (WCAG 1.1.1). Wyjatek jest zawezony do tej jednej klasy —
    // blankietowe dopuszczenie `alt=""` przepuscilo by kazdy inny obraz bez
    // tekstu alternatywnego. Zdjecie pojawia sie tu, gdy inny test rownolegle
    // opublikuje trenera z `photo_url`.
    await page.goto("/trenerzy");
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter((img) => {
          if (!img.getAttribute("src")) return true;
          const alt = img.getAttribute("alt");
          if (alt === null) return true;
          if (alt !== "") return false;
          return !(
            img.classList.contains("avatar-photo") ||
            img.getAttribute("role") === "presentation" ||
            img.getAttribute("aria-hidden") === "true"
          );
        })
        .map((img) => img.outerHTML.slice(0, 120)),
    );
    expect(broken).toEqual([]);
  });
});
