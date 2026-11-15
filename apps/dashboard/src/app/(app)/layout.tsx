import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell.tsx';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
