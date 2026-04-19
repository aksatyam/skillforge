'use client';

/**
 * HR → CSV export templates — Sprint 6 feature #3.
 *
 * Lists built-ins (read-only) and tenant-custom templates (editable).
 * Custom templates are persisted on `organization.settings_json.exportTemplates`
 * via PUT /export/templates/:id.
 *
 * Scope of this page:
 *   • Create a new custom template with a kebab-case id, header names, and
 *     allowlisted source paths (dropdown pulls from COLUMN_SOURCE_PATHS).
 *   • Delete custom templates (built-ins can't be deleted — UI hides the
 *     button; the server returns 400 defensively).
 *   • Preview headers inline so HR can double-check the column order.
 *
 * Out of scope here:
 *   • Renaming an id (rename = delete + create).
 *   • Choosing the tenant default (lives on org settings, Sprint 7).
 */
import { useMemo, useState } from 'react';
import type { ExportTemplate } from '@skillforge/shared-types';
import { useMe } from '@/hooks/use-me';
import {
  COLUMN_SOURCE_PATHS,
  useDeleteExportTemplate,
  useExportTemplates,
  useUpsertExportTemplate,
  type ColumnSourcePath,
} from '@/hooks/use-export-templates';
import { Plus, Trash2, Save, X } from 'lucide-react';

type DraftColumn = { header: string; source: ColumnSourcePath };
type Draft = { id: string; name: string; columns: DraftColumn[] };

const KEBAB = /^[a-z0-9-]+$/;

const BLANK_DRAFT: Draft = {
  id: '',
  name: '',
  columns: [{ header: 'Employee Name', source: 'user.name' }],
};

export default function HrTemplatesPage() {
  const me = useMe();
  const templatesQ = useExportTemplates();
  const upsert = useUpsertExportTemplate();
  const remove = useDeleteExportTemplate();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = me.data?.role;
  const allowed = role === 'hr_admin' || role === 'super_admin';

  const templates = templatesQ.data ?? [];
  const builtins = useMemo(() => templates.filter((t) => t.builtin), [templates]);
  const custom = useMemo(() => templates.filter((t) => !t.builtin), [templates]);

  if (!me.data) return <div className="text-brand-medium">Loading…</div>;

  if (!allowed) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        <strong className="mr-1">403 —</strong>
        CSV export templates are managed by HR admins.
      </div>
    );
  }

  async function save() {
    if (!draft) return;
    setError(null);

    if (!KEBAB.test(draft.id)) {
      setError('ID must be lowercase kebab-case (e.g. "us-hris-v1").');
      return;
    }
    if (draft.name.trim().length < 1) {
      setError('Name is required.');
      return;
    }
    if (draft.columns.length < 1) {
      setError('At least one column is required.');
      return;
    }
    for (const c of draft.columns) {
      if (c.header.trim().length < 1) {
        setError('Every column needs a header.');
        return;
      }
    }

    try {
      await upsert.mutateAsync({
        id: draft.id,
        name: draft.name.trim(),
        columns: draft.columns.map((c) => ({ header: c.header.trim(), source: c.source })),
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-brand-navy">CSV export templates</h1>
        <p className="mt-1 text-sm text-brand-medium">
          Match the column layout your HRIS expects. Pick a built-in when exporting, or
          publish a custom mapping here and choose it on the cycle export screen.
        </p>
      </header>

      {templatesQ.isError && (
        <div className="rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
          Couldn&apos;t load templates: {String(templatesQ.error)}
        </div>
      )}

      {/* Built-ins */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-medium">
          Built-in ({builtins.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {builtins.map((t) => (
            <TemplateCard key={t.id} template={t} readOnly />
          ))}
        </div>
      </section>

      {/* Custom */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-medium">
            Custom ({custom.length})
          </h2>
          {!draft && (
            <button
              onClick={() => {
                setError(null);
                setDraft({ ...BLANK_DRAFT, columns: [...BLANK_DRAFT.columns] });
              }}
              className="inline-flex items-center gap-1 rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue"
            >
              <Plus size={14} /> New template
            </button>
          )}
        </div>

        {custom.length === 0 && !draft && (
          <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-brand-medium">
            No custom templates yet. Click <strong>New template</strong> to create one.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {custom.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onDelete={async () => {
                if (!confirm(`Delete template "${t.name}"?`)) return;
                await remove.mutateAsync(t.id);
              }}
            />
          ))}
        </div>
      </section>

      {/* Draft editor */}
      {draft && (
        <section className="rounded-lg border border-brand-navy/30 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-navy">New custom template</h2>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="text-sm text-brand-medium hover:text-brand-dark"
            >
              <X size={16} />
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
              {error}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-brand-dark">ID (kebab-case, permanent)</span>
              <input
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="e.g. us-hris-v1"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs outline-none focus:border-brand-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-brand-dark">Display name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. US HRIS v1"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand-blue"
              />
            </label>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-dark">Columns</h3>
              <button
                onClick={() =>
                  setDraft({
                    ...draft,
                    columns: [
                      ...draft.columns,
                      { header: '', source: 'user.id' },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
              >
                <Plus size={12} /> Add column
              </button>
            </div>

            <div className="space-y-2">
              {draft.columns.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 text-xs text-brand-medium">{i + 1}.</span>
                  <input
                    value={c.header}
                    onChange={(e) => {
                      const next = [...draft.columns];
                      next[i] = { ...c, header: e.target.value };
                      setDraft({ ...draft, columns: next });
                    }}
                    placeholder="Header (shown in CSV)"
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-brand-blue"
                  />
                  <select
                    value={c.source}
                    onChange={(e) => {
                      const next = [...draft.columns];
                      next[i] = { ...c, source: e.target.value as ColumnSourcePath };
                      setDraft({ ...draft, columns: next });
                    }}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                  >
                    {COLUMN_SOURCE_PATHS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const next = draft.columns.filter((_, j) => j !== i);
                      setDraft({ ...draft, columns: next.length ? next : BLANK_DRAFT.columns });
                    }}
                    disabled={draft.columns.length === 1}
                    className="rounded-md p-1 text-brand-medium hover:bg-red-50 hover:text-brand-red disabled:opacity-30"
                    title="Remove column"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={save}
              disabled={upsert.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:opacity-50"
            >
              <Save size={14} /> {upsert.isPending ? 'Saving…' : 'Save template'}
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-brand-dark hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  readOnly,
  onDelete,
}: {
  template: ExportTemplate;
  readOnly?: boolean;
  onDelete?: () => void | Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-brand-navy">{template.name}</div>
          <div className="font-mono text-[10px] text-brand-medium">{template.id}</div>
        </div>
        {!readOnly && onDelete && (
          <button
            onClick={onDelete}
            className="rounded-md p-1 text-brand-medium hover:bg-red-50 hover:text-brand-red"
            title="Delete template"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-medium">
          {template.columns.length} column{template.columns.length === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap gap-1">
          {template.columns.slice(0, 10).map((c, i) => (
            <span
              key={i}
              className="rounded bg-brand-navy/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-navy"
              title={c.source}
            >
              {c.header}
            </span>
          ))}
          {template.columns.length > 10 && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-brand-medium">
              +{template.columns.length - 10} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
