'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { InviteUserDtoSchema, type InviteUserDto } from '@skillforge/shared-types';
import { useUsers, useInviteUser, useReissueInvite } from '@/hooks/use-users';
import { useMe } from '@/hooks/use-me';
import { UserPlus, Mail, Check, Clock } from 'lucide-react';

export default function UsersPage() {
  const me = useMe();
  const { data: users = [], isLoading } = useUsers();
  const invite = useInviteUser();
  const reissue = useReissueInvite();

  const [showInvite, setShowInvite] = useState(false);
  const [latestInvite, setLatestInvite] = useState<{ email: string; link: string } | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserDto>({
    resolver: zodResolver(InviteUserDtoSchema),
    defaultValues: { role: 'employee' },
  });

  const onInvite = async (dto: InviteUserDto) => {
    try {
      const result = await invite.mutateAsync(dto);
      const link = `${window.location.origin}/invite/${result.inviteToken}`;
      setLatestInvite({ email: result.user.email, link });
      reset();
      setShowInvite(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to invite');
    }
  };

  async function onReissue(userId: string, email: string) {
    try {
      const r = await reissue.mutateAsync(userId);
      const link = `${window.location.origin}/invite/${r.token}`;
      setLatestInvite({ email, link });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reissue invite');
    }
  }

  if (me.data && me.data.role !== 'hr_admin' && me.data.role !== 'super_admin') {
    return (
      <div className="rounded-md bg-amber-50 p-4 text-amber-900">
        HR admin access only. Ask Qualtech HR to invite you.
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Users</h1>
          <p className="mt-1 text-sm text-brand-medium">
            Invite employees, manage roles, and track onboarding status.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue"
        >
          <UserPlus size={16} /> Invite user
        </button>
      </header>

      {latestInvite && (
        <div className="mb-6 rounded-md border border-brand-green/30 bg-green-50 p-4">
          <p className="font-semibold text-brand-green">
            Invite issued for {latestInvite.email}
          </p>
          <p className="mt-1 text-xs text-brand-dark">
            In Sprint 4 this will be emailed automatically. For now, copy this one-time link:
          </p>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs text-brand-navy">
            {latestInvite.link}
          </code>
          <button
            className="mt-2 text-xs text-brand-blue hover:underline"
            onClick={() => navigator.clipboard.writeText(latestInvite.link)}
          >
            Copy link
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-brand-medium">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-brand-medium">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Role family</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => {
                const accepted = Boolean(u.inviteAcceptedAt);
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-brand-dark">{u.name}</td>
                    <td className="px-4 py-3 text-brand-dark">{u.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3 text-brand-medium">{u.roleFamily}</td>
                    <td className="px-4 py-3">
                      {accepted ? (
                        <span className="inline-flex items-center gap-1 text-brand-green">
                          <Check size={14} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-brand-orange">
                          <Clock size={14} /> Pending invite
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!accepted && (
                        <button
                          onClick={() => onReissue(u.id, u.email)}
                          className="inline-flex items-center gap-1 text-brand-blue hover:underline"
                        >
                          <Mail size={12} /> Re-send invite
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmit(onInvite)}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-xl font-bold text-brand-navy">Invite a user</h2>

            <Field label="Email" error={errors.email?.message}>
              <input
                type="email"
                {...register('email')}
                className="input"
                autoFocus
              />
            </Field>
            <Field label="Full name" error={errors.name?.message}>
              <input type="text" {...register('name')} className="input" />
            </Field>
            <Field label="Role family" error={errors.roleFamily?.message}>
              <input
                type="text"
                placeholder="Engineering / Product / Design…"
                {...register('roleFamily')}
                className="input"
              />
            </Field>
            <Field label="Designation" error={errors.designation?.message}>
              <input
                type="text"
                placeholder="Senior Engineer"
                {...register('designation')}
                className="input"
              />
            </Field>
            <Field label="Role" error={errors.role?.message}>
              <select {...register('role')} className="input">
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
                <option value="ai_champion">AI Champion</option>
                <option value="leadership">Leadership</option>
              </select>
            </Field>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                className="rounded-md px-4 py-2 text-sm text-brand-dark hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:opacity-50"
              >
                {isSubmitting ? 'Sending…' : 'Send invite'}
              </button>
            </div>

            <style jsx>{`
              .input {
                width: 100%;
                padding: 0.5rem 0.75rem;
                border: 1px solid #d4d4d4;
                border-radius: 0.375rem;
                outline: none;
              }
              .input:focus {
                border-color: #2e75b6;
                box-shadow: 0 0 0 1px #2e75b6;
              }
            `}</style>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="text-sm font-medium text-brand-dark">{label}</span>
      <div className="mt-1">{children}</div>
      {error && <span className="mt-1 text-xs text-brand-red">{error}</span>}
    </label>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-700',
    hr_admin: 'bg-brand-navy/10 text-brand-navy',
    manager: 'bg-brand-blue/10 text-brand-blue',
    ai_champion: 'bg-amber-100 text-amber-700',
    leadership: 'bg-brand-green/10 text-brand-green',
    employee: 'bg-neutral-100 text-brand-dark',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        color[role] ?? 'bg-neutral-100 text-brand-dark'
      }`}
    >
      {role}
    </span>
  );
}
