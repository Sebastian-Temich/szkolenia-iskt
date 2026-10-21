"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";

import { HONEYPOT_FIELD } from "@/lib/antispam/honeypot";
import { INQUIRY_KINDS, inquirySchema } from "@/lib/validation/inquiry";

type FormValues = {
  kind: (typeof INQUIRY_KINDS)[number];
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  // ISK-383: `trainingId` jest wartoscia formularza, choc nie ma wlasnej kontrolki.
  // Bez tego klucza resolver widzial zawsze `!trainingId` i wymagal `interestArea`
  // takze na /kontakt?szkolenie=<slug> — wbrew etykiecie bez gwiazdki.
  trainingId?: string;
  interestArea: string;
  message: string;
  rodoAck: boolean;
  company_website: string;
};

/** Szkolenie wskazane przez `?szkolenie=<slug>`, rozwiazane na serwerze. */
export type SelectedTraining = {
  id: string;
  title: string;
  slug: string;
};

/**
 * Wartosci poczatkowe formularza — wydzielone z komponentu, zeby test mogl zmierzyc
 * DOKLADNIE ten obiekt, ktory trafia do `zodResolver` (ISK-383).
 *
 * `trainingId` jest tu polem formularza, mimo ze nie ma kontrolki w drzewie: wartosc
 * pochodzi z adresu (`?szkolenie=<slug>`), nie od osoby wypelniajacej. React Hook Form
 * trzyma takie klucze w wartosciach formularza (`shouldUnregister` jest domyslnie
 * `false`), wiec id leci do resolvera i do `onValid` razem z resztą. Dzieki temu klient
 * i serwer walidują identyczny obiekt — zasada z naglowka `lib/validation/inquiry.ts` —
 * i nie ma drugiego zrodla prawdy w postaci recznego doklejania id przy budowie POST.
 * Id NIE jest renderowane jako `<input type="hidden">`: nic w UI go nie potrzebuje,
 * a `inquirySchema` i tak sprawdza je przez `z.uuid()` po obu stronach.
 */
export function inquiryFormDefaults(
  training: SelectedTraining | null,
): FormValues {
  return {
    kind: "osoba",
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
    trainingId: training?.id,
    // Nazwa szkolenia trafia tez do pola tekstowego: `training_id` jest
    // powiazaniem w bazie, a `interest_area` zostaje czytelnym tematem w
    // liscie zgloszen i w powiadomieniu e-mail.
    interestArea: training?.title ?? "",
    message: "",
    rodoAck: false,
    company_website: "",
  };
}

type Props = {
  formToken: string;
  rodoClauseText: string;
  // Techniczna bramka RODO (ISK-357 P1): gdy false, wysłanie jest zablokowane w UI (przycisk
  // nieaktywny, submit nie wywołuje żądania). Serwer i tak odrzuca zapis — to druga warstwa.
  clauseApproved: boolean;
  training?: SelectedTraining | null;
  // ISK-373 / P13: nagłówek i lead strony żyją w serwerowym `page.tsx`, więc same nie wiedzą,
  // że formularz został już wysłany. Ten sygnał pozwala cienkiej warstwie klienckiej
  // (`contact-section.tsx`) opisać stan PO wysłaniu, zamiast dalej zachęcać do wypełnienia.
  onSuccess?: () => void;
};

// "expired" to uczciwa reakcja na wygasly token (ISK-357 T4): formularz pozostaje wypelniony,
// token zostaje odswiezony w tle, a osoba moze wyslac ponownie — zamiast cichego sukcesu.
type SubmitState = "idle" | "submitting" | "success" | "error" | "expired";

/**
 * ISK-373 / P2: samo `border` w Tailwind v4 NIE ustawia koloru krawedzi. Preflight
 * resetuje `*, ::before, ::after { border: 0 solid }`, wiec kolor wraca do wartosci
 * poczatkowej `currentColor` — czyli `--color-text-primary` (#0e1511). Pola wygladaly
 * na obramowane niemal czarna linia, a token `--color-border-default` (#d4d9cd) nie byl
 * uzyty nigdzie w formularzu. Dlatego kolor krawedzi jest tu JAWNY.
 *
 * ISK-373 / P12: komunikat zbiorczy prosil "popraw zaznaczone pola", ale pole z bledem
 * bylo piksel w piksel identyczne z poprawnym. Wariant `aria-[invalid=true]` daje
 * oznaczenie NIEZALEZNE od fokusu, bo kompiluje sie do
 * `.klasa[aria-invalid="true"]` — wygrywa z `.border-border-default` specyficznoscia
 * (0,2,0) vs (0,1,0), a nie kolejnoscia w arkuszu. Kolor nie jest jedynym nosnikiem
 * (WCAG 1.4.1): rosnie tez grubosc krawedzi i zmienia sie tlo, a komunikat tekstowy
 * pod polem byl i zostaje.
 */
