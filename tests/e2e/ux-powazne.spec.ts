/**
 * ISK-373 — pozycje **powazne** z powtorzonej bramki UX (ISK-366): P2, P5, P11,
 * P12, P13, P18.
 *
 * Metoda jest ta sama co w bramce i w `ux-blockers.spec.ts`: kazdy test MIERZY.
 * `getComputedStyle` dla koloru i grubosci krawedzi, `getBoundingClientRect` dla
 * celow dotykowych, `document.activeElement` dla fokusu, `naturalWidth` dla
 * wczytania obrazu. Asercja "element jest widoczny" nie zlapalaby ani jednej
 * z tych pozycji — kazda z nich przechodzila przy zielonym zestawie.
 *
 * Co NIE jest tutaj: stan pusty listy trenerow (ISK-373 / P18, druga czesc).
 * Seed `[DEMO]` zawsze tworzy dwoje trenerow, a wycofanie ich z publikacji na
 * czas testu zmienialoby stan globalny wspoldzielonego stacku — rownolegly test
 * czytajacy `/trenerzy` dostalby pusta liste bez zadnego zwiazku ze swoim
 * scenariuszem. Ta sciezka jest pokryta hermetycznie w
 * `tests/unit/trenerzy-widok.test.ts`.
 */
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin, loginViaUi } from "./helpers/auth";
import {
  clearThrottle,
  createTraining,
  deleteTraining,
  sfx,
} from "./helpers/data";
import { USER_EMAIL, USER_PASSWORD, serviceClient } from "./helpers/stack";

// Projekt chromium-forms wykonuje te testy pojedynczo, takze miedzy plikami.
test.beforeEach(async () => {
  await clearThrottle();
});

/** Minimum przyjete w bramce UX (ISK-349/ISK-366) i w `ux-blockers.spec.ts`. */
const MIN_TOUCH_PX = 44;
const NARROW = { width: 360, height: 720 };

/** `--color-border-default` z `app/globals.css` (`--color-neutral-300`, #d4d9cd). */
const BORDER_DEFAULT = "rgb(212, 217, 205)";
/** Stan przed poprawka: `currentColor`, czyli `--color-text-primary` (#0e1511). */
const INK_900 = "rgb(14, 21, 17)";

const CONTACT_FIELDS = [
  "fullName",
  "email",
  "phone",
  "interestArea",
  "message",
] as const;

type BoxMetrics = {
  borderTopColor: string;
  borderTopWidth: string;
  backgroundColor: string;
  outlineStyle: string;
  boxShadow: string;
  ariaInvalid: string | null;
};

async function fieldMetrics(page: Page, id: string): Promise<BoxMetrics> {
  return page.$eval(`#${id}`, (element) => {
    const style = getComputedStyle(element);
    return {
      borderTopColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      backgroundColor: style.backgroundColor,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
      ariaInvalid: element.getAttribute("aria-invalid"),
    };
  });
}

/** Wypelnia formularz poprawnie — punkt wyjscia dla sciezek wysylki. */
async function fillValidInquiry(page: Page, email: string) {
  await page.getByLabel(/Imię i nazwisko/).fill("[TEST] Jan Mierzony");
  await page.getByLabel(/Adres e-mail/).fill(email);
  await page.getByLabel(/Telefon/).fill("+48 600 100 200");
  await page
    .getByLabel(/Interesujące szkolenie lub obszar/)
    .fill("[TEST] Obszar z bramki UX");
  await page
    .getByLabel(/Wiadomość/)
    .fill("Fikcyjna tresc zapytania na potrzeby pomiaru UX (E2E).");
  await page
    .getByRole("checkbox", {
      name: /Potwierdzam zapoznanie się z informacją RODO/,
    })
    .check();
}

