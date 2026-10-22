import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(2, "Podaj slug.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Użyj małych liter, cyfr i myślników.");

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);
const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || z.url().safeParse(value).success, {
    message: "Podaj poprawny adres URL.",
  })
  .transform((value) => value || null);
const integer = z.coerce.number().int().min(0);

/**
 * Pola SEO mają limit długości wymuszony w bazie (`check` w 20261009120300) —
 * walidujemy go tutaj, żeby administrator zobaczył komunikat formularza, a nie
 * surowy błąd Postgresa.
 */
const optionalTextMax = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

/**
 * Lista wpisywana w `textarea` — jedna pozycja w wierszu. `learning_outcomes` to
 * kolumna `text[] not null default '{}'`, więc puste pole daje pustą tablicę, nie NULL.
 */
const linesToArray = z.string().transform((value) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
);

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Podaj nazwę."),
  slug,
  description: optionalText,
  sort_order: integer.default(100),
});

export const trainerSchema = z.object({
  full_name: z.string().trim().min(2, "Podaj imię i nazwisko."),
  slug,
  headline: optionalText,
  bio: optionalText,
  competences: z.string().transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
  photo_url: optionalUrl,
  sort_order: integer.default(100),
});

/**
 * ISK-374 BL-C: formularz obejmował podzbiór kolumn `trainings`, a brakujące pola są
 * czytane przez publiczny frontend — `is_featured` decyduje o sekcji „Najczęściej
 * wybierane” na stronie głównej, `seo_*` o tytule i opisie w wynikach wyszukiwania,
 * `learning_outcomes` i `target_audience` o treści strony szczegółu. Bez nich szkolenie
 * utworzone w panelu nie mogło trafić na stronę główną ani mieć własnych metadanych.
 *
 * Świadomie poza zakresem: `program` (`jsonb` [{title, items[]}]). Struktura zagnieżdżona
 * wymaga edytora sekcji z powtarzalnymi listami, a nie pojedynczego pola — to dług opisany
 * w ISK-374. Dopóki go nie ma, publiczna strona szczegółu nie pokazuje nagłówka „Program
 * szkolenia”, gdy program jest pusty (stan pusty dodany w tym samym commicie), więc
 * szkolenie z panelu nie wygląda na niedokończone.
 */
export const trainingSchema = z.object({
  title: z.string().trim().min(2, "Podaj tytuł."),
  slug,
  summary: z.string().trim().min(10, "Podaj krótkie podsumowanie."),
  description: optionalText.default(""),
  category_id: z.uuid("Wybierz kategorię."),
  level: z.enum(["podstawowy", "sredniozaawansowany", "zaawansowany"]),
  duration_hours: z.coerce.number().positive(),
  price_net_pln: z.coerce.number().min(0),
  funding_available: z.coerce.boolean().default(false),
  // Uwaga na kolejnosc w zod 4: `.default(x)` podstawia WYNIK, pomijajac transformacje,
  // wiec dla pol nullable domyslna wartoscia jest `null` (a nie ""), zeby brak pola w
  // formularzu zapisywal sie tak samo jak pole wyczyszczone.
  funding_note: optionalText.default(null),
  learning_outcomes: linesToArray.default([]),
  target_audience: optionalText.default(null),
  terms_note: optionalText.default(""),
  is_featured: z.coerce.boolean().default(false),
  seo_title: optionalTextMax(
    70,
    "Tytuł SEO może mieć najwyżej 70 znaków.",
  ).default(null),
  seo_description: optionalTextMax(
    160,
    "Opis SEO może mieć najwyżej 160 znaków.",
  ).default(null),
  trainer_ids: z.array(z.uuid()).default([]),
  sort_order: integer.default(100),
});

export const idSchema = z.uuid();

/**
 * Notatka wewnetrzna zgloszenia (ISK-402).
 *
 * Limit 2000 znakow jest LUSTREM ograniczenia z bazy
 * (`check (char_length(admin_note) <= 2000)`, migracja `20261009120500`) —
 * walidujemy go tutaj, zeby administrator zobaczyl komunikat formularza,
 * a nie surowy `check_violation` z Postgresa. Tak samo jak pola SEO wyzej.
 *
 * Puste pole zapisuje `null`, nie `""`: kolumna jest `nullable`, a kolejnosc
 * `.max()` → `.transform()` ma znaczenie, bo w zod 4 `.default()` podstawia
 * WYNIK transformacji (patrz nota przy `trainingSchema`).
 */
export const inquiryNoteSchema = z
  .string()
  .trim()
  .max(2000, "Notatka może mieć najwyżej 2000 znaków.")
  .transform((value) => value || null);
