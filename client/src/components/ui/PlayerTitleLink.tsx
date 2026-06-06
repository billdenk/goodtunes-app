import { useLocation } from "wouter";

/**
 * Tappable now-playing song title that routes to the song's album.
 *
 * The title is the album's deep-link affordance on every player surface
 * (mobile mini-player capsule + expanded "Now Playing" + the compact
 * desktop dock renders its own variant via PlayerDock callbacks). Tapping
 * briefly underlines and routes to `/album/:id`.
 *
 * Safety mirrors PlayerNameLinks:
 *   - `stopPropagation` so the tap never also expands/collapses a player
 *     whose outer surface is itself a tap target.
 *   - Plain text (no link) when there's no album id, so we never navigate
 *     to a broken `/album/undefined`.
 *   - `truncate` carries through the caller's className so long titles
 *     ellipsize instead of wrapping.
 */
export function PlayerTitleLink({
  title,
  albumId,
  onNavigate,
  className = "",
  testId = "player-title",
}: {
  title: string;
  albumId?: string | number | null;
  /** Fired right before navigating — used to dismiss the expanded player. */
  onNavigate?: () => void;
  className?: string;
  testId?: string;
}) {
  const [, navigate] = useLocation();
  const hasAlbum = albumId != null && albumId !== "";

  if (!hasAlbum) {
    return (
      <div className={className} data-testid={testId}>
        {title}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate?.();
        navigate(`/album/${albumId}`);
      }}
      className={`block max-w-full text-left active:underline underline-offset-2 ${className}`}
      data-testid={testId}
    >
      {title}
    </button>
  );
}