test.describe("P2 — obramowania pol uzywaja tokenu, nie currentColor", () => {
  test("kazde pole formularza kontaktowego ma krawedz #d4d9cd", async ({
    page,
  }) => {
    await page.goto("/kontakt");

    for (const id of CONTACT_FIELDS) {
      const metrics = await fieldMetrics(page, id);
      // Asercja glowna: zmierzony kolor to token, nie dziedziczony currentColor.
      expect(metrics.borderTopColor, `pole ${id}`).toBe(BORDER_DEFAULT);
      // Kontrola: dokladna wartosc, ktora bramka zmierzyla dwa razy (ISK-349
      // i ISK-366). Gdyby regresja wrocila, ta linia nazywa ja wprost.
      expect(metrics.borderTopColor, `pole ${id}`).not.toBe(INK_900);
      // Krawedz musi faktycznie istniec — token na krawedzi o zerowej
      // grubosci bylby pomiarem bez znaczenia.
      expect(Number.parseFloat(metrics.borderTopWidth)).toBeGreaterThan(0);
    }
  });

  test("pole wyboru i lista rozwijana w katalogu tez trzymaja token", async ({
    page,
  }) => {
    await page.goto("/szkolenia");
    const colors = await page.$$eval(
      ".catalog-form input, .catalog-form select",
      (nodes) => nodes.map((node) => getComputedStyle(node).borderTopColor),
    );
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) expect(color).toBe(BORDER_DEFAULT);
  });
});

test.describe("P12 — pole z bledem jest rozpoznawalne bez fokusu", () => {
  test("blad zmienia krawedz i tlo; poprawne pole zostaje przy tokenie", async ({
    page,
  }) => {
    await page.goto("/kontakt");

    // Jedno pole wypelnione poprawnie, dwa puste — dokladnie uklad pomiaru
    // z bramki (ISK-366, tabela w P12).
    await page.getByLabel(/Imię i nazwisko/).fill("[TEST] Jan Mierzony");
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    // Walidacja po stronie klienta musi sie domknac, zanim mierzymy.
    await expect(page.getByRole("alert").first()).toContainText(
      /Popraw zaznaczone pola/,
    );

    // KLUCZOWE: zdejmujemy fokus, zeby pierscien fokusu nie udawal oznaczenia
    // bledu. To samo zastrzezenie zrobila bramka.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await expect(page.locator("#email")).not.toBeFocused();

    const valid = await fieldMetrics(page, "fullName");
    const invalid = await fieldMetrics(page, "email");

    expect(valid.ariaInvalid).toBe("false");
    expect(invalid.ariaInvalid).toBe("true");

    // Przed poprawka oba wiersze tej tabeli byly identyczne.
    expect(invalid.borderTopColor).not.toBe(valid.borderTopColor);
    // Kolor nie jest jedynym nosnikiem (WCAG 1.4.1): grubosc krawedzi rowniez
    // sie zmienia, a komunikat tekstowy pod polem stoi niezaleznie.
    expect(Number.parseFloat(invalid.borderTopWidth)).toBeGreaterThan(
      Number.parseFloat(valid.borderTopWidth),
    );
    expect(invalid.backgroundColor).not.toBe(valid.backgroundColor);
    // Oznaczenie nie pochodzi z fokusu — pole nie jest zafokusowane.
    expect(invalid.outlineStyle).toBe("none");

    // Komunikat tekstowy i powiazanie przez `aria-describedby` zostaja (3.3.1).
    await expect(page.locator("#email")).toHaveAttribute(
      "aria-describedby",
      "email-error",
    );
  });

  test("etykiety pol wymaganych oznaczaja wymagalnosc", async ({ page }) => {
    await page.goto("/kontakt");

    // Objasnienie gwiazdki stoi w formularzu — oznaczenie bez legendy byloby
    // samo w sobie zagadka.
    await expect(page.getByText(/Pola oznaczone gwiazdką/)).toBeVisible();

    // Kazde pole wymagane wg `inquirySchema`: gwiazdka w etykiecie
    // (warstwa wizualna) + `aria-required` na kontrolce (warstwa dla czytnika).
    const required = ["fullName", "email", "phone", "message"] as const;
    for (const id of required) {
      const labelText = await page.$eval(
        `label[for="${id}"]`,
        (node) => node.textContent ?? "",
      );
      expect(labelText, `etykieta ${id}`).toContain("*");
      await expect(page.locator(`#${id}`)).toHaveAttribute(
        "aria-required",
        "true",
      );
    }

    // Zgoda RODO jest wymagana i jej etykieta tez to mowi.
    const rodo = page.getByRole("checkbox", {
      name: /Potwierdzam zapoznanie się z informacją RODO/,
    });
    await expect(rodo).toHaveAttribute("aria-required", "true");
    await expect(page.locator("label", { has: rodo }).first()).toContainText(
      "*",
    );

    // Pole „Nazwa firmy” pojawia sie tylko dla zgloszenia firmowego — i wtedy
    // jest wymagane (`superRefine`), wiec oznaczenie jest zawsze prawdziwe.
    await page.getByRole("radio", { name: "Firma" }).check();
    const companyLabel = await page.$eval(
      'label[for="companyName"]',
      (node) => node.textContent ?? "",
    );
    expect(companyLabel).toContain("*");
  });

  test("„Interesujące szkolenie” jest wymagane tylko bez wskazanego szkolenia", async ({
    page,
  }) => {
    // Negatywna strona reguly: `inquirySchema.superRefine` wymaga tego pola
    // dopiero wtedy, gdy zgloszenie nie wskazuje szkolenia. Gdyby gwiazdka
    // stala bezwarunkowo, klamalaby na jednym z dwoch wejsc w formularz.
    await page.goto("/kontakt");
    expect(
      await page.$eval(
        'label[for="interestArea"]',
        (node) => node.textContent ?? "",
      ),
    ).toContain("*");

    const training = await createTraining({
      published: true,
      titlePrefix: "[TEST] Oznaczenie wymagalnosci",
    });
    try {
      await page.goto(`/kontakt?szkolenie=${training.slug}`);
      await expect(page.getByTestId("selected-training")).toBeVisible();
      expect(
        await page.$eval(
          'label[for="interestArea"]',
          (node) => node.textContent ?? "",
        ),
      ).not.toContain("*");
      await expect(page.locator("#interestArea")).toHaveAttribute(
        "aria-required",
        "false",
      );
    } finally {
      await deleteTraining(training.id);
    }
  });
});

