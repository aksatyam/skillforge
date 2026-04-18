'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useFrameworks } from '@/hooks/use-frameworks';
import { useMe } from '@/hooks/use-me';

export default function FrameworksPage() {
  const me = useMe();
  const { data: frameworks = [], isLoading } = useFrameworks();

  const canEdit = me.data?.role === 'hr_admin' || me.data?.role === 'super_admin';

  return (
    <div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Competency Frameworks</h1>
          <p className="mt-1 text-sm text-brand-medium">
            Define AI maturity levels and role-family targets. One framework can be active at a
            time.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/frameworks/new"
            className="flex items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue"
          >
            <Plus size={16} /> New framework
          </Link>
        )}
      </header>

      {isLoading ? (
        <div className="text-brand-medium">Loading…</div>
      ) : frameworks.length === 0 ? (
        <EmptyState canEdit={canEdit} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {frameworks.map((fw) => (
            <Link
              key={fw.id}
              href={`/frameworks/${fw.id}`}
              className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-brand-blue hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-brand-navy">{fw.name}</h3>
                <StatusBadge status={fw.status} />
              </div>
              <p className="mt-2 text-sm text-brand-medium">
                v{fw.version} · {fw.maturityLevelsJson.length} levels ·{' '}
                {fw._count.roleMappings} role mappings
              </p>
              <p className="mt-3 text-xs text-brand-medium">
                Updated {new Date(fw.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'active' | 'archived' }) {
  const cls = {
    draft: 'bg-neutral-100 text-brand-medium',
    active: 'bg-green-100 text-brand-green',
    archived: 'bg-neutral-200 text-brand-medium',
  }[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      ● {status}
    </span>
  );
}

function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 p-12 text-center">
      <h3 className="text-lg font-semibold text-brand-dark">No frameworks yet</h3>
      <p className="mt-1 text-sm text-brand-medium">
        {canEdit
          ? 'Start by creating the Qualtech AI Capability Maturity Model.'
          : 'Your HR admin has not published an assessment framework yet.'}
      </p>
      {canEdit && (
        <Link
          href="/frameworks/new"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Create framework
        </Link>
      )}
    </div>
  );
}
