import Link from 'next/link';
import { brand } from '@/config/brand';
import { cx } from '@/lib/cx';

interface WordmarkProps {
  /** Pixel size of the wordmark text. */
  size?: 24 | 28 | 32 | 36;
  /** When set, the wordmark links home (with an accessible name). */
  href?: string;
  className?: string;
}

const SIZE: Record<NonNullable<WordmarkProps['size']>, string> = {
  24: 'text-[24px]',
  28: 'text-[28px]',
  32: 'text-[32px]',
  36: 'text-[36px]',
};

/** CMP-Brand: interim "AA Pro" text wordmark, Outfit 800, primary colour (OC-11). */
export function Wordmark({ size = 28, href, className }: WordmarkProps) {
  const classes = cx(
    'font-headline font-extrabold tracking-[-0.02em] text-primary no-underline',
    SIZE[size],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={`${brand.productName} home`}>
        {brand.productName}
      </Link>
    );
  }
  return <span className={classes}>{brand.productName}</span>;
}
