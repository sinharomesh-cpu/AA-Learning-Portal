import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DemoPreviewBanner } from '@/components/shell/DemoPreviewBanner';
import { TestEnvironmentBanner } from '@/components/shell/TestEnvironmentBanner';
import { isTestEnvironment } from '@/config/testEnv';
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

/**
 * Applies a light/dark choice for the public pages before first paint (no flash). Only the
 * values "light" and "dark" are accepted; anything else leaves the device setting in charge.
 */
const THEME_BOOTSTRAP =
  "try{var t=localStorage.getItem('aa-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set by the script below before React loads, hence suppressHydrationWarning.
    <html lang="en" className={`${outfit.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {isHostedDemoPreview() ? <DemoPreviewBanner /> : null}
        {isTestEnvironment(process.env) ? <TestEnvironmentBanner /> : null}
        {children}
      </body>
    </html>
  );
}
