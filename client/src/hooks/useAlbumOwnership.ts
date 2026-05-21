import { useEffect, useState } from "react";

/**
 * Returns whether the signed-in fan owns the given album.
 *
 * Today this is a stub: real ownership detection lands with the Stripe +
 * OrderDesk pipeline in a later task and will hit `/api/my-albums`. For
 * now the hook returns `false` in production and reads a per-album
 * `localStorage` flag in dev so QA can flip the Preview & Purchase page
 * between "not owned" (pre-release) and "owned" (post-purchase) without
 * needing a real checkout.
 *
 * Storage key: `gt:dev:ownership:<albumId>` → `"1"` means owned. Anything
 * else (including missing) is treated as not-owned.
 */
const KEY_PREFIX = "gt:dev:ownership:";
const CHANGE_EVT = "gt:dev:ownership-changed";

function readDevOwned(albumId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_PREFIX + albumId) === "1";
  } catch {
    return false;
  }
}

export function useAlbumOwnership(albumId: string | undefined): boolean {
  const [owned, setOwned] = useState(false);

  useEffect(() => {
    if (!albumId) {
      setOwned(false);
      return;
    }
    if (!import.meta.env.DEV) {
      setOwned(false);
      return;
    }
    setOwned(readDevOwned(albumId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ albumId: string }>).detail;
      if (!detail || detail.albumId === albumId) {
        setOwned(readDevOwned(albumId));
      }
    };
    window.addEventListener(CHANGE_EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [albumId]);

  return owned;
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
