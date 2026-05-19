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
   * `muted` — alias kept for the consumer album-header meta line
   *   ("LP · 2025 · E"). Renders identically to `dark` now: per
   *   replit.md, every "E" on the site uses the same dimmed
   *   `#98A2B3` chip so the title-row badge and the meta-line badge
   *   share one styleguide treatment.
   * `slate` — for admin chrome on white cards (used on the Admin Album
   *   Tracks tab next to the collapsed track title).
   */
  tone?: "dark" | "slate" | "muted";
}) {
  // Consumer surfaces (`dark` + `muted`) now share the same dimmed
  // meta-grey fill (`#98A2B3`). Bill's note: the chip on a title row
  // should read like metadata — same dim grey as the "LP · 2025 · E"
  // bullet line — not a high-contrast white tile competing with the
  // title. Apple Music does the same: their explicit chip on dark
  // surfaces is a muted grey, never pure white. Admin (`slate`) keeps
  // its own scale because it sits on a white card, not #00062B.
  const toneClasses =
    tone === "slate"
      ? "bg-slate-200 text-slate-600"
      : "bg-[#98A2B3] text-[#00062B]";
  // Spacing from the title glyph is owned by the parent flex
  // container's `gap-*` rather than a margin baked in here — every
  // callsite already sits inside a flex with siblings (title, bullets,
  // year), so a default margin would double up. Title rows use
  // `gap-2.5` (10px) to mirror Apple Music's title-to-E breathing room.
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