test.describe("P13 — afordancja wysylki i wyjscie po sukcesie", () => {
  /**
   * Odpowiedz `/api/inquiries` jest tu PODSTAWIANA, a nie realna. To swiadomy
   * wybor zakresu: mierzymy warstwe prezentacji (tekst przycisku, `aria-busy`,
   * wskaznik, fokus, naglowek, dalszy krok), a opoznienie musi byc
   * deterministyczne, zeby pomiar stanu „w trakcie wysylki” nie byl wyscigiem.
   * Realna sciezka zapisu — razem z wierszem w bazie — jest pokryta w
   * `ux-blockers.spec.ts` (P4) i `formularz-zgloszenia.spec.ts`; gdyby ten test
   * byl jedynym dowodem na dzialanie formularza, bylby pozorny.
   */
  // 4 s, a nie 1,5 s jak w bramce: pomiar stanu „w trakcie” musi sie zmiescic
  // w okresie jego istnienia takze na obciazonej maszynie z kilkoma workerami.
  async function stubSlowInquiry(page: Page, delayMs = 4000) {
    await page.route("**/api/inquiries", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "accepted" }),
      });
    });
  }

  test("w trakcie wysylki przycisk zmienia tekst i nosi aria-busy", async ({
    page,
  }) => {
    await stubSlowInquiry(page);
    await page.goto("/kontakt");
    await fillValidInquiry(page, `pomiar-${sfx()}@example.invalid`);

    const submit = page.getByRole("button", { name: "Wyślij zgłoszenie" });
    await submit.click();

    // Stan „w trakcie”: przed poprawka jedynym sygnalem bylo `opacity: 0.6`.
    const busyButton = page.getByRole("button", { name: /Wysyłanie/ });
    await expect(busyButton).toBeVisible();
    await expect(busyButton).toHaveAttribute("aria-busy", "true");
    await expect(busyButton).toBeDisabled();
    // Wskaznik graficzny obok tekstu.
    await expect(busyButton.locator("span[aria-hidden='true']")).toBeVisible();
    // Region ogloszeniowy, ktorego bramka nie znalazla w ogole.
    await expect(page.getByRole("status")).toContainText(
      /Wysyłanie zgłoszenia/,
    );
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  });

  test("po sukcesie fokus idzie na komunikat, a naglowek opisuje stan", async ({
    page,
  }) => {
    await stubSlowInquiry(page, 50);
    await page.goto("/kontakt");

    // Stan wyjsciowy — zachetą jest wypelnienie formularza.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Zapytaj o szkolenie",
    );

    await fillValidInquiry(page, `pomiar-${sfx()}@example.invalid`);
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

    const status = page.getByRole("status");
    await expect(status).toContainText("Dziękujemy za zgłoszenie");

    // Przed poprawka `document.activeElement` bylo `BODY`.
    const active = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      role: document.activeElement?.getAttribute("role") ?? null,
    }));
    expect(active.tag).not.toBe("BODY");
    expect(active.role).toBe("status");

    // Naglowek i lead nie zachecaja juz do wypelnienia formularza, ktorego nie ma.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Zgłoszenie przyjęte",
    );
    await expect(page.getByText(/Wypełnij formularz/)).toHaveCount(0);

    // Jest dalszy krok, nie tylko globalna nawigacja.
    const next = page.getByRole("link", { name: /Wróć do katalogu szkoleń/ });
    await expect(next).toBeVisible();
    await next.click();
    await expect(page).toHaveURL(/\/szkolenia$/);
  });
});