const FIELD_CLASS =
  "border-border-default aria-[invalid=true]:border-error-500 aria-[invalid=true]:bg-error-50 rounded border p-2 aria-[invalid=true]:border-2";

/**
 * Wizualne oznaczenie wymagalnosci w etykiecie (ISK-373 / P12 — zadna z 9 etykiet
 * nie mowila, ze pole jest wymagane). Gwiazdka jest `aria-hidden`, bo te sama
 * informacje czytnik ekranu bierze z `aria-required` na kontrolce — inaczej
 * oglosilby ja dwa razy.
 */
function Required() {
  return (
    <>
      {" "}
      <span aria-hidden="true" className="text-error-500">
        *
      </span>
    </>
  );
}

export function InquiryForm({
  formToken,
  rodoClauseText,
  clauseApproved,
  training = null,
  onSuccess,
}: Props) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [token, setToken] = useState(formToken);
  const successRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(inquirySchema) as unknown as Resolver<FormValues>,
    defaultValues: inquiryFormDefaults(training),
  });

  const kind = useWatch({ control, name: "kind" });

  // ISK-373 / P13: po udanej wysylce `document.activeElement` bylo `BODY` — osoba
  // korzystajaca z klawiatury zostawala bez kontekstu, a nastepny Tab wracal na
  // poczatek dokumentu. Fokus idzie na komunikat (`tabIndex={-1}`), wiec czytnik
  // ekranu oglasza tresc, a dalszy krok jest pierwszym elementem w kolejnosci Tab.
  useEffect(() => {
    if (submitState === "success") successRef.current?.focus();
  }, [submitState]);

  async function onValid(data: FormValues) {
    // Bramka RODO (ISK-357 P1): bez zatwierdzonej klauzuli nie wysyłamy nic — serwer i tak odrzuci.
    if (!clauseApproved) return;
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
          // ISK-364 / P4: bez tego pola `inquiries.training_id` bylo zawsze NULL.
          // ISK-383: czytamy je ze ZWALIDOWANYCH danych, nie z domkniecia `training` —
          // inaczej klient sprawdzalby regule na innym obiekcie, niz wysyla.
          trainingId: data.trainingId,
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
        onSuccess?.();
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
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="bg-success-50 mt-8 rounded p-4 text-base"
      >
        <p className="font-semibold">
          Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.
        </p>
        {/* ISK-373 / P13: ekran sukcesu byl zaulkiem — jedyne wyjscie prowadzilo
            przez globalna nawigacje. Tu stoi jawny dalszy krok. */}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="button button-small" href="/szkolenia">
            Wróć do katalogu szkoleń
          </Link>
          <Link className="button button-ghost button-small" href="/">
            Strona główna
          </Link>
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;
  // Stan wysylki (ISK-373 / P13). `isSubmitting` z react-hook-form pokrywa czas
  // walidacji, `submitState` — czas zapytania; afordancja musi obejmowac oba.
  const busy = isSubmitting || submitState === "submitting";
  // `interestArea` jest wymagane TYLKO wtedy, gdy zgloszenie nie wskazuje szkolenia
  // (`inquirySchema.superRefine`) — oznaczenie w etykiecie musi isc za ta regula,
  // inaczej gwiazdka klamie w jednym z dwoch wejsc na formularz.
  // ISK-383: od momentu, gdy `trainingId` jest wartoscia formularza, ten warunek i
  // warunek w resolverze patrza na to samo — wczesniej etykieta mowila prawde, a
  // walidacja blokowala wysylke po wyczyszczeniu pola.
  const interestAreaRequired = !training;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid)}
      aria-busy={busy}
      className="mt-8 flex flex-col gap-5"
    >
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

      {training ? (
        <p
          data-testid="selected-training"
          data-training-id={training.id}
          className="bg-success-50 rounded p-3 text-sm"
        >
          Zapytanie dotyczy szkolenia: <strong>{training.title}</strong>.{" "}
          <a className="underline" href={`/szkolenia/${training.slug}`}>
            Wróć do opisu
          </a>
        </p>
      ) : null}

      {/* Objasnienie gwiazdki stoi PRZED polami, zeby bylo przeczytane zanim
          padnie pierwsze oznaczenie (ISK-373 / P12). */}
      <p className="text-secondary text-sm">
        Pola oznaczone gwiazdką (<span aria-hidden="true">*</span>) są wymagane.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-primary font-semibold">Rodzaj zgłoszenia</legend>
        {INQUIRY_KINDS.map((value) => (
          // ISK-373 / P5: kontrolka miala 13x13 px, a klikalny wiersz etykiety 24 px.
          // Etykieta jest celem dotykowym (klikniecie jej przelacza kontrolke), wiec
          // to ona dostaje 44 px wysokosci; sama kontrolka rosnie do 1.25rem.
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input type="radio" className="size-5" value={value} {...register("kind")} />
            <span>{value === "osoba" ? "Osoba indywidualna" : "Firma"}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="font-medium">
          Imię i nazwisko
          <Required />
        </label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          aria-required="true"
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          className={FIELD_CLASS}
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
            <Required />
          </label>
          <input
            id="companyName"
            type="text"
            autoComplete="organization"
            // Wymagane wylacznie dla zgloszenia firmowego — a to pole istnieje
            // w drzewie tylko wtedy, wiec oznaczenie jest zawsze prawdziwe.
            aria-required="true"
            aria-invalid={Boolean(errors.companyName)}
            aria-describedby={errors.companyName ? "companyName-error" : undefined}
            className={FIELD_CLASS}
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
          <Required />
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-required="true"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={FIELD_CLASS}
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
          <Required />
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          aria-required="true"
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "phone-error" : undefined}
          className={FIELD_CLASS}
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
          {interestAreaRequired ? <Required /> : null}
        </label>
        <input
          id="interestArea"
          type="text"
          aria-required={interestAreaRequired}
          aria-invalid={Boolean(errors.interestArea)}
          aria-describedby={errors.interestArea ? "interestArea-error" : undefined}
          className={FIELD_CLASS}
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
          <Required />
        </label>
        <textarea
          id="message"
          rows={5}
          aria-required="true"
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "message-error" : undefined}
          className={FIELD_CLASS}
          {...register("message")}
        />
        {errors.message ? (
          <p id="message-error" role="alert" className="text-error-500 text-sm">
            {errors.message.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5 shrink-0"
            aria-required="true"
            aria-invalid={Boolean(errors.rodoAck)}
            aria-describedby={errors.rodoAck ? "rodoAck-error" : "rodoAck-clause"}
            {...register("rodoAck")}
          />
          <span>
            Potwierdzam zapoznanie się z informacją RODO.
            <Required />
          </span>
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

      {/* Zmiana nazwy przycisku nie jest ogłaszana przez wszystkie czytniki ekranu,
          a bramka UX zanotowala brak jakiegokolwiek `[aria-live]` w trakcie wysylki.
          Region istnieje tylko w czasie wysylki — dzieki temu na ekranie sukcesu
          jest dokladnie jeden `role="status"` i selektory testow nie robia sie
          niejednoznaczne (ISK-373 / P13). */}
      {busy ? (
        <p role="status" className="text-secondary text-sm">
          Wysyłanie zgłoszenia…
        </p>
      ) : null}

      <button
        type="submit"
        // Techniczna bramka RODO (ISK-357 P1): bez zatwierdzonej klauzuli przycisk jest nieaktywny,
        // wiec klikniecie nie wyzwala submitu i nie powstaje zadne POST /api/inquiries.
        disabled={!clauseApproved || busy}
        // ISK-373 / P13: w trakcie wysylki jedynym sygnalem bylo `opacity: 0.6` —
        // ani tekst, ani `aria-busy`, ani wskaznik. Teraz sa wszystkie trzy.
        aria-busy={busy}
        // ISK-373 / P5: `py-2` dawalo 40 px wysokosci, czyli ponizej przyjetego
        // w bramce minimum 44x44. `min-h-11` to dokladnie 2.75rem = 44 px.
        className="bg-primary hover:bg-primary-hover inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded px-5 font-semibold text-white disabled:opacity-60"
      >
        {busy ? (
          <>
            <span
              aria-hidden="true"
              // `motion-reduce`: osoba z `prefers-reduced-motion` dostaje statyczny
              // krazek, a nie wirujacy — sama zmiana tekstu i tak niesie informacje.
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
            />
            Wysyłanie…
          </>
        ) : (
          "Wyślij zgłoszenie"
        )}
      </button>
    </form>
  );
}
