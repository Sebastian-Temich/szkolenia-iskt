/**
 * ISK-419 — weryfikacja celow dotykowych zgloszonych przez helper pomiarowy.
 *
 * `pomiary/panel-szkolenie-*.json` raportuja 5 celow 18x18 px
 * (`input#training-funding`, `#training-featured`, 3x `#training-trainer-*`),
 * czyli pod progiem 24x24 z WCAG 2.2 SC 2.5.8. Skan axe tego NIE widzi, bo
 * zbieracz uzywa tagow wcag2a/2aa/21a/21aa — 2.5.8 jest dopiero w 2.2.
 *
 * Pytanie, ktore rozstrzyga ten plik: czy 18x18 to rozmiar CELU, czy tylko
 * rozmiar `input`a. `components/ui/field.tsx:239` owija `input` w
 * `<label htmlFor>` razem z tekstem, wiec klikalny jest caly rzad — ale
 * markup to przeslanka, nie pomiar. Mierzymy prostokat `label.ui-checkbox`
 * i jego realna klikalnosc, zeby nie powtorzyc falszywego defektu
 * z `KOREKTA-POMIARU.md`.
 */
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { serviceClient } from "./helpers/stack";

const PROG = 24;

test("cele dotykowe pol wyboru w formularzu szkolenia maja >= 24 px", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const svc = serviceClient();
  const { data: szkolenie } = await svc
    .from("trainings")
    .select("id")
    .eq("slug", "wprowadzenie-do-ai")
    .single();
  expect(szkolenie?.id, "szkolenie demo musi istniec").toBeTruthy();

  await page.setViewportSize({ width: 360, height: 900 });
  await loginAsAdmin(page);
  await page.goto(`/panel/szkolenia/${szkolenie!.id}`, {
    waitUntil: "networkidle",
  });

  const wyniki = await page.evaluate(() => {
    const out: Array<{
      id: string;
      input: { w: number; h: number };
      label: { w: number; h: number } | null;
      labelKlikalnyDlaInputa: boolean;
    }> = [];
    for (const input of Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )) {
      // Cel dotykowy to najblizszy `label` sterujacy tym `input`em.
      const label = input.closest("label");
      const ri = input.getBoundingClientRect();
      const rl = label?.getBoundingClientRect() ?? null;
      out.push({
        id: input.id,
        input: { w: Math.round(ri.width), h: Math.round(ri.height) },
        label: rl
          ? { w: Math.round(rl.width), h: Math.round(rl.height) }
          : null,
        labelKlikalnyDlaInputa:
          label != null &&
          (label.getAttribute("for") === input.id || label.contains(input)),
      });
    }
    return out;
  });

  expect(wyniki.length, "formularz musi miec pola wyboru").toBeGreaterThan(0);
  console.log("ISK-419 cele dotykowe:", JSON.stringify(wyniki, null, 2));

  for (const w of wyniki) {
    // Jesli to `label` jest celem, musi sam spelniac prog — inaczej 18x18
    // input byloby jedynym celem i mielibysmy prawdziwy defekt 2.5.8.
    expect(w.labelKlikalnyDlaInputa, `${w.id}: label steruje inputem`).toBe(
      true,
    );
    expect(w.label, `${w.id}: label ma geometrie`).not.toBeNull();
    expect(
      Math.min(w.label!.w, w.label!.h),
      `${w.id}: krotszy bok celu (label ${w.label!.w}x${w.label!.h})`,
    ).toBeGreaterThanOrEqual(PROG);
  }

  // Falsyfikacja: klikniecie w TEKST (poza kwadratem inputa) musi przestawic
  // stan. Bez tego powyzsze liczby moglyby opisywac prostokat, ktory nie jest
  // celem — a wtedy caly wniosek bylby bezwartosciowy.
  const pierwszy = page.locator(
    "label.ui-checkbox:has(input#training-featured)",
  );
  const input = page.locator("input#training-featured");
  const przed = await input.isChecked();
  await pierwszy.locator("span").click();
  await expect(input).toBeChecked({ checked: !przed });
});