test.describe("P5 — cele dotykowe w warstwie publicznej", () => {
  test.use({ viewport: NARROW });

  /**
   * Skanujemy linki i przyciski STOJACE SAMODZIELNIE. Dwie grupy sa wylaczone,
   * obie swiadomie:
   *
   *  - odnosniki w biegu zdania (`p`, `li`) — WCAG 2.5.5 wprost wyjmuje
   *    „inline” z wymogu rozmiaru, a podniesienie im wysokosci rozerwaloby
   *    interlinie akapitu (inaczej test zglaszalby kazdy odnosnik w polityce
   *    prywatnosci),
   *  - odnosniki bedace naglowkiem karty (`h1`–`h6`) — ich rozmiar wyznacza
   *    skala typograficzna, a do tego samego celu prowadzi w tej samej karcie
   *    „Zobacz szczegoly →”, ktore minimum spelnia (wyjatek „equivalent”
   *    z 2.5.5). Bramka UX tez ich nie zglosila.
   */
  async function assertStandaloneTargets(page: Page, label: string) {
    const small = await page.$$eval(
      "main a, main button, footer a, footer button, header a, header button",
      (nodes, min) =>
        nodes
          .filter((node) => !node.closest("p, li, h1, h2, h3, h4, h5, h6"))
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              text: (node.textContent ?? "").trim().slice(0, 40),
              className: node.className,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
            };
          })
          .filter((box) => box.width > 0 && box.height > 0)
          .filter((box) => box.width < min || box.height < min),
      MIN_TOUCH_PX,
    );
    expect(
      small,
      `${label}: cele ponizej ${MIN_TOUCH_PX}px — ${JSON.stringify(small)}`,
    ).toEqual([]);
  }

  test("strona glowna: karty, naglowki sekcji i stopka", async ({ page }) => {
    await page.goto("/");
    // Nazwane wprost, bo to te pomiary z raportu: 125,7 x 18,7 i 120,1 x 24.
    const cardLink = page.locator(".card-footer a").first();
    if (await cardLink.count()) {
      const box = await cardLink.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    }
    const catalogLink = page.getByRole("link", { name: /Pełny katalog/ });
    const catalogBox = await catalogLink.boundingBox();
    expect(catalogBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);

    await assertStandaloneTargets(page, "strona glowna");
  });

  test("stopka: odnosniki maja 44 px wysokosci (bylo 328 x 24)", async ({
    page,
  }) => {
    await page.goto("/kontakt");
    const boxes = await page.$$eval(".footer-grid a", (nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: (node.textContent ?? "").trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.height, `stopka: ${box.text}`).toBeGreaterThanOrEqual(
        MIN_TOUCH_PX,
      );
    }
  });

  test("formularz kontaktowy: przycisk wysylki i wiersze kontrolek", async ({
    page,
  }) => {
    await page.goto("/kontakt");

    // Raport: 173,1 x 40 — bez zmian wobec ISK-349.
    const submit = page.getByRole("button", { name: "Wyślij zgłoszenie" });
    const box = await submit.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);

    // Kontrolka radio/checkbox miala 13 x 13 px, a klikalny wiersz etykiety
    // 24 px. Celem dotykowym jest etykieta (klikniecie przelacza kontrolke),
    // wiec mierzymy wiersz etykiety — i sprawdzamy, ze faktycznie przelacza.
    const rows = await page.$$eval(
      "form label:has(input[type='radio']), form label:has(input[type='checkbox'])",
      (nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            text: (node.textContent ?? "").trim().slice(0, 30),
            height: Math.round(rect.height),
            control: Math.round(
              node.querySelector("input")!.getBoundingClientRect().height,
            ),
          };
        }),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.height, `wiersz: ${row.text}`).toBeGreaterThanOrEqual(
        MIN_TOUCH_PX,
      );
      // Sama kontrolka tez przestala byc mikroskopijna.
      expect(row.control, `kontrolka: ${row.text}`).toBeGreaterThanOrEqual(16);
    }

    const firma = page.getByRole("radio", { name: "Firma" });
    await page.locator("label", { has: firma }).click();
    await expect(firma).toBeChecked();

    await assertStandaloneTargets(page, "kontakt");
  });

  test("katalog, trenerzy i szczegol szkolenia", async ({ page }) => {
    await page.goto("/szkolenia");
    await assertStandaloneTargets(page, "katalog");

    await page.goto("/trenerzy");
    await assertStandaloneTargets(page, "trenerzy");

    const training = await createTraining({
      published: true,
      titlePrefix: "[TEST] Cele dotykowe szczegol",
    });
    try {
      await page.goto(`/szkolenia/${training.slug}`);
      // „← Wszystkie szkolenia” to samodzielny cel dotykowy, nie odnosnik
      // w biegu zdania.
      const back = page.locator(".back-link");
      const backBox = await back.boundingBox();
      expect(backBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      await assertStandaloneTargets(page, "szczegol szkolenia");
    } finally {
      await deleteTraining(training.id);
    }
  });
});

