"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useForm,
  useWatch,
  type FieldError,
  type Resolver,
} from "react-hook-form";

import {
  Button,
  ButtonLink,
  Field,
  Icon,
  Notice,
  fieldDescribedBy,
} from "@/components/ui";
import { HONEYPOT_FIELD } from "@/lib/antispam/honeypot";
import { AUDIENCE_FORM_LABELS } from "@/lib/audience";
import {
  INQUIRY_KINDS,
  inquirySchema,
  type InquiryKind,
} from "@/lib/validation/inquiry";

type FormValues = {
  kind: InquiryKind;
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
  /**
   * Rodzaj zgloszenia wskazany Z ZEWNATRZ — strona glowna linkuje
   * `/kontakt?rodzaj=osoba|firma` (ISK-401 / M2).
   *
   * To TRACENIE, a nie kontrolka zarzadzana: zrodlem prawdy zostaje react-hook-form.
   * Prop idzie w `defaultValues` (czyli juz pierwsza odpowiedz serwera ma zaznaczona
   * wlasciwa pastylke — bez mrugniecia po hydratacji) i dodatkowo jest wsiewany
   * efektem, gdy zmieni sie po montowaniu. Wariantu `value`/`onChange` swiadomie tu
   * NIE ma: formularz polzarzadzany rozjezdzalby sie z `register("kind")`, ktorego
   * wartosc leci w ciele POST, i wybor osoby wypelniajacej moglby zostac nadpisany
   * przez render rodzica.
   */
  kind?: InquiryKind;
  /** Zmiana rodzaju przez osobe wypelniajaca — pozwala stronie opisac stan zgodnie z wyborem. */
  onKindChange?: (kind: InquiryKind) => void;
  // ISK-373 / P13: nagłówek i lead strony żyją w serwerowym `page.tsx`, więc same nie wiedzą,
  // że formularz został już wysłany. Ten sygnał pozwala cienkiej warstwie klienckiej
  // (`contact-section.tsx`) opisać stan PO wysłaniu, zamiast dalej zachęcać do wypełnienia.
  onSuccess?: () => void;
};

// "expired" to uczciwa reakcja na wygasly token (ISK-357 T4): formularz pozostaje wypelniony,
// token zostaje odswiezony w tle, a osoba moze wyslac ponownie — zamiast cichego sukcesu.
type SubmitState = "idle" | "submitting" | "success" | "error" | "expired";

/**
 * Oznaczenie bledu, ktorego `.ui-field-control` nie niesie samo.
 *
 * Regula fundamentu (`app/globals.css`) zmienia przy `aria-invalid="true"` SAM kolor
 * krawedzi. Bramka `ux-powazne.spec.ts` (P12) mierzy trzy rzeczy naraz: inny kolor,
 * WIEKSZA grubosc krawedzi i inne tlo — kolor nie moze byc jedynym nosnikiem
 * informacji (WCAG 1.4.1). Te dwie klasy dokladaja grubosc i tlo.
 *
 * Warianty `aria-[invalid=true]:` kompiluja sie do `.klasa[aria-invalid="true"]`, wiec
 * oznaczenie jest NIEZALEZNE od fokusu i wygrywa specyficznoscia, a nie kolejnoscia
 * w arkuszu (ISK-373 / P12).
 */
const INVALID_CARRIERS =
  "aria-[invalid=true]:border-2 aria-[invalid=true]:bg-error-50";

const CONTROL_CLASS = `ui-field-control ${INVALID_CARRIERS}`;

/**
 * Props wspolne kontrolki tekstowej: klasa fundamentu + pelne wiazanie ARIA.
 *
 * DLACZEGO WIDOK RENDERUJE KONTROLKE SAM, A NIE PRZEZ `Input`/`Textarea`
 * Komponenty fundamentu wyliczaja `aria-invalid` jako `error ? true : undefined`, wiec
 * pole POPRAWNE nie ma tego atrybutu w ogole. Semantycznie to to samo (`aria-invalid`
 * domyslnie jest `false`), ale bramka `ux-powazne.spec.ts` (P12) czyta
 * `getAttribute("aria-invalid")` i wymaga DOSLOWNEGO `"false"` na polu poprawnym —
 * to wlasnie ta asercja udowodnila, ze oznaczenie bledu nie bierze sie z fokusu.
 * Przekazac tego do `Input` nie da sie: wewnetrzny `controlProps` jest rozpakowywany
 * PO `...rest`, wiec wlasna wartosc zostaje nadpisana przez `undefined`.
 *
 * Z warstwy bierzemy wiec to, co jest jej kontraktem: klase `.ui-field-control`
 * i `fieldDescribedBy` (te same identyfikatory opisow, co liczy `Field`). Dzieki temu
 * nie ma tu drugiego systemu pol — jest jeden, ten z `@layer components`.
 */
