// Polarity-safe press-mark rendering (Task #3297).
//
// Presses upload logo marks of EITHER polarity — MRP's stored label logo is
// an already-white badge (/logo-mrp-white.svg, fill #f5f5f7) while the
// builder's bundled default (mrp-logo.svg) is a dark mark. The old blanket
// `invert(1) brightness(1.7)` filter whitened dark marks but double-inverted
// white ones into a garbled near-black smear on the black center label.
//
// The rule: on a DARK surface the whole glyph must read pure white; on a
// LIGHT surface pure dark — regardless of the uploaded asset's polarity.
// `brightness(0)` first collapses every source pixel to black (keeping
// alpha), then `invert(1)` flips that silhouette to white. Both branches are
// therefore deterministic for any source, with no per-press hand-tuning.
export type PressMarkSurface = 'dark' | 'light';

export function pressMarkFilter(surface: PressMarkSurface): string {
  return surface === 'dark' ? 'brightness(0) invert(1)' : 'brightness(0)';
}

/** White glyph for dark surfaces (black disc labels, dark jackets/sleeves). */
export const PRESS_MARK_ON_DARK = pressMarkFilter('dark');
/** Dark glyph for light surfaces (white labels, stickers, paper). */
export const PRESS_MARK_ON_LIGHT = pressMarkFilter('light');

/**
 * Partner-shell SVG marks may have only a dark-background (white) upload.
 * Keep dark-mode rendering byte-for-byte unchanged, but collapse every SVG
 * silhouette to dark ink on light chrome so no press-specific tuning is needed.
 */
export function pressMarkShellFilter(isLightMonochromeMark: boolean, darkMode: boolean): string | undefined {
  return !darkMode && isLightMonochromeMark ? PRESS_MARK_ON_LIGHT : undefined;
}
