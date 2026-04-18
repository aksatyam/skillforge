'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@skillforge/shared-types';
import { clearSession, getAccessToken } from '@/lib/session';
import { useMe } from '@/hooks/use-me';
import {
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings2,
  Library,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { href: '/assessments', label: 'My Assessments', icon: <ClipboardList size={18} /> },
  { href: '/team', label: 'Team', icon: <Users size={18} />, roles: ['manager', 'hr_admin'] },
  {
    href: '/frameworks',
    label: 'Frameworks',
    icon: <Library size={18} />,
    roles: ['hr_admin'],
  },
  { href: '/users', label: 'Users', icon: <Users size={18} />, roles: ['hr_admin'] },
  { href: '/cycles', label: 'Cycles', icon: <Settings2 size={18} />, roles: ['hr_admin'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  // First pass: gate on token presence. If no token, clear any stale cache
  // from a previous session and redirect BEFORE useMe() fires its request.
  useEffect(() => {
    if (!getAccessToken()) {
      qc.clear();
      router.replace('/login');
      setHasToken(false);
      return;
    }
    setHasToken(true);
  }, [router, qc]);

  // Only fire /me after the token check passes.
  const me = useMe();

  if (hasToken === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-medium">
        Loading…
      </div>
    );
  }

  if (hasToken === false) {
    return null; // redirect in flight
  }

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-medium">
        Loading…
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-brand-medium">Session expired.</p>
          <button
            onClick={() => {
              clearSession();
              qc.clear();
              router.replace('/login');
            }}
            className="mt-2 text-sm text-brand-blue hover:underline"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  const user = me.data;
  const visibleNav = NAV.filter(
    (n) => !n.roles || n.roles.includes(user.role) || user.role === 'super_admin',
  );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 p-4">
          <Link href="/dashboard" className="block">
            <div className="font-mono text-[10px] uppercase tracking-widest text-brand-medium">
              SkillForge AI
            </div>
            <div className="text-lg font-bold text-brand-navy">{user.orgName}</div>
          </Link>
        </div>

        <nav className="flex-1 p-2">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-brand-navy/10 font-semibold text-brand-navy'
                    : 'text-brand-dark hover:bg-neutral-100'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-neutral-200 p-3">
          <div className="mb-2 text-xs">
            <div className="font-semibold text-brand-dark">{user.name}</div>
            <div className="text-brand-medium">{user.email}</div>
            <div className="mt-0.5 inline-block rounded-full bg-brand-navy/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-navy">
              {user.role}
            </div>
          </div>
          <button
            onClick={async () => {
              const refreshToken = sessionStorage.getItem('sf:refresh');
              if (refreshToken) {
                try {
                  await fetch('/api/assessment/auth/logout', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                  });
                } catch {
                  /* ignore */
                }
              }
              clearSession();
              qc.clear();
              router.replace('/login');
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-brand-dark hover:bg-neutral-100"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
