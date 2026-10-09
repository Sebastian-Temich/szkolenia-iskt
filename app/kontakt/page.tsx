import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Kontakt",
  description: "Skontaktuj się z zespołem szkoleń ISKT.",
  path: "/kontakt",
});

export default function ContactPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="page-shell">
          <p className="eyebrow">Kontakt</p>
          <h1>Porozmawiajmy o rozwoju Twojego zespołu</h1>
          <p className="lead">
            [DEMO] Opisz potrzeby, a wspólnie dobierzemy kierunek szkolenia.
          </p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="contact-grid page-shell">
          <article>
            <h2>Dane kontaktowe</h2>
            <p>
              To środowisko demonstracyjne. Finalne dane kontaktowe wymagają
              decyzji ISKT.
            </p>
            <dl>
              <div>
                <dt>E-mail</dt>
                <dd>kontakt@example.invalid</dd>
              </div>
              <div>
                <dt>Dostępność</dt>
                <dd>Poniedziałek–piątek, [DEMO]</dd>
              </div>
            </dl>
          </article>
          <section
            id="contact-form-mount"
            data-form-slot="inquiry-v1"
            className="form-mount"
            aria-labelledby="form-title"
          >
            <p className="eyebrow">Formularz kontaktowy</p>
            <h2 id="form-title">Miejsce integracji E4</h2>
            <p>
              Stabilny punkt montażu:{" "}
              <code>
                #contact-form-mount[data-form-slot=&quot;inquiry-v1&quot;]
              </code>
              .
            </p>
            <noscript>
              Do wysłania formularza potrzebna będzie obsługa JavaScript.
            </noscript>
          </section>
        </div>
      </section>
    </main>
  );
}
