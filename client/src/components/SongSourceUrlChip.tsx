// Task #3260 — operator-only provenance chip: the external link a track's
// master was imported from (pasted URL or Dropbox batch). Mirrors bonus
// videos' "Imported from" chip. Visibility is server-gated — the API strips
// songs.sourceUrl from every fan read AND from partner mutation responses,
// so this renders only when an operator session actually received the field.
export function SongSourceUrlChip({
  songId,
  sourceUrl,
}: {
  songId: string;
  sourceUrl?: string | null;
}) {
  if (!sourceUrl) return null;
  // Defense-in-depth at the UI boundary: only http(s) URLs become a
  // clickable link. Anything else (legacy junk, hostile javascript:/data:
  // values) renders as inert text — never an anchor href.
  let href: string | null = null;
  let label = sourceUrl;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      href = sourceUrl;
      label = parsed.hostname.replace(/^www\./, "");
    }
  } catch {
    /* unparseable → inert text */
  }
  return (
    <div className="flex items-center gap-2 text-xs text-fan-faint">
      <span className="font-medium uppercase tracking-wide text-fan-faint">
        Imported from
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-fan-secondary hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
          data-testid={`link-song-source-url-${songId}`}
        >
          {label}
        </a>
      ) : (
        <span
          className="truncate text-fan-secondary"
          data-testid={`link-song-source-url-${songId}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
