import { useLocation } from "wouter";

/**
 * Apple-Music-style tappable artist / album subtitle for the player.
 *
 * Renders the now-playing subtitle line as up to two individually-tappable
 * segments ("Artist — Album"). Tapping the artist segment routes to the
 * artist page; tapping the album segment routes to the album page. Each
 * segment briefly underlines on press. Used by BOTH the mobile mini-player
 * capsule and the expanded ("Now Playing") player so the affordance stays
 * consistent across the two surfaces.
 *
 * Safety:
 *   - `stopPropagation` on every tap so a segment never also expands the
 *     mini-player (whose outer capsule is itself a tap target).
 *   - A segment is only a link when its destination exists: no artist name
 *     → plain text; no album id → plain text. Never navigate to a broken
 *     `/album/undefined` or `/artist/` route.
 *   - Both segments `truncate`, so long names ellipsize instead of breaking
 *     the single-line layout.
 */
export function PlayerNameLinks({
  artist,
  albumId,
  albumTitle,
  onNavigate,
  className = "",
  segmentClassName = "",
  separatorClassName = "",
  testIdPrefix,
}: {
  artist?: string | null;
  albumId?: string | number | null;
  albumTitle?: string | null;
  /** Fired right before navigating — used to dismiss the expanded player. */
  onNavigate?: () => void;
  /** Classes for the wrapper line (spacing/leading live here). */
  className?: string;
  /** Classes for each name segment (color/size/weight live here). */
  segmentClassName?: string;
  /** Classes for the "—" separator (defaults to the segment classes). */
  separatorClassName?: string;
  testIdPrefix: string;
}) {
  const [, navigate] = useLocation();

  const go = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    onNavigate?.();
    navigate(path);
  };

  const hasArtist = !!artist && artist.trim().length > 0;
  const hasAlbum =
    albumId != null && albumId !== "" && !!albumTitle && albumTitle.trim().length > 0;

  return (
    <div className={`flex items-baseline min-w-0 ${className}`}>
      {hasArtist ? (
        <button
          type="button"
          onClick={(e) => go(e, `/artist/${encodeURIComponent(artist!)}`)}
          className={`min-w-0 shrink truncate text-left active:underline underline-offset-2 ${segmentClassName}`}
          data-testid={`${testIdPrefix}-artist`}
        >
          {artist}
        </button>
      ) : (
        artist && (
          <span className={`min-w-0 shrink truncate ${segmentClassName}`}>{artist}</span>
        )
      )}

      {hasAlbum && (
        <>
          <span
            aria-hidden="true"
            className={`flex-none px-1.5 ${separatorClassName || segmentClassName}`}
          >
            —
          </span>
          <button
            type="button"
            onClick={(e) => go(e, `/album/${albumId}`)}
            className={`min-w-0 shrink truncate text-left active:underline underline-offset-2 ${segmentClassName}`}
            data-testid={`${testIdPrefix}-album`}
          >
            {albumTitle}
          </button>
        </>
      )}
    </div>
  );
}
