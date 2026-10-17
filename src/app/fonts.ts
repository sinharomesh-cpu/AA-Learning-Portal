import localFont from 'next/font/local';

// Fonts are self-hosted from the OFL-licensed Fontsource packages, so pages make no
// requests to third-party font services (child privacy; deviation DV-04).
export const outfit = localFont({
  src: '../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2',
  variable: '--font-outfit',
  weight: '100 900',
  display: 'swap',
});

export const jakarta = localFont({
  src: '../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  variable: '--font-jakarta',
  weight: '200 800',
  display: 'swap',
});

// Inter: body text on the public pages (Cosmic Luminary design system; owner decision OC-83).
export const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});
