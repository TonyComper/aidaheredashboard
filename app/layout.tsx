import React from 'react';
import type { Metadata } from 'next';
import { Providers } from './providers'; // <- client boundary

export const metadata: Metadata = {
  title: 'AidaHere Dashboard',
  description: 'Assistant dashboards',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
