import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";

/**
 * Shared fan-chrome scrim (Task #891).
 *
 * Apple's header/footer treatment: controls sit over a soft navy gradient
 * fade *at rest* (so content scrolling behind the bar stays legible with no
 * hard edge), and the bar gains a frosted backdrop-blur band *only while an
 * action / active mode is engaged* (selection, an open menu/picker, a
 * contextual toolbar) — then returns to gradient-only when that mode ends.
 *
 * iOS-WebKit safety (see the stacked-backdrop-blur memo):
 *   • At rest there is **zero** backdrop-filter surface — just a gradient.
 *   • When `active`, exactly **one** blur surface exists per region. It is
 *     mounted/unmounted by AnimatePresence and cross-fades via **opacity**;
 *     we never animate the `backdrop-filter` property itself.
 *   • Honors prefers-reduced-motion (near-instant fade) for free.
 *
 * Positioning is the consumer's job: pass `className` with `fixed`/`absolute`
 * + the inset/height that pins the scrim to the top or bottom edge it lines.
 * The component is always `pointer-events-none` so it never eats taps meant
 * for the controls floating above it.
 */

export interface ChromeScrimProps {
  /** Which edge the bar hugs — drives the gradient direction. */
  edge?: "top" | "bottom";
  /** True while an action / active mode is engaged → frosted blur fades in. */
  active?: boolean;
  /** Positioning + sizing (e.g. `fixed inset-x-0 bottom-0 h-32`). */
  className?: string;
  style?: React.CSSProperties;
}

// Navy → transparent fade, reached through `--brand-bg-rgb` (never the hex).
const GRADIENT: Record<"top" | "bottom", string> = {
  bottom:
    "linear-gradient(to top, rgba(var(--brand-bg-rgb), 0.92) 0%, rgba(var(--brand-bg-rgb), 0.55) 42%, rgba(var(--brand-bg-rgb), 0) 100%)",
  top:
    "linear-gradient(to bottom, rgba(var(--brand-bg-rgb), 0.92) 0%, rgba(var(--brand-bg-rgb), 0.55) 42%, rgba(var(--brand-bg-rgb), 0) 100%)",
};

export function ChromeScrim({
  edge = "bottom",
  active = false,
  className,
  style,
}: ChromeScrimProps) {
  const reduce = !!useReducedMotion();
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none overflow-hidden", className)}
      style={style}
      data-testid="chrome-scrim"
      data-active={active ? "true" : "false"}
    >
      {/* Gradient at rest — always painted, no hard band. */}
      <div className="absolute inset-0" style={{ background: GRADIENT[edge] }} />

      {/* The one frosted blur surface — only mounted while `active`, so at
          rest there is no backdrop-filter layer to composite over the
          scrolling content. Cross-fades by opacity, never by animating
          `backdrop-filter`. */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="frost"
            className="absolute inset-0"
            style={{
              background: "rgba(20, 22, 38, 0.72)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.05 : 0.2, ease: EASE_OUT }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
