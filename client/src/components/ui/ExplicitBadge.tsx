/**
 * ExplicitBadge — small parental-advisory "E" pill rendered next to an
 * album title. Matches Apple Music's convention: a low-contrast filled
 * square so it reads as metadata, not a CTA.
 *
 * Lives in `client/src/components/ui/` per replit.md's primitives rule
 * (single home for app-wide concepts). Used by:
 *   - `Collection.tsx` album grid card (title row)
 *   - `AlbumDetail.tsx` header (next to <h1>)
 * Both surfaces sit on the dark `#00062B` consumer background, so the
 * default `bg-white/30 text-white` chip reads at the same contrast on
 * each. If we later need an admin-chrome variant (light bg, slate fill),
 * add a `tone` prop here rather than forking the chip.
 */
export function ExplicitBadge({
  className = "",
  tone = "dark",
}: {
  className?: string;
  /**
   * `dark` — for consumer surfaces on the #00062B background (default).
   * `slate` — for admin chrome on white cards (used on the Admin Album
   * Tracks tab next to the collapsed track title).
   */
  tone?: "dark" | "slate";
}) {
  // `dark` was originally `bg-white/30 text-white`, which faded into the
  // #00062B background almost completely once it sat next to a song
  // title in the mini-player dock (Bill: "it seems to get lost"). Apple
  // Music's explicit chip is a near-solid light square with a dark
  // glyph — high contrast, instantly readable as metadata. We mirror
  // that: solid-ish white fill, dark-navy glyph.
  const toneClasses =
    tone === "slate"
      ? "bg-slate-200 text-slate-600"
      : "bg-white/75 text-[#00062B]";
  return (
    <span
      aria-label="Explicit"
      title="Explicit content"
      data-testid="badge-explicit"
      className={`flex-shrink-0 inline-flex items-center justify-center w-[14px] h-[14px] rounded-[3px] text-[9px] font-bold leading-none ${toneClasses} ${className}`}
    >
      E
    </span>
  );
}
