export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-4xl items-center justify-center">
        <section
          aria-labelledby="foundation-title"
          className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12"
        >
          <header className="space-y-4 text-center sm:text-left">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              Foundation Setup
            </span>
            <div className="space-y-3">
              <h1
                id="foundation-title"
                className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl"
              >
                Ranjirams Hotel Management System
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Production project foundation is ready.
              </p>
            </div>
          </header>

          <section aria-labelledby="system-details" className="mt-10">
            <h2 id="system-details" className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              System details
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <dt className="text-sm font-medium text-slate-500">Frontend</dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">Next.js</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <dt className="text-sm font-medium text-slate-500">Local Port</dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">3020</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <dt className="text-sm font-medium text-slate-500">Status</dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">Foundation Setup</dd>
              </div>
            </dl>
          </section>

          <p className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            Backend and business modules will be implemented incrementally after the foundation is approved.
          </p>

          <section aria-labelledby="planned-modules" className="mt-10">
            <h2 id="planned-modules" className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Planned Core Modules
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3" aria-label="Planned core modules">
              <li className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Employee Management
              </li>
              <li className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Shift Management
              </li>
              <li className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Attendance Management
              </li>
              <li className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Salary Calculation
              </li>
              <li className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Advance Payments
              </li>
            </ul>
          </section>
        </section>
      </div>
    </main>
  );
}
