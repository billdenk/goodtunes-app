// Shared dark-mode treatment for partner/brand logos on admin surfaces.
//
// Many partner marks (presses, makers, resellers, labels, non-profits,
// fulfillment partners) are near-black artwork on transparent alpha. The
// admin dark theme remaps their light tile chips (`bg-white`,
// `bg-[var(--apple-track)]`, …) to charcoal, so those marks vanish. The
// canonical fix (docs/design-system.md press-mark rule) is: when the dark
// theme is painted AND the image pixel-samples as a near-black mark, flip
// it white with a CSS invert. Colored logos, person photos, and album
// covers never match the dark-mark sample and are left untouched — and in
// light mode everything keeps its uploaded colors.
//
// Use `BrandMarkImg` as a drop-in replacement for a raw `<img>` wherever an
// admin surface renders a BRAND logo (never for person photos / album art).
// Being a component, it's safe inside `.map()` rows — the hooks live in the
// component, not the loop body.

import type { ImgHTMLAttributes } from "react";
import { useAdminDark, useDarkMarkLogo } from "@/lib/adminAppearance";

export const BRAND_MARK_INVERT_FILTER = "invert(1) brightness(1.7)";

/** True when `url` should be white-inverted right now: the admin dark theme
 * is painted and the image samples as a near-black monochrome mark. */
export function useBrandMarkInvert(url: string | null | undefined): boolean {
  const dark = useAdminDark();
  const darkMark = useDarkMarkLogo(url);
  return dark && darkMark;
}

/** `<img>` wrapper that applies the dark-mode white invert to near-black
 * brand marks. All other props pass straight through; an existing `style`
 * is preserved (the filter is merged on top only while inverting). */
export function BrandMarkImg({
  src,
  style,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const invert = useBrandMarkInvert(typeof src === "string" ? src : null);
  return (
    <img
      src={src}
      {...rest}
      style={invert ? { ...style, filter: BRAND_MARK_INVERT_FILTER } : style}
    />
  );
}
