/**
 * Re-validates native offline downloads against the fan's live entitlements
 * and revokes (deletes) files for albums they no longer own.
 *
 * Renders nothing — it's a mount-once side-effect host placed high in the
 * app shell. On WEB it is a complete no-op (there are no real downloaded
 * files to revoke). On NATIVE it:
 *   - migrates any pre-encryption plaintext downloads into the encrypted
 *     private store once per install, and
 *   - whenever the device is online and a TRUSTED /api/my-albums response
 *     has loaded, purges encrypted files for any album the fan no longer
 *     owns. It re-runs on app foreground so a revocation that happened while
 *     the app was backgrounded is enforced on the next resume.
 *
 * Purge is gated on a *successful* ownership fetch (never the errored/empty
 * fallback) so a transient outage can't wipe legitimately-owned downloads.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { isNative } from "@/lib/platform";
import {
  migrateLegacyDownloads,
  purgeRevokedDownloads,
} from "@/lib/nativeDownloads";

type MyAlbumRow = { albumId: string; isPreview?: boolean };

export function DownloadEntitlementGuard() {
  const { user } = useAuth();
  const isAdmin = !!(user?.isAdmin || user?.kind === "admin");
  const isFan = !!user && !isAdmin;

  // Only fans have revocable downloads; admins keep god-view access. Native
  // only — web never fetches this for revocation purposes.
  const enabled = isNative && isFan;

  const { data, isSuccess } = useQuery<MyAlbumRow[] | null>({
    queryKey: ["/api/my-albums"],
    enabled,
  });

  const ownedAlbumIds = useMemo(
    () => new Set((data ?? []).map((a) => a.albumId)),
    [data],
  );

  // One-time migration of legacy plaintext downloads into the encrypted store.
  useEffect(() => {
    if (!isNative) return;
    void migrateLegacyDownloads();
  }, []);

  // Revoke on every trusted ownership snapshot (initial load + refetches).
  useEffect(() => {
    if (!enabled || !isSuccess) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    void purgeRevokedDownloads(ownedAlbumIds);
  }, [enabled, isSuccess, ownedAlbumIds]);

  // Re-validate on app foreground: invalidate the ownership cache so the
  // effect above re-runs with a fresh snapshot after the app was backgrounded.
  useEffect(() => {
    if (!enabled) return;
    let handle: { remove: () => void } | null = null;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
    })
      .then((h) => {
        handle = h;
      })
      .catch(() => {
        /* @capacitor/app unavailable — best effort */
      });
    return () => handle?.remove();
  }, [enabled]);

  return null;
}
