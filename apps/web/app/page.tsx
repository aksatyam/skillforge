import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-start justify-center gap-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-brand-medium">
          SkillForge AI · Qualtech
        </p>
        <h1 className="mt-2 text-5xl font-bold text-brand-navy">
          AI-Powered Employee Skill Assessment
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-brand-dark">
          Measure, develop, and sustain AI capability across your workforce — fairly,
          continuously, and at scale.
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-brand-navy px-5 py-3 text-sm font-semibold text-white hover:bg-brand-blue"
        >
          Sign in
        </Link>
        <a
          href="/api/assessment/health"
          className="rounded-md border border-brand-navy px-5 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-navy/5"
        >
          Check service health
        </a>
      </div>

      <footer className="mt-16 text-xs text-brand-medium">
        Internal — Confidential. Not for external distribution.
      </footer>
    </main>
  );
}
