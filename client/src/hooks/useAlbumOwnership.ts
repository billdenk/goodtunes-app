import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Returns whether the signed-in fan "owns" the given album for the purpose
 * of full-length playback.
 *
 * Task #909 — this is now server-driven. It reads the fan's collection from
 * `/api/my-albums`, which returns real owned/comp copies AND any *active*
 * (non-expired) preview, while excluding previews whose 24h window has
 * lapsed. So an admin-granted preview unlocks full playback exactly while
 * it's live, and the album silently drops back to the 30s preview the moment
 * it expires — no client-side expiry math required.
 *
 * The dev-only `localStorage` override is kept as an additional OR so QA can
 * still flip the Preview & Purchase page between "not owned" and "owned"
 * without a real checkout. Storage key: `gt:dev:ownership:<albumId>` → `"1"`.
 */
const KEY_PREFIX = "gt:dev:ownership:";
const CHANGE_EVT = "gt:dev:ownership-changed";

type MyAlbumRow = { albumId: string };

function readDevOwned(albumId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_PREFIX + albumId) === "1";
  } catch {
    return false;
  }
}

export function useAlbumOwnership(albumId: string | undefined): boolean {
  // Server-side collection (owned/comp + active previews; expired previews
  // already filtered out by the API). staleTime: Infinity in the shared
  // queryClient means this is fetched once and reused across surfaces.
  const { data: myAlbums } = useQuery<(MyAlbumRow & { isPreview?: boolean })[] | null>({
    queryKey: ["/api/my-albums"],
  });
  const serverOwned =
    !!albumId && (myAlbums ?? []).some((a) => a.albumId === albumId);

  // Dev-only localStorage override (QA toggle pill).
  const [devOwned, setDevOwned] = useState(false);
  useEffect(() => {
    if (!albumId || !import.meta.env.DEV) {
      setDevOwned(false);
      return;
    }
    setDevOwned(readDevOwned(albumId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ albumId: string }>).detail;
      if (!detail || detail.albumId === albumId) {
        setDevOwned(readDevOwned(albumId));
      }
    };
    window.addEventListener(CHANGE_EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [albumId]);

  return serverOwned || devOwned;
}

/**
 * Returns whether the fan has PERMANENT (non-preview) ownership of the album.
 * Unlike `useAlbumOwnership`, an admin-granted temporary preview does NOT
 * count. Used to gate playlist adds — a playlist entry is permanent, so it
 * requires a real purchase/comp grant (isPreview = false).
 */
export function useTrueAlbumOwnership(albumId: string | undefined): boolean {
  const { data: myAlbums } = useQuery<(MyAlbumRow & { isPreview?: boolean })[] | null>({
    queryKey: ["/api/my-albums"],
  });
  return !!albumId && (myAlbums ?? []).some((a) => a.albumId === albumId && !a.isPreview);
}

/**
 * Imperative setter used by the dev-only ownership toggle pill. Persists
 * to localStorage and broadcasts a `gt:dev:ownership-changed` event so
 * every `useAlbumOwnership` mount re-reads in lockstep (matches the
 * favorites / downloads stores).
 */
export function setDevAlbumOwnership(albumId: string, owned: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (owned) window.localStorage.setItem(KEY_PREFIX + albumId, "1");
    else window.localStorage.removeItem(KEY_PREFIX + albumId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVT, { detail: { albumId } }));
  } catch {
    // ignore quota / storage-disabled environments
  }
}
