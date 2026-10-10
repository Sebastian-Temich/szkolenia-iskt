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
  terms_note: optionalText.default(""),
  trainer_ids: z.array(z.uuid()).default([]),
  sort_order: integer.default(100),
});

export const idSchema = z.uuid();
