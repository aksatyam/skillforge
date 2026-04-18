'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateFrameworkDtoSchema,
  type CreateFrameworkDto,
} from '@skillforge/shared-types';
import { useCreateFramework } from '@/hooks/use-frameworks';
import { useMe } from '@/hooks/use-me';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';

const DEFAULT_LEVELS = [
  { level: 1, name: 'Aware', description: 'Understands basic AI concepts; no hands-on usage' },
  { level: 2, name: 'Exploring', description: 'Tried AI tools on isolated tasks; inconsistent' },
  { level: 3, name: 'Practitioner', description: 'Regular, productive use of AI in daily work' },
  { level: 4, name: 'Advanced', description: 'Designs AI-integrated workflows for team' },
  {
    level: 5,
    name: 'Leader',
    description: 'Shapes AI strategy; mentors others; publishes patterns',
  },
];

export default function NewFrameworkPage() {
  const router = useRouter();
  const createMut = useCreateFramework();
  const me = useMe();

  if (me.data && me.data.role !== 'hr_admin' && me.data.role !== 'super_admin') {
    return (
      <div className="rounded-md bg-amber-50 p-4 text-amber-900">
        HR admin access only.
      </div>
    );
  }

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateFrameworkDto>({
    resolver: zodResolver(CreateFrameworkDtoSchema),
    defaultValues: {
      name: 'Qualtech AI Capability Maturity Model',
      maturityLevels: DEFAULT_LEVELS,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'maturityLevels' });

  async function onSubmit(dto: CreateFrameworkDto) {
    try {
      // Re-number levels to guarantee 1..N (form allows editing)
      dto.maturityLevels = dto.maturityLevels.map((l, i) => ({ ...l, level: i + 1 }));
      const created = await createMut.mutateAsync(dto);
      router.push(`/frameworks/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create framework');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl">
      <h1 className="text-3xl font-bold text-brand-navy">New framework</h1>
      <p className="mt-1 text-sm text-brand-medium">
        Define the AI capability maturity ladder. You can add role-family targets after creating.
      </p>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <label className="block">
          <span className="text-sm font-medium text-brand-dark">Framework name</span>
          <input
            {...register('name')}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
          />
          {errors.name && (
            <span className="text-xs text-brand-red">{errors.name.message}</span>
          )}
        </label>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-navy">Maturity levels</h3>
          <button
            type="button"
            onClick={() =>
              append({ level: fields.length + 1, name: '', description: '' })
            }
            className="flex items-center gap-1 text-sm text-brand-blue hover:underline"
          >
            <Plus size={14} /> Add level
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {fields.map((f, i) => (
            <div
              key={f.id}
              className="grid grid-cols-[40px_200px_1fr_40px] items-start gap-2 rounded-md border border-neutral-200 p-3"
            >
              <div className="pt-2 font-mono text-sm font-semibold text-brand-medium">
                L{i + 1}
              </div>
              <input
                {...register(`maturityLevels.${i}.name` as const)}
                placeholder="Name (e.g. Practitioner)"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-blue"
              />
              <textarea
                {...register(`maturityLevels.${i}.description` as const)}
                placeholder="Description"
                rows={2}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-blue"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-md p-2 text-brand-medium hover:bg-red-50 hover:text-brand-red"
                disabled={fields.length <= 2}
                title={fields.length <= 2 ? 'Need at least 2 levels' : 'Remove level'}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        {errors.maturityLevels && (
          <p className="mt-2 text-xs text-brand-red">
            {errors.maturityLevels.message || 'Fix maturity level errors'}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-4 py-2 text-sm text-brand-dark hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:opacity-50"
        >
          {isSubmitting ? 'Creating…' : 'Create framework'}
        </button>
      </div>
    </form>
  );
}
