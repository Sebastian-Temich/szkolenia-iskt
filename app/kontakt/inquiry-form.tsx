"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";

import { HONEYPOT_FIELD } from "@/lib/antispam/honeypot";
import { INQUIRY_KINDS, inquirySchema } from "@/lib/validation/inquiry";

type FormValues = {
  kind: (typeof INQUIRY_KINDS)[number];
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  interestArea: string;
  message: string;
  rodoAck: boolean;
  company_website: string;
};

type Props = {
  formToken: string;
  rodoClauseText: string;
};

// "expired" to uczciwa reakcja na wygasly token (ISK-357 T4): formularz pozostaje wypelniony,
// token zostaje odswiezony w tle, a osoba moze wyslac ponownie — zamiast cichego sukcesu.
type SubmitState = "idle" | "submitting" | "success" | "error" | "expired";

export function InquiryForm({ formToken, rodoClauseText }: Props) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [token, setToken] = useState(formToken);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(inquirySchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      kind: "osoba",
      fullName: "",
      email: "",
      phone: "",
      companyName: "",
      interestArea: "",
      message: "",
      rodoAck: false,
      company_website: "",
    },
  });

  const kind = useWatch({ control, name: "kind" });

  async function onValid(data: FormValues) {
    setSubmitState("submitting");
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: data.kind,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          companyName: data.kind === "firma" ? data.companyName : undefined,
          interestArea: data.interestArea,
          message: data.message,
          rodoAck: data.rodoAck,
          formToken: token,
          [HONEYPOT_FIELD]: getValues("company_website"),
        }),
      });
      if (response.ok) {
        setSubmitState("success");
        reset();
        return;
      }
      // Wygasly token: pobierz swiezy, zachowaj wpisane dane i popros o ponowne wyslanie.
      const payload: unknown = await response.json().catch(() => null);
      const errorCode =
        payload && typeof payload === "object" && "error" in payload
          ? (payload as { error?: unknown }).error
          : undefined;
      if (response.status === 422 && errorCode === "form_expired") {
        try {
          const refreshed = await fetch("/api/form-token", { cache: "no-store" });
          if (refreshed.ok) {
            const refreshedToken = (await refreshed.json()) as { formToken?: string };
            if (refreshedToken.formToken) setToken(refreshedToken.formToken);
          }
        } catch {
          // Brak odswiezenia nie jest krytyczny — komunikat i tak prosi o ponowne wyslanie.
        }
        setSubmitState("expired");
        return;
      }
      setSubmitState("error");
    } catch {
      setSubmitState("error");
    }
  }

  if (submitState === "success") {
    return (
      <p role="status" className="bg-success-50 mt-8 rounded p-4 text-base">
        Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.
      </p>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form noValidate onSubmit={handleSubmit(onValid)} className="mt-8 flex flex-col gap-5">
      {hasErrors ? (
        <div role="alert" className="bg-error-50 rounded p-3 text-sm">
          Formularz zawiera błędy. Popraw zaznaczone pola.
        </div>
      ) : null}
      {submitState === "error" ? (
        <div role="alert" className="bg-error-50 rounded p-3 text-sm">
          Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na biuro@iskt.pl.
        </div>
      ) : null}
      {submitState === "expired" ? (
        <div role="alert" className="border-warning-500 bg-warning-50 rounded border-l-4 p-3 text-sm">
          Formularz był otwarty zbyt długo i sesja wygasła. Twoje dane nie zostały jeszcze wysłane —
          odświeżyliśmy formularz, kliknij „Wyślij zgłoszenie” ponownie.
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-primary font-semibold">Rodzaj zgłoszenia</legend>
        {INQUIRY_KINDS.map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" value={value} {...register("kind")} />
            <span>{value === "osoba" ? "Osoba indywidualna" : "Firma"}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="font-medium">
          Imię i nazwisko
        </label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          className="rounded border p-2"
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p id="fullName-error" role="alert" className="text-error-500 text-sm">
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      {kind === "firma" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="companyName" className="font-medium">
            Nazwa firmy
          </label>
          <input
            id="companyName"
            type="text"
            autoComplete="organization"
            aria-invalid={Boolean(errors.companyName)}
            aria-describedby={errors.companyName ? "companyName-error" : undefined}
            className="rounded border p-2"
            {...register("companyName")}
          />
          {errors.companyName ? (
            <p id="companyName-error" role="alert" className="text-error-500 text-sm">
              {errors.companyName.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="font-medium">
          Adres e-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="rounded border p-2"
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" role="alert" className="text-error-500 text-sm">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="phone" className="font-medium">
          Telefon
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "phone-error" : undefined}
          className="rounded border p-2"
          {...register("phone")}
        />
        {errors.phone ? (
          <p id="phone-error" role="alert" className="text-error-500 text-sm">
            {errors.phone.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="interestArea" className="font-medium">
          Interesujące szkolenie lub obszar
        </label>
        <input
          id="interestArea"
          type="text"
          aria-invalid={Boolean(errors.interestArea)}
          aria-describedby={errors.interestArea ? "interestArea-error" : undefined}
          className="rounded border p-2"
          {...register("interestArea")}
        />
        {errors.interestArea ? (
          <p id="interestArea-error" role="alert" className="text-error-500 text-sm">
            {errors.interestArea.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="message" className="font-medium">
          Wiadomość
        </label>
        <textarea
          id="message"
          rows={5}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "message-error" : undefined}
          className="rounded border p-2"
          {...register("message")}
        />
        {errors.message ? (
          <p id="message-error" role="alert" className="text-error-500 text-sm">
            {errors.message.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            aria-invalid={Boolean(errors.rodoAck)}
            aria-describedby={errors.rodoAck ? "rodoAck-error" : "rodoAck-clause"}
            {...register("rodoAck")}
          />
          <span>Potwierdzam zapoznanie się z informacją RODO.</span>
        </label>
        <p id="rodoAck-clause" className="text-secondary text-sm">
          {rodoClauseText}
        </p>
        <p className="text-sm">
          <Link href="/polityka-prywatnosci" className="text-primary hover:underline">
            Pełna informacja o przetwarzaniu danych (polityka prywatności)
          </Link>
        </p>
        {errors.rodoAck ? (
          <p id="rodoAck-error" role="alert" className="text-error-500 text-sm">
            {errors.rodoAck.message}
          </p>
        ) : null}
      </div>

      {/* Honeypot: ukryte pole-pulapka. Nie type=hidden — ukrywamy stylem i odbieramy dostepnosci. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company_website">Nie wypełniaj tego pola</label>
        <input
          id="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("company_website")}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || submitState === "submitting"}
        className="bg-primary hover:bg-primary-hover w-fit rounded px-5 py-2 font-semibold text-white disabled:opacity-60"
      >
        Wyślij zgłoszenie
      </button>
    </form>
  );
}
