// Task #1702 — one share handler for every album surface (mobile + iPad/
// desktop). Native-share-first, copy-link fallback, with the SAME share
// text, per-release link, and analytics on each surface so they never drift.
import { track } from "@/lib/analytics";
import { shareUrlForSlug } from "@shared/shareSlug";

export type ShareableAlbum = {
  id: string;
  title: string;
  artist: string;
  // Task #970 — clean per-release share slug. When present we share the
  // get.goodtunes.music/<slug> link operators promote instead of /album/:id.
  shareSlug?: string | null;
};

/** The clean per-release link when a slug exists, else the /album/:id URL. */
export function albumShareUrl(album: ShareableAlbum): string {
  if (album.shareSlug) return shareUrlForSlug(album.shareSlug);
  if (typeof window !== "undefined") return `${window.location.origin}/album/${album.id}`;
  return `/album/${album.id}`;
}

/** The Web Share payload (title + "Preview … on GoodTunes®" + link). */
export function albumShareData(album: ShareableAlbum) {
  return {
    title: album.title,
    text: `Preview ${album.artist}'s ${album.title} on GoodTunes®`,
    url: albumShareUrl(album),
  };
}

export type ShareAlbumCallbacks = {
  /** Called after the link is copied (native share unavailable). */
  onCopied?: () => void;
  /** Called when even the clipboard copy fails, with the URL to surface. */
  onCopyFailed?: (url: string) => void;
};

/**
 * Open the native share sheet for an album, falling back to copy-link when
 * the device/browser can't share. Fires `share_initiated` then
 * `share_completed` with the native-vs-copy destination.
 *
 * `navigator.share` works inside the native iOS WebView (TestFlight) under a
 * user gesture — the phone build already uses it — so iPad/desktop go through
 * the same path and need no extra Capacitor plugin. A cancelled native share
 * (AbortError) is swallowed and intentionally does NOT fire share_completed.
 */
export async function shareAlbum(
  album: ShareableAlbum,
  callbacks: ShareAlbumCallbacks = {},
): Promise<void> {
  const shareData = albumShareData(album);
  const hasNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const destination: "native" | "copy" = hasNativeShare ? "native" : "copy";
  track("share_initiated", { albumId: album.id, destination });

  if (hasNativeShare) {
    try {
      await navigator.share(shareData);
      track("share_completed", { albumId: album.id, destination: "native" });
    } catch {
      // User dismissed the share sheet (AbortError) — nothing to report.
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(shareData.url);
    track("share_completed", { albumId: album.id, destination: "copy" });
    callbacks.onCopied?.();
  } catch {
    callbacks.onCopyFailed?.(shareData.url);
  }
}
