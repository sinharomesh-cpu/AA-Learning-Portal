import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DemoPreviewBanner } from '@/components/shell/DemoPreviewBanner';
import { brand } from '@/config/brand';
import { isHostedDemoPreview } from '@/server/demo';
import '@/styles/globals.css';
import { jakarta, outfit } from './fonts';

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: `${brand.productName} learning portal`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#006194',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jakarta.variable}`}>
      <body>
        {isHostedDemoPreview() ? <DemoPreviewBanner /> : null}
        {children}
      </body>
    </html>
  );
}
