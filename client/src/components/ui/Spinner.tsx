import { cn } from "@/lib/utils";

/**
 * Canonical loading spinner — a full faint ring with a bright quarter-arc
 * rotating on top. Replaces Lucide's `Loader2` everywhere in the app.
 *
 * Why this exists: `Loader2` is a 3/4-arc glyph that's also the rotating
 * element. At low speeds the missing 1/4 reads as a "flat spot on a tire"
 * — Bill flagged this on the bulk-import dialog and it's just as ugly on
 * every other spinning indicator (save buttons, sheet headers, panel
 * loaders). The pattern below is the standard Tailwind/MUI/iOS treatment:
 * a static dim ring underneath always sells "circle", and only the arc
 * spins. Visually steady, no asymmetric silhouette.
 *
 * API mirrors Loader2 so the sweep is mechanical:
 *   <Spinner className="w-4 h-4 animate-spin text-[#319ED8]" />
 *   <Spinner className="w-4 h-4 animate-spin text-[#319ED8]" />
 * `animate-spin` is baked in here, but leaving it in the className is
 * harmless — Tailwind dedupes the class.
 *
 * Color: stroke uses `currentColor`, so any `text-*` class on the wrapper
 * still colors the arc the same way it did for the Lucide icon.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
