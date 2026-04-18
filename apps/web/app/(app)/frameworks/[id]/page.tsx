'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UpsertRoleMappingDtoSchema,
  type UpsertRoleMappingDto,
} from '@skillforge/shared-types';
import {
  useFramework,
  usePublishFramework,
  useUpsertRoleMapping,
} from '@/hooks/use-frameworks';
import { useMe } from '@/hooks/use-me';
import { CheckCircle2, Plus } from 'lucide-react';

export default function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data: fw } = useFramework(id);
  const publish = usePublishFramework();
  const upsertMapping = useUpsertRoleMapping(id);

  const [showMappingForm, setShowMappingForm] = useState(false);

  if (!fw) return <div className="text-brand-medium">Loading…</div>;

  const canEdit =
    fw.status === 'draft' && (me.data?.role === 'hr_admin' || me.data?.role === 'super_admin');

  async function onPublish() {
    if (!confirm('Publish this framework? This will archive any currently-active framework.'))
      return;
    try {
      await publish.mutateAsync(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">{fw.name}</h1>
          <p className="mt-1 text-sm text-brand-medium">
            v{fw.version} · <StatusText status={fw.status} />
          </p>
        </div>
        {canEdit && fw._count.roleMappings > 0 && (
          <button
            onClick={onPublish}
            className="flex items-center gap-2 rounded-md bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <CheckCircle2 size={16} /> Publish
          </button>
        )}
      </header>

      <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-brand-navy">Maturity levels</h2>
        <div className="space-y-2">
          {fw.maturityLevelsJson.map((l) => (
            <div key={l.level} className="flex gap-3 rounded-md bg-neutral-50 p-3">
              <div className="font-mono font-semibold text-brand-blue">L{l.level}</div>
              <div>
                <div className="font-medium text-brand-dark">{l.name}</div>
                <div className="text-sm text-brand-medium">{l.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-brand-navy">Role mappings</h2>
          {canEdit && (
            <button
              onClick={() => setShowMappingForm((v) => !v)}
              className="flex items-center gap-1 text-sm text-brand-blue hover:underline"
            >
              <Plus size={14} /> {showMappingForm ? 'Cancel' : 'Add mapping'}
            </button>
          )}
        </div>

        {showMappingForm && (
          <RoleMappingForm
            onSubmit={async (dto) => {
              await upsertMapping.mutateAsync(dto);
              setShowMappingForm(false);
            }}
            maxLevel={fw.maturityLevelsJson.length}
          />
        )}

        {fw.roleMappings.length === 0 ? (
          <p className="mt-3 text-sm text-brand-medium">
            No role mappings yet. Add at least one before publishing.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-brand-medium">
              <tr>
                <th className="py-2">Role family</th>
                <th className="py-2">Target level</th>
                <th className="py-2">Rubric dimensions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {fw.roleMappings.map((m) => {
                const rubric = (m.assessmentCriteriaJson as { rubric?: Array<{ dimension: string }> })?.rubric ?? [];
                return (
                  <tr key={m.id}>
                    <td className="py-2 font-medium text-brand-dark">{m.roleFamily}</td>
                    <td className="py-2 font-mono text-brand-blue">L{m.targetLevel}</td>
                    <td className="py-2 text-brand-medium">
                      {rubric.map((r) => r.dimension).join(', ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusText({ status }: { status: 'draft' | 'active' | 'archived' }) {
  const color = { draft: 'text-brand-medium', active: 'text-brand-green', archived: 'text-brand-medium' }[
    status
  ];
  return <span className={color}>● {status}</span>;
}

function RoleMappingForm({
  onSubmit,
  maxLevel,
}: {
  onSubmit: (dto: UpsertRoleMappingDto) => Promise<void>;
  maxLevel: number;
}) {
  // Intersect the global schema with a dynamic target-level bound
  // so the form validates against the actual framework's ladder size.
  const dynamicSchema = UpsertRoleMappingDtoSchema.and(
    z.object({ targetLevel: z.number().int().min(1).max(maxLevel) }),
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UpsertRoleMappingDto>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {
      roleFamily: '',
      targetLevel: 3,
      assessmentCriteria: {
        rubric: [
          { dimension: 'Tool Usage', weight: 0.3 },
          { dimension: 'Output Quality', weight: 0.4 },
          { dimension: 'Sophistication', weight: 0.2 },
          { dimension: 'Knowledge Sharing', weight: 0.1 },
        ],
      },
    },
  });

  return (
    <form
      onSubmit={handleSubmit(async (dto) => {
        await onSubmit(dto);
        reset();
      })}
      className="mt-3 rounded-md border border-brand-blue/30 bg-blue-50/30 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="text-xs font-medium text-brand-dark">Role family</span>
          <input
            {...register('roleFamily')}
            placeholder="Engineering"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label>
          <span className="text-xs font-medium text-brand-dark">Target level (1–{maxLevel})</span>
          <input
            type="number"
            min={1}
            max={maxLevel}
            {...register('targetLevel', { valueAsNumber: true })}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-brand-medium">
        Default rubric (Tool Usage 30%, Output Quality 40%, Sophistication 20%, Knowledge Sharing 10%)
        will be used — edit per-mapping rubrics in Sprint 2.
      </p>
      {errors.roleFamily && (
        <p className="mt-1 text-xs text-brand-red">{errors.roleFamily.message}</p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-3 rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue disabled:opacity-50"
      >
        {isSubmitting ? 'Saving…' : 'Save mapping'}
      </button>
    </form>
  );
}
