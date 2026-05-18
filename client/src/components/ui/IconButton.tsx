import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Circular icon button — the canonical primitive for every chrome
 * action on fan-facing mobile surfaces (search, filter/sort, share,
 * close, back-on-hero, photo viewer nav, chat send, etc.).
 *
 * Apple-HIG-correct: 44×44pt floor on `md` (default), 48×48pt on `lg`.
 * Anything that was previously 40×40 should migrate to `md` — the
 * extra 4px is invisible to the eye but materially better for thumbs.
 *
 * Variants:
 *  - `glass`  (default) — translucent white scrim on a dark background.
 *                         Used over hero artwork, navy collection bg,
 *                         player gradients.
 *  - `dimmed` — slightly darker glass (rgba 0,0,0,.45) for use on
 *               bright photos / album covers where a white scrim
 *               would wash out.
 *  - `solid`  — filled brand color, white icon. Primary action like
 *               "Send" in chat composer.
 *  - `ghost`  — no background, just icon. Tertiary, when the surface
 *               itself supplies enough contrast.
 *
 * Icons render at 19px on `md` and 22px on `lg` via a child-SVG
 * selector so consumers don't have to remember sizes.
 */

export type IconButtonSize = "md" | "lg";
export type IconButtonVariant = "glass" | "dimmed" | "solid" | "ghost";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /**
   * Accessible label. Required because these buttons are icon-only.
   * Sets aria-label automatically.
   */
  label: string;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: "w-11 h-11 [&>svg]:w-[19px] [&>svg]:h-[19px]",
  lg: "w-12 h-12 [&>svg]:w-[22px] [&>svg]:h-[22px]",
};

// Glass chip on the navy `#00062B` background. We've now tried 10%,
// 14%, and 16% white — all of them disappear into the navy on most
// real screens (Bill's 5K iMac in particular). Apple Music's chips
// read at roughly 22–24% white over its near-black bg; matching that
// makes the rounded surface clearly visible as a chip without ever
// looking like a hard button. Tuned against the live Collection page.
// Hover lifts another 8% for the desktop pointer affordance.
const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  glass: "text-white bg-white/[0.22] hover:bg-white/[0.30]",
  dimmed: "text-white bg-black/45 hover:bg-black/55 backdrop-blur-md",
  solid: "text-white bg-[#319ED8] hover:bg-[#319ED8]/90",
  ghost: "text-white hover:bg-white/[0.22]",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      size = "md",
      variant = "glass",
      label,
      className,
      type = "button",
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "rounded-full flex items-center justify-center flex-shrink-0",
          "active:scale-[0.94] transition-[transform,background-color] duration-150",
          "disabled:opacity-40 disabled:active:scale-100",
          SIZE_CLASSES[size],
          VARIANT_CLASSES[variant],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
