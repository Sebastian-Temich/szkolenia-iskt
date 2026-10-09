export default function Home() {
  return (
    <main className="max-w-container px-gutter py-section mx-auto flex min-h-screen items-center">
      <section aria-labelledby="page-title" className="max-w-3xl">
        <p className="tracking-caps text-brand mb-4 text-sm font-semibold uppercase">
          ISKT Greenovation
        </p>
        <h1
          id="page-title"
          className="text-primary text-4xl font-bold tracking-tight sm:text-5xl"
        >
          Szkolenia, które przekładają wiedzę na działanie.
        </h1>
        <p className="text-secondary mt-6 text-lg leading-relaxed">
          Fundament aplikacji jest gotowy do rozwoju katalogu, formularzy i
          panelu administracyjnego w kolejnych etapach MVP.
        </p>
      </section>
    </main>
  );
}
