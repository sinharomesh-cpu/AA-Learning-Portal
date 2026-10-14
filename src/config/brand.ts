/**
 * The only place product brand strings live (OC-01, OC-11).
 * Components import from here; they never hard-code the product or tutor name.
 */
export const brand = {
  productName: 'AA Pro',
  tutorNameFull: 'AA Pro AI Tutor',
  tutorNameShort: 'AI Tutor',
} as const;

export type Brand = typeof brand;

/** Browser title for a page, e.g. "Home · AA Pro". */
export function pageTitle(pageName?: string): string {
  return pageName ? `${pageName} · ${brand.productName}` : brand.productName;
}