test.describe("P11 — ekran braku uprawnien nie ujawnia nazw obiektow bazy", () => {
  test("komunikat bez nazwy tabeli, z droga uzyskania dostepu", async ({
    page,
  }) => {
    // Ekranu NIE da sie otworzyc wprost: `proxy.ts` pilnuje calego `/panel/*`
    // i bez sesji przekierowuje na logowanie (307). Dochodzimy tu tak, jak
    // dochodzi do niego czlowiek — logujac sie kontem bez uprawnien (D5.9).
    await loginViaUi(page, USER_EMAIL, USER_PASSWORD);
    await expect(page).toHaveURL(/\/panel\/brak-dostepu$/);

    await expect(
      page.getByRole("heading", { name: "To konto nie ma dostępu do panelu" }),
    ).toBeVisible();

    const body = await page.evaluate(() => document.body.innerText);
    // Nazwa tabeli wyciekala doslownie: „wpisany do rejestru admin_users”.
    expect(body).not.toContain("admin_users");
    // Zaden inny obiekt bazy tez nie ma tu czego szukac.
    for (const name of ["inquiries", "trainings", "trainers", "categories"]) {
      expect(body, `nazwa obiektu bazy w tresci: ${name}`).not.toContain(name);
    }

    // Kryterium 6 z DoD bramki: ekran mowi, do kogo sie zglosic.
    const contact = page.getByRole("link", { name: /biuro@iskt\.pl/ });
    await expect(contact).toBeVisible();
    await expect(contact).toHaveAttribute("href", "mailto:biuro@iskt.pl");
    // Odnosnik musi byc odroznialny od tekstu — regula bazowa zeruje
    // `text-decoration` dla kazdego `a`.
    expect(
      await contact.evaluate(
        (node) => getComputedStyle(node).textDecorationLine,
      ),
    ).toContain("underline");

    // Wyjscie z sytuacji zostaje.
    await expect(
      page.getByRole("button", { name: "Wyloguj się" }),
    ).toBeVisible();
  });
});

