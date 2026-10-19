/**
 * AA Pro signed-in page design (OC-108, OC-109, OC-110): shared class names, safe on the server.
 * Card shell with a tinted header, tiles, chip toggles and text inputs used on every signed-in
 * page (the homepage keeps its own approved design).
 */

export const SHELL =
  'overflow-hidden rounded-[28px] border border-card-border bg-surface-container-lowest shadow-[0_1px_2px_rgba(19,27,46,.04),0_16px_40px_-20px_rgba(19,27,46,.22)]';
export const HEAD =
  'flex flex-wrap items-start justify-between gap-4 border-b border-card-border bg-[linear-gradient(135deg,rgba(30,142,90,.08),rgba(0,97,148,.08))] px-5 py-5 sm:px-6';
export const BODY = 'flex flex-col gap-5 px-5 py-5 sm:px-6';
export const GREEN = '#13774a';
export const TILE =
  'flex min-w-0 flex-col gap-2 rounded-[20px] border border-card-border bg-surface-container-low/40 p-4';
export const TILE_KEY = 'text-[11px] font-extrabold uppercase tracking-[.07em] text-on-surface-variant';

/** A full-size transparent input over its card, so the whole card is the click target. */
export const OVERLAY_INPUT = 'absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0';

/** Chip toggle (checkbox or radio inside): filled blue with a tick when chosen. */
export const CHIP =
  'group relative flex h-11 cursor-pointer items-center gap-1.5 rounded-[14px] border border-card-border bg-surface-container-lowest px-3.5 text-[15px] font-extrabold text-on-surface hover:border-outline has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:checked]:shadow-[0_6px_14px_-8px_rgba(0,97,148,.8)] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';

/** Choice card (checkbox or radio inside) with a strong outline when chosen. */
export const CHOICE_CARD =
  'group relative flex cursor-pointer items-start gap-3 rounded-[20px] border border-card-border bg-surface-container-lowest p-4 has-[:checked]:border-2 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/30 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

/** Text input / textarea / native select: 1 px outline (3:1 boundary contrast), soft corners, focus ring. */
export const INPUT =
  'box-border w-full rounded-[16px] border border-outline bg-surface-container-lowest px-4 font-body text-base font-medium text-on-surface outline-none hover:border-on-surface-variant focus:border-primary focus:ring-4 focus:ring-primary/15 aria-[invalid=true]:border-error';
