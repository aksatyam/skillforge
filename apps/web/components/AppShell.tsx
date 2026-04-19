'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@skillforge/shared-types';
import { clearSession, useHasSession } from '@/lib/session';
import { useMe } from '@/hooks/use-me';
import {
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings2,
  Library,
  BarChart3,
  BarChart2,
  TrendingUp,
  Bell,
  FileSpreadsheet,
} from 'lucide-react';
import { useEffect } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { href: '/assessments', label: 'My Assessments', icon: <ClipboardList size={18} /> },
  { href: '/scorecard', label: 'My scorecard', icon: <TrendingUp size={18} /> },
  {
    href: '/team/overview',
    label: 'Team overview',
    icon: <BarChart3 size={18} />,
    roles: ['manager', 'hr_admin'],
  },
  {
    href: '/team',
    label: 'Team roster',
    icon: <Users size={18} />,
    roles: ['manager', 'hr_admin'],
  },
  {
    href: '/frameworks',
    label: 'Frameworks',
    icon: <Library size={18} />,
    roles: ['hr_admin'],
  },
  { href: '/users', label: 'Users', icon: <Users size={18} />, roles: ['hr_admin'] },
  { href: '/cycles', label: 'Cycles', icon: <Settings2 size={18} />, roles: ['hr_admin'] },
  { href: '/hr/reports', label: 'Reports', icon: <BarChart2 size={18} />, roles: ['hr_admin'] },
  { href: '/hr/templates', label: 'Export templates', icon: <FileSpreadsheet size={18} />, roles: ['hr_admin'] },
  { href: '/hr', label: 'HR Dashboard', icon: <BarChart3 size={18} />, roles: ['hr_admin'] },
  { href: '/settings/notifications', label: 'Notification settings', icon: <Bell size={18} /> },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  // First pass: probe /api/session/me. The access token is httpOnly so we
  // can no longer check for its presence synchronously — we ask the server.
  // While the probe is in flight, render a spinner. If it comes back false,
  // redirect to /login before `useMe()` fires its request.
  const signedIn = useHasSession();

  useEffect(() => {
    if (signedIn === false) {
      qc.clear();
      router.replace('/login');
    }
  }, [signedIn, qc, router]);

  // `useMe()` is always called (hooks rules), but it's disabled until the
  // session probe succeeds so we don't fire a useless request pre-redirect.
  const me = useMe();

  if (signedIn === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-medium">
        Loading…
      </div>
    );
  }

  if (signedIn === false) {
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
            onClick={async () => {
              await clearSession();
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
            // Prefer the longest-matching href so siblings like `/team` and
            // `/team/overview` don't both light up when on the child route.
            const match = pathname === item.href || pathname.startsWith(item.href + '/');
            const betterMatch = visibleNav.some(
              (other) =>
                other.href !== item.href &&
                other.href.length > item.href.length &&
                (pathname === other.href || pathname.startsWith(other.href + '/')),
            );
            const active = match && !betterMatch;
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
              // clearSession() POSTs /api/session/logout which revokes the
              // refresh token upstream and clears both cookies.
              await clearSession();
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