test.describe("P18 — niedostepne zdjecie spada do awatara z inicjalami", () => {
  /**
   * `/trenerzy` ma `revalidate = 300` i w CI jest prerenderowane w czasie
   * `npm run build` (stack Supabase stoi wtedy juz z seedem). Wiersz dopisany
   * kluczem `service_role` NIE pojawi sie na tej stronie przez pelne 5 minut —
   * test opartyo samo `insert` + `goto` bylby wiec pozorny i padal z powodu
   * cache, nie z powodu kodu. Dlatego profil zakladamy jako szkic i publikujemy
   * go z panelu: `setPublished` wola `revalidatePath("/trenerzy")`, czyli ta
   * sama sciezke inwalidacji, ktora ma administrator.
   */
  async function createDraftTrainer(fields: {
    fullName: string;
    headline: string;
    photoUrl: string | null;
    competence: string;
  }) {
    const svc = serviceClient();
    const suffix = sfx();
    // Nazwa musi byc unikalna, bo to po NIEJ znajdujemy wiersz w panelu:
    // tabela trenerow pokazuje slug tylko wtedy, gdy `headline` jest puste
    // (`trainer.headline || /${trainer.slug}`), a tutaj `headline` jest
    // wypelnione. Trzeci czlon nazwy nie psuje inicjalow — `trainerInitials`
    // bierze dwa pierwsze.
    const fullName = `${fields.fullName} ${suffix}`;
    const { data, error } = await svc
      .from("trainers")
      .insert({
        slug: `test-trener-${suffix}`,
        full_name: fullName,
        headline: fields.headline,
        bio: "Profil testowy na potrzeby pomiaru degradacji awatara (E2E).",
        photo_url: fields.photoUrl,
        competences: [fields.competence],
        is_published: false,
      })
      .select("id,full_name")
      .single();
    if (error) throw error;
    return { id: data.id as string, fullName: data.full_name as string };
  }

  async function publishFromPanel(page: Page, fullName: string) {
    await loginAsAdmin(page);
    await page.goto("/panel/trenerzy");
    const row = page.getByRole("row").filter({ hasText: fullName });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Publikuj" }).click();
    // Uwaga: tabela trenerow pisze „Opublikowany”, a tabela szkolen
    // „Opublikowane” — to nie literowka w tescie.
    await expect(row.getByText("Opublikowany")).toBeVisible();
  }

  test("photo_url zwracajace 404 nie daje pustego krazka", async ({ page }) => {
    const svc = serviceClient();
    const trainer = await createDraftTrainer({
      fullName: "[TEST] Anna Bezzdjecia",
      headline: "Zdjecie wskazuje na usuniety plik",
      // Adres w tym samym origin, zeby 404 przyszlo od aplikacji i nie
      // wymagalo sieci zewnetrznej (ADR-0005 D7).
      photoUrl: `/__isk373-nie-ma-takiego-zdjecia.png`,
      competence: "[TEST] Degradacja",
    });

    try {
      await publishFromPanel(page, trainer.fullName);
      await page.goto("/trenerzy");

      const card = page
        .locator(".trainer-card")
        .filter({ hasText: trainer.fullName });
      await expect(card).toBeVisible();

      const avatar = card.locator(".avatar");
      await expect(avatar).toBeVisible();

      // Inicjaly sa WIDOCZNE. Przed poprawka byl tu pusty zielony krazek:
      // `naturalWidth = 0`, `alt = ""`, zaden zastepnik.
      await expect(avatar).toHaveText("AB");

      // Krazek ma realne wymiary — zastepnik, a nie zapadnieta ramka.
      const box = await avatar.boundingBox();
      expect(box!.width).toBeGreaterThan(50);
      expect(box!.height).toBeGreaterThan(50);

      // Martwy `img` nie zostaje w drzewie: `onError` go usuwa, a `data-avatar`
      // mowi, ktora warstwa jest na wierzchu.
      await expect(avatar).toHaveAttribute("data-avatar", "initials");
      await expect(avatar.locator("img")).toHaveCount(0);
    } finally {
      await svc.from("trainers").delete().eq("id", trainer.id);
    }
  });

  test("dzialajace zdjecie nadal zakrywa zastepnik", async ({ page }) => {
    // Kontrapunkt: gdyby poprawka po prostu zawsze pokazywala inicjaly,
    // poprzedni test przechodzilby, a funkcja bylaby zepsuta.
    const svc = serviceClient();
    const trainer = await createDraftTrainer({
      fullName: "[TEST] Celina Zezdjeciem",
      headline: "Zdjecie wczytuje sie poprawnie",
      // Obraz 1x1 jako `data:` — wczytuje sie na pewno i nie wychodzi do sieci.
      photoUrl:
        "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=",
      competence: "[TEST] Kontrapunkt",
    });

    try {
      await publishFromPanel(page, trainer.fullName);
      await page.goto("/trenerzy");

      const card = page
        .locator(".trainer-card")
        .filter({ hasText: trainer.fullName });
      const avatar = card.locator(".avatar");
      await expect(avatar).toHaveAttribute("data-avatar", "photo");

      const image = avatar.locator("img");
      await expect(image).toBeVisible();
      // Zasob faktycznie sie wczytal — `naturalWidth` to jedyny dowod, ze
      // zdjecie jest na wierzchu, a nie ze jest w drzewie.
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.naturalWidth),
        )
        .toBeGreaterThan(0);
    } finally {
      await svc.from("trainers").delete().eq("id", trainer.id);
    }
  });
});
