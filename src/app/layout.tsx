import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: `${brand.productName} learning portal`,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