function controlProps({
  id,
  error,
  required,
}: {
  id: string;
  error?: FieldError;
  required: boolean;
}) {
  return {
    id,
    className: CONTROL_CLASS,
    "aria-required": required,
    "aria-invalid": Boolean(error),
    "aria-describedby": fieldDescribedBy({ id, error: error?.message }),
  } as const;
}

export function InquiryForm({
  formToken,
  rodoClauseText,
  clauseApproved,
  training = null,
  kind: kindFromUrl,
  onKindChange,
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(inquirySchema) as unknown as Resolver<FormValues>,
    // Rodzaj z adresu wchodzi JUZ w wartosciach poczatkowych, nie dopiero efektem:
    // inaczej serwer renderowalby „Osoba indywidualna”, a hydratacja przestawialaby
    // pastylke na „Firma” na oczach osoby wchodzacej z `/kontakt?rodzaj=firma`.
    defaultValues: {
      ...inquiryFormDefaults(training),
      ...(kindFromUrl ? { kind: kindFromUrl } : {}),
    },
  });

  const kind = useWatch({ control, name: "kind" });

  // Prop jest tracenem z zewnatrz (patrz `Props.kind`), wiec zmiana adresu po
  // zamontowaniu formularza musi dotrzec do wartosci formularza. `shouldValidate:
  // false`, bo przelaczenie rodzaju nie jest bledem osoby wypelniajacej i nie ma
  // prawa zapalic komunikatow pod polami, ktorych jeszcze nie dotknela.
  useEffect(() => {
    if (kindFromUrl) setValue("kind", kindFromUrl, { shouldValidate: false });
  }, [kindFromUrl, setValue]);

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
          const refreshed = await fetch("/api/form-token", {
            cache: "no-store",
          });
          if (refreshed.ok) {
            const refreshedToken = (await refreshed.json()) as {
              formToken?: string;
            };
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
      // `role="status"` niesie tu caly panel, bo to ON jest celem fokusu — stad
      // zwykly `div` z klasami `.ui-notice`, a nie komponent `Notice`: `Notice`
      // nie przyjmuje ani `ref`, ani `tabIndex`. Tresc stoi w jednym dziecku,
      // bo `.ui-notice` jest kontenerem `flex` (ikona + tresc).
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="ui-notice ui-notice-success"
      >
        <Icon name="circle-check" size={18} />
        <div className="flex flex-col gap-4">
          <p>Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.</p>
          {/* ISK-373 / P13: ekran sukcesu byl zaulkiem — jedyne wyjscie prowadzilo
              przez globalna nawigacje. Tu stoi jawny dalszy krok. */}
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/szkolenia" size="sm" variant="primary">
              Wróć do katalogu szkoleń
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
            <ButtonLink href="/" size="sm" variant="neutral">
              Strona główna
            </ButtonLink>
          </div>
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
  const kindField = register("kind");

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid)}
      aria-busy={busy}
      className="flex flex-col gap-5"
    >
      {/* Komunikaty zbiorcze maja `role="alert"`, a nie `role="status"` z komponentu
          `Notice`: sa ODPOWIEDZIA na klikniecie „Wyślij”, wiec przerwanie biezacej
          wypowiedzi czytnika jest tu zachowaniem pozadanym (przy bledzie pola, w ktorym
          osoba wlasnie jest, byloby odwrotnie — stad decyzja `Notice` o `status`).
          Klasy wizualne sa te same, zeby nie powstal drugi styl komunikatu. */}
      {hasErrors ? (
        <div role="alert" className="ui-notice ui-notice-error">
          <span>Formularz zawiera błędy. Popraw zaznaczone pola.</span>
        </div>
      ) : null}
      {submitState === "error" ? (
        <div role="alert" className="ui-notice ui-notice-error">
          <span>
            Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na
            biuro@iskt.pl.
          </span>
        </div>
      ) : null}
      {submitState === "expired" ? (
        // Ton informacyjny, nie bledu: dane sa caly czas w formularzu, nic nie
        // zostalo utracone i jedyne, o co prosimy, to powtorzenie wysylki.
        <div role="alert" className="ui-notice ui-notice-info">
          <span>
            Formularz był otwarty zbyt długo i sesja wygasła. Twoje dane nie
            zostały jeszcze wysłane — odświeżyliśmy formularz, kliknij „Wyślij
            zgłoszenie” ponownie.
          </span>
        </div>
      ) : null}

      {training ? (
        <p
          data-testid="selected-training"
          data-training-id={training.id}
          className="ui-notice ui-notice-info"
        >
          {/* Jedno dziecko, bo `.ui-notice` jest `flex`: bez tego opakowania link
              „Wróć do opisu” stanalby obok zdania, a nie w jego biegu. */}
          <span>
            Zapytanie dotyczy szkolenia: <strong>{training.title}</strong>.{" "}
            <Link className="underline" href={`/szkolenia/${training.slug}`}>
              Wróć do opisu
            </Link>
          </span>
        </p>
      ) : null}

      {/* Objasnienie gwiazdki stoi PRZED polami, zeby bylo przeczytane zanim
          padnie pierwsze oznaczenie (ISK-373 / P12). `.ui-field-hint` to styl
          podpowiedzi z fundamentu — tekst jest wyciszony tokenem
          `--color-text-secondary` (~6,4:1). Do ISK-401 stala tu klasa
          `text-secondary`, ktora nie kompilowala sie do zadnej reguly (tokenu
          `--color-secondary` nie ma), wiec „wyciszony” tekst renderowal sie
          niemal czarnym ink-900. */}
      <p className="ui-field-hint">
        Pola oznaczone gwiazdką (<span aria-hidden="true">*</span>) są wymagane.
      </p>

      {/*
        PRZELACZNIK RODZAJU ZGLOSZENIA — PASTYLKA WZORCA, ALE ETYKIETA JEST `label`.
        Forma i klasy sa te same, co w `SegmentedControl` z fundamentu
        (`fieldset` + `legend` + `input[type=radio]`, `.ui-segmented-*`), wiec styl,
        stan `:checked`, obsluga strzalek i cel dotykowy 44 px pochodzą z jednego
        miejsca w arkuszu.
        ODSTEPSTWO: komponent owija pastylke `<span>`, a nie `<label>`. Zmierzone
        skutki takiego drzewa (chromium 1248 + axe-core, `setContent` z markupem
        komponentu): radio NIE MA nazwy dostepnej — `getByRole("radio", { name: "Firma" })`
        zwraca 0 trafien, a axe zglasza `label` z wagą *critical* („Form elements must
        have labels”). Nazwy opcji sa tu kontraktem trzech bramek
        (`formularz-zgloszenia.spec.ts` D5.3/D5.4, `ux-powazne.spec.ts` P5,
        `dostepnosc.spec.ts` axe), dlatego rzad jest `label`. Poprawka w komponencie to
        jedno slowo (`span` -> `label`) i dotyczy tez strony glownej — zgloszone w PR.
      */}
      <fieldset className="ui-segmented-group ui-segmented-full">
        <legend className="ui-segmented-legend">Rodzaj zgłoszenia</legend>
        <div className="ui-segmented ui-segmented-white ui-segmented-full">
          {INQUIRY_KINDS.map((value) => (
            <label className="ui-segmented-option" key={value}>
              <input
                type="radio"
                value={value}
                // `defaultChecked` zamiast `checked`: kontrolka zostaje
                // niezarzadzana (wartosc prowadzi `register`), ale pierwsza
                // odpowiedz serwera ma juz zaznaczona wlasciwa pastylke.
                defaultChecked={value === (kindFromUrl ?? "osoba")}
                {...kindField}
                onChange={(event) => {
                  void kindField.onChange(event);
                  onKindChange?.(value);
                }}
              />
              <span>{AUDIENCE_FORM_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        error={errors.fullName?.message}
        id="fullName"
        label="Imię i nazwisko"
        required
      >
        <input
          type="text"
          autoComplete="name"
          {...controlProps({
            id: "fullName",
            error: errors.fullName,
            required: true,
          })}
          {...register("fullName")}
        />
      </Field>

      {kind === "firma" ? (
        <Field
          error={errors.companyName?.message}
          id="companyName"
          label="Nazwa firmy"
          required
        >
          <input
            type="text"
            autoComplete="organization"
            // Wymagane wylacznie dla zgloszenia firmowego — a to pole istnieje
            // w drzewie tylko wtedy, wiec oznaczenie jest zawsze prawdziwe.
            {...controlProps({
              id: "companyName",
              error: errors.companyName,
              required: true,
            })}
            {...register("companyName")}
          />
        </Field>
      ) : null}

      <Field
        error={errors.email?.message}
        id="email"
        label="Adres e-mail"
        required
      >
        <input
          type="email"
          autoComplete="email"
          {...controlProps({
            id: "email",
            error: errors.email,
            required: true,
          })}
          {...register("email")}
        />
      </Field>

      <Field error={errors.phone?.message} id="phone" label="Telefon" required>
        <input
          type="tel"
          autoComplete="tel"
          {...controlProps({
            id: "phone",
            error: errors.phone,
            required: true,
          })}
          {...register("phone")}
        />
      </Field>

      <Field
        error={errors.interestArea?.message}
        id="interestArea"
        label="Interesujące szkolenie lub obszar"
        required={interestAreaRequired}
      >
        <input
          type="text"
          {...controlProps({
            id: "interestArea",
            error: errors.interestArea,
            required: interestAreaRequired,
          })}
          {...register("interestArea")}
        />
      </Field>

      <Field
        error={errors.message?.message}
        id="message"
        label="Wiadomość"
        required
      >
        <textarea
          rows={5}
          {...controlProps({
            id: "message",
            error: errors.message,
            required: true,
          })}
          className={`${CONTROL_CLASS} ui-textarea`}
          {...register("message")}
        />
      </Field>

      {/*
        ZGODA RODO.
        Rzad i komunikat uzywaja klas `.ui-checkbox` / `.ui-field-error` z fundamentu
        (klikalny caly rzad, 44 px wysokosci trafienia, kwadrat 18 px).
        ODSTEPSTWO wobec komponentu `Checkbox`: on wylicza `aria-describedby` jako
        `error ? "<id>-error" : undefined`, czyli przy poprawnie zaznaczonej zgodzie
        kontrolka nie wskazuje NICZEGO. Tutaj musi wskazywac tresc klauzuli
        informacyjnej RODO — to ona jest realizacja obowiazku informacyjnego w miejscu
        wyrazania zgody — a gdy pojawi sie blad, dokladnie `#rodoAck-error`
        (asercja `formularz-zgloszenia.spec.ts` D5.5). `Checkbox` nie pozwala tego
        nadpisac: ustawia `aria-describedby` PO `...rest`.
      */}
      <div className="ui-field">
        <label className="ui-checkbox" htmlFor="rodoAck">
          <input
            type="checkbox"
            id="rodoAck"
            aria-required="true"
            aria-invalid={Boolean(errors.rodoAck)}
            aria-describedby={
              errors.rodoAck ? "rodoAck-error" : "rodoAck-clause"
            }
            {...register("rodoAck")}
          />
          <span>
            Potwierdzam zapoznanie się z informacją RODO.
            {/* Ta sama gwiazdka, co w `Field`: ornament, `aria-hidden`, bo wymog
                niesie `aria-required` na kontrolce. */}
            <span className="ui-field-required" aria-hidden="true">
              *
            </span>
          </span>
        </label>
        <p className="ui-field-hint" id="rodoAck-clause">
          {rodoClauseText}
        </p>
        <p className="text-sm">
          <Link className="underline" href="/polityka-prywatnosci">
            Pełna informacja o przetwarzaniu danych (polityka prywatności)
          </Link>
        </p>
        {/* Region bledu jest w DOM ZAWSZE — pusty, dopoki bledu nie ma. `aria-live`
            oglasza tylko zmiany w regionie, ktory istnial wczesniej; wstawiony razem
            z tekstem czesto nie zostaje ogloszony (ta sama zasada co w `Field`). */}
        <p className="ui-field-error" id="rodoAck-error" aria-live="polite">
          {errors.rodoAck?.message}
        </p>
      </div>

      {/* Honeypot: ukryte pole-pulapka. Nie type=hidden — ukrywamy stylem i odbieramy dostepnosci. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
      >
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
          niejednoznaczne (ISK-373 / P13). `Notice` niesie `role="status"`
          i `aria-live="polite"` z komponentu, wiec tutaj nie ma ich w widoku. */}
      {busy ? <Notice tone="info">Wysyłanie zgłoszenia…</Notice> : null}

      <Button
        block
        // Techniczna bramka RODO (ISK-357 P1): bez zatwierdzonej klauzuli przycisk jest nieaktywny,
        // wiec klikniecie nie wyzwala submitu i nie powstaje zadne POST /api/inquiries.
        disabled={!clauseApproved}
        // ISK-373 / P13: w trakcie wysylki jedynym sygnalem bylo `opacity: 0.6` —
        // ani tekst, ani `aria-busy`, ani wskaznik. `pending` z fundamentu ustawia
        // `disabled` i `aria-busy` razem, wiec formularza nie da sie wyslac dwa razy.
        pending={busy}
        size="lg"
        type="submit"
        variant="primary"
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
      </Button>
    </form>
  );
}
