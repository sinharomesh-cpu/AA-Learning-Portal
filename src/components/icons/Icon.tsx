import type { SVGProps } from 'react';
import { SYMBOLS, type SymbolName } from './symbols';

export type { SymbolName } from './symbols';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: SymbolName;
  /** Pixel size; the reference uses 16, 18, 20 and 24. */
  size?: number;
  /** Spoken name. Without it the icon is decorative and hidden from screen readers. */
  label?: string;
}

/**
 * One icon from the design's outlined set (Material Symbols). Inherits the text colour, so
 * it follows light and dark themes. Decorative unless given a label.
 */
export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
      data-icon={name}
      {...rest}
    >
      <path d={SYMBOLS[name]} />
    </svg>
  );
}
