import { forwardRef, useState } from "react";
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
 *  - `fill`   — opaque light-gray circle with a dark glyph. Apple's
 *               `xmark.circle.fill` sheet-dismiss chip — the one big X
 *               every fan sheet closes with (see `SheetClose`).
 *  - `ghost`  — no background, just icon. Tertiary, when the surface
 *               itself supplies enough contrast.
 *
 * Icons render at 19px on `md` and 22px on `lg` via a child-SVG
 * selector so consumers don't have to remember sizes.
 */

export type IconButtonSize = "md" | "lg";
export type IconButtonVariant = "glass" | "dimmed" | "solid" | "fill" | "ghost";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /**
   * Accessible label. Required because these buttons are icon-only.
   * Sets aria-label automatically.
   */
  label: string;
  /**
   * Opt out of the ghost/glass hover background chip. The button keeps
   * its size, touch target, and active scale — only the hover-fill is
   * suppressed so the caller can emphasize the glyph itself instead.
   * Scoped escape hatch; the default hover chip is unchanged for
   * everyone else.
   */
  noHoverBg?: boolean;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: "w-11 h-11 [&>svg]:w-[19px] [&>svg]:h-[19px]",
  lg: "w-12 h-12 [&>svg]:w-[22px] [&>svg]:h-[22px]",
};

// Glass chip on the navy `#00062B` background. We tried Tailwind's
// arbitrary-opacity utilities (`bg-white/[0.14]`, `bg-white/[0.22]`)
// — they either failed to JIT-emit or rendered far weaker than spec
// on real screens. Switched the `glass` and `ghost` backgrounds to
// inline `rgba(...)` styles applied in the component body so the
// chip is deterministic across every build. Apple Music's chips
// over its near-black bg sit around 22% white; we use 22% rest /
// 30% hover. Text + size + ring still come from utility classes.
const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  glass: "text-white",
  dimmed: "text-white bg-black/45 hover:bg-black/55 backdrop-blur-md",
  solid: "text-white bg-[#319ED8] hover:bg-[#319ED8]/90",
  // Apple's xmark.circle.fill: opaque light-gray circle, dark glyph. Reads
  // cleanly on a dark navy sheet and over hero artwork alike.
  fill: "text-slate-800 bg-slate-200 hover:bg-slate-300",
  ghost: "text-white",
};

// Inline-style backgrounds for variants that Tailwind's JIT can't be
// fully trusted with (arbitrary white opacities). Applied via React
// state in the component below.
const REST_BG: Partial<Record<IconButtonVariant, string>> = {
  glass: "rgba(255,255,255,0.17)",
  ghost: "transparent",
};
const HOVER_BG: Partial<Record<IconButtonVariant, string>> = {
  glass: "rgba(255,255,255,0.26)",
  ghost: "rgba(255,255,255,0.17)",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      size = "md",
      variant = "glass",
      label,
      className,
      type = "button",
      style,
      children,
      noHoverBg = false,
      onMouseEnter,
      onMouseLeave,
      ...rest
    },
    ref,
  ) => {
    const [hover, setHover] = useState(false);
    const inlineBg =
      !noHoverBg && (variant === "glass" || variant === "ghost")
        ? (hover ? HOVER_BG[variant] : REST_BG[variant])
        : undefined;
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
        style={inlineBg ? { backgroundColor: inlineBg, ...style } : style}
        onMouseEnter={(e) => {
          setHover(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setHover(false);
          onMouseLeave?.(e);
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
