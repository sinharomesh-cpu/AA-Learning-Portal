import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
  /** `tinted` uses the low surface container for nested panels. */
  tone?: 'plain' | 'tinted' | 'primary';
}

const TONES = {
  plain: 'bg-surface-container-lowest border-card-border',
  tinted: 'bg-surface-container-low border-card-border',
  primary: 'bg-primary border-primary text-on-primary',
} as const;

/** 24 px radius card used across every portal (DESIGN.md `rounded.md`). */
export function Card({ as: Tag = 'section', tone = 'plain', className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(
        'rounded-md border p-6 shadow-[0_4px_12px_-2px_rgba(19,27,46,0.05),0_2px_6px_-1px_rgba(19,27,46,0.03)]',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
