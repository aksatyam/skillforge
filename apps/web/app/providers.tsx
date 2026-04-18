'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { makeQueryClient } from '@/lib/query-client';
import { registerQueryClient } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const qc = makeQueryClient();
    registerQueryClient(qc);
    return qc;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
