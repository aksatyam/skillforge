import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'SkillForge AI — Qualtech',
  description: 'AI-powered employee skill assessment platform',
  robots: { index: false, follow: false }, // internal-only
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-neutral-50 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
