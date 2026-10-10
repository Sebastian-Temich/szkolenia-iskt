import { describe, expect, it } from "vitest";

import {
  CONFIRM_DELETE_FIELD,
  isDeleteConfirmed,
} from "@/lib/panel/confirm-delete";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function formWith(value: string): FormData {
  const form = new FormData();
  form.set(CONFIRM_DELETE_FIELD, value);
  return form;
}

describe("isDeleteConfirmed (ISK-364 / B6)", () => {
  it("przyjmuje potwierdzenie z identyfikatorem tej samej pozycji", () => {
    expect(isDeleteConfirmed(formWith(ID), ID)).toBe(true);
  });

  it("odrzuca brak formularza — zadanie bez FormData nie jest potwierdzone", () => {
    expect(isDeleteConfirmed(undefined, ID)).toBe(false);
    expect(isDeleteConfirmed(null, ID)).toBe(false);
  });

  it("odrzuca formularz bez pola potwierdzenia", () => {
    expect(isDeleteConfirmed(new FormData(), ID)).toBe(false);
  });

  it("odrzuca puste potwierdzenie", () => {
    expect(isDeleteConfirmed(formWith(""), ID)).toBe(false);
  });

  it("odrzuca „true” — potwierdzenie musi nosic identyfikator, nie flage", () => {
    expect(isDeleteConfirmed(formWith("true"), ID)).toBe(false);
  });

  it("odrzuca potwierdzenie z innego wiersza — to chroni przed usunieciem nie tej pozycji", () => {
    expect(isDeleteConfirmed(formWith(OTHER_ID), ID)).toBe(false);
  });

  it("odrzuca wartosc nietekstowa (plik podstawiony pod pole potwierdzenia)", () => {
    const form = new FormData();
    form.set(CONFIRM_DELETE_FIELD, new Blob(["x"]), "x.txt");
    expect(isDeleteConfirmed(form, ID)).toBe(false);
  });
});
