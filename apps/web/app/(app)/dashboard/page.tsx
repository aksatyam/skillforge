export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-brand-navy">Dashboard</h1>
      <p className="mt-2 text-brand-medium">
        Sprint 1 placeholder — completion % card, pending self-assessment CTA, team
        snapshot for managers.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Active cycles" value="1" subtitle="Apr–Jun 2026" />
        <Card title="Pending self-assessments" value="—" subtitle="Wire up in S2" />
        <Card title="Team completion" value="—" subtitle="Manager only — S4" />
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-brand-medium">
        {title}
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-navy">{value}</div>
      <div className="mt-1 text-xs text-brand-medium">{subtitle}</div>
    </div>
  );
}
