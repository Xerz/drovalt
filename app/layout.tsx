import type { Metadata } from 'next';

import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Drovalt — кабинет мерчанта',
  description: 'Современное управление станциями, играми и статистикой Drova.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
