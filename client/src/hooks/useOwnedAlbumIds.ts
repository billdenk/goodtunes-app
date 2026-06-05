import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

type MyAlbumRow = { albumId: string; isPreview?: boolean };

/**
 * Centralised owned-album gate for fan surfaces (Task #1292).
 *
 * Returns:
 *   ownedAlbumIds — Set of album IDs the fan owns (owned/comp + active
 *                   previews). Empty for admins (shouldFilter=false).
 *   shouldFilter  — true when the viewer is a logged-in fan (not admin).
 *                   When false, callers must show the full catalog.
 *   isReady       — true once the ownership list has loaded (or when
 *                   shouldFilter is false). Callers should defer rendering
 *                   until isReady to avoid a false empty-state flash.
 *
 * Implementation note: /api/my-albums is fetched with staleTime:Infinity in
 * the shared queryClient, so every fan surface reuses the same in-flight
 * request — there is no per-surface waterfall.
 */
export function useOwnedAlbumIds(): {
  ownedAlbumIds: Set<string>;
  shouldFilter: boolean;
  isReady: boolean;
} {
  const { user } = useAuth();
  const isAdmin = !!(user?.isAdmin || user?.kind === "admin");
  const isFan = !!user && !isAdmin;

  // isError: ownership fetch failed — treat as ready with an empty set
  // so fan surfaces fail closed (no albums shown) rather than leaking
  // the full catalog indefinitely. isSuccess: normal ready path.
  const { data: myAlbumsRaw, isSuccess, isError } = useQuery<MyAlbumRow[] | null>({
    queryKey: ["/api/my-albums"],
    enabled: isFan,
  });

  const ownedAlbumIds = useMemo(
    // On error myAlbumsRaw is undefined → [] → empty set, which is the
    // correct fail-closed behavior (fan sees nothing, not everything).
    () => new Set((myAlbumsRaw ?? []).map((a) => a.albumId)),
    [myAlbumsRaw],
  );

  return {
    ownedAlbumIds,
    shouldFilter: isFan,
    // Ready once the query settles (success or error). Non-fan viewers
    // are always ready because shouldFilter=false bypasses the gate.
    isReady: !isFan || isSuccess || isError,
  };
}
