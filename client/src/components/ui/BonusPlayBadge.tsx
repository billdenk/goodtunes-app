import { Loader2 } from "lucide-react";

/**
 * Shared Apple-Music-style play badge for unlocked bonus-video tiles.
 *
 * One visual definition consumed by both fan surfaces — the mobile
 * `BonusVideoPlayer` (AlbumDetail.tsx) and the desktop `BonusGrid`
 * (DesktopAlbumView.tsx) — so the badge can't drift between them. It
 * replaces the browser's native (unstyleable) `<video>` play glyph,
 * which disappears against dark posters.
 *
 * It is a SOLID semi-opaque dark circle (not a blur surface) with a
 * filled white play triangle, plus a soft shadow + hairline ring so it
 * reads on both bright and pure-black artwork. Deliberately NO
 * `backdrop-filter` — stacked blur surfaces trigger the iOS WebKit
 * "A problem repeatedly occurred" crash over scrolling image lists.
 *
 * Renders an absolute-positioned, `pointer-events-none` overlay so it can
 * either sit as a standalone sibling inside a `relative` tile (desktop
 * grid) or nest inside a tap-to-play `<button>` (mobile player) without
 * swallowing the tap. Pass `loading` while a signed playback URL is being
 * minted to swap the triangle for a spinner.
 */
export function BonusPlayBadge({
  loading = false,
  testId,
  placement = "center",
}: {
  loading?: boolean;
  testId?: string;
  // "center" — the original full-overlay placement used by the mobile
  // tap-to-play player. "bottom-right" — Apple-Music Music-Videos hover
  // affordance pinned to the lower-right corner of a wide video tile.
  placement?: "center" | "bottom-right";
}) {
  return (
    <div
      className={
        placement === "bottom-right"
          ? "absolute inset-0 flex items-end justify-end p-3 pointer-events-none"
          : "absolute inset-0 flex items-center justify-center pointer-events-none"
      }
      data-testid={testId}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: "rgba(0,0,0,0.55)",
          boxShadow:
            "0 2px 10px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.22)",
        }}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" strokeWidth={2.4} />
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="#ffffff"
            aria-hidden
            style={{ marginLeft: 2 }}
          >
            <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
          </svg>
        )}
      </div>
    </div>
  );
}
