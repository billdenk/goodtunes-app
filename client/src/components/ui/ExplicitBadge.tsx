/**
 * ExplicitBadge — small parental-advisory "E" pill rendered next to an
 * album title. Matches Apple Music's convention: a low-contrast filled
 * square so it reads as metadata, not a CTA.
 *
 * Lives in `client/src/components/ui/` per replit.md's primitives rule
 * (single home for app-wide concepts). Used by:
 *   - `Collection.tsx` album grid card (title row, `dark` tone)
 *   - `AlbumDetail.tsx` per-song row (`dark` tone) and the album-header
 *     meta line "LP · 2025 · E" (`muted` tone — see prop docs below).
 *     The h1 title row used to carry one too; it was pulled because
 *     two chips per header read as visual noise.
 *   - Admin Tracks tab on the collapsed track title (`slate` tone).
 * Consumer surfaces sit on the dark `#00062B` background; admin sits
 * on white. Pick the `tone` that matches the surface — don't fork.
 */
export function ExplicitBadge({
  className = "",
  tone = "dark",
}: {
  className?: string;
  /**
   * `dark` — for consumer surfaces on the #00062B background (default).
   *   Solid white fill, dark-navy glyph — Apple's dark-mode chip.
   * `slate` — for admin chrome on white cards (used on the Admin Album
   *   Tracks tab next to the collapsed track title).
   * `muted` — for the consumer album-header meta line ("LP · 2025 · E").
   *   Matches the surrounding `#98A2B3` meta-text color so the chip
   *   reads as part of the bulleted list instead of a higher-contrast
   *   second badge competing with the title-row one. Used after we
   *   pulled the title-row badge — the meta-line chip is now the sole
   *   E on the album header.
   */
  tone?: "dark" | "slate" | "muted";
}) {
  // `dark` was originally `bg-white/30 text-white`, then `bg-white/75
  // text-[#00062B]` — both still faded into the #00062B background and
  // read as a dim blue-grey square on the mobile player (Bill: "so dark
  // it's blending with the background"). Apple Music's dark-mode chip
  // is a fully-opaque light tile with a dark glyph — high contrast,
  // legible as metadata at a glance. We mirror that: solid white fill,
  // dark-navy glyph. No transparency, no tint pulling toward the bg.
  const toneClasses =
    tone === "slate"
      ? "bg-slate-200 text-slate-600"
      : tone === "muted"
        ? "bg-[#98A2B3] text-[#00062B]"
        : "bg-white text-[#00062B]";
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
