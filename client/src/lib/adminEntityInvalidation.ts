import type { QueryClient } from "@tanstack/react-query";

export type AdminEntityKind =
  | "vendor"
  | "person"
  | "label"
  | "manager"
  | "manufacturer"
  | "album"
  | "instrument";

/**
 * Single source of truth for "which React Query keys feed this admin
 * detail page?" — call after any write that mutates an entity's image
 * (logo, cover, photo, artwork) and every cached read of that entity
 * (detail page, header avatar, list rows, the iPhone live-preview card)
 * refetches in one tick.
 *
 * Image URLs are uuid-keyed (`/objects/uploads/<uuid>.<ext>`), so once
 * the cache hands React the new URL there's nothing else to do — the
 * browser fetches the new bytes fresh from a never-seen path. The trick
 * is that the cache only refetches if we invalidate the *actual* query
 * keys each page uses, which vary by entity. AdminVendor uses a single-
 * element `[profileEndpoint]` key whose first element is the *full URL*
 * — partial-matching against `["/api/vendors", id, "profile"]` will
 * never match it, which is exactly the staleness bug this helper fixes.
 *
 * Keep this map honest: if you wire a new admin detail page, add its
 * kind here rather than hand-rolling invalidations at the callsite.
 */
export async function invalidateAdminEntity(
  qc: QueryClient,
  kind: AdminEntityKind,
  id: string,
): Promise<void> {
  const keys: readonly unknown[][] = (() => {
    switch (kind) {
      case "vendor":
        // AdminVendor.tsx renders both /admin/vendors/:id and
        // /admin/makers/:id off one component, switching the profile
        // endpoint by mode. Bust both keys so the same upload works
        // whether the operator is on the Maker or Reseller surface,
        // plus the bare parent-candidate picker and the instruments join
        // feed. The role-filtered Maker/Reseller *index lists* are keyed
        // under their full URL (`["/api/vendors?role=maker"]`) and can't
        // be reached by this exact `["/api/vendors"]` key — they're swept
        // by the prefix predicate below instead.
        return [
          [`/api/vendors/${id}/profile`],
          [`/api/makers/${id}/profile`],
          ["/api/vendors"],
          ["/api/instruments"],
        ];
      case "person":
        // The Person admin shell reads the *admin* projection
        // (`["/api/admin/people", id]`) so it sees admin-only fields; the
        // public key feeds the player/list cards. Bust both or the
        // on-screen avatar never refetches after an upload.
        return [
          ["/api/admin/people", id],
          ["/api/people", id],
          ["/api/people"],
        ];
      case "label":
        // Albums + people carry label snapshots on their cards; bust
        // them too so a fresh logo shows on every linked surface.
        return [
          ["/api/labels", id],
          ["/api/labels"],
          ["/api/albums"],
          ["/api/people"],
        ];
      case "manager":
        // A manager's catalog is derived from roster people's albums, so
        // bust albums + people alongside the manager detail/list keys.
        return [
          ["/api/managers", id],
          ["/api/managers"],
          ["/api/albums"],
          ["/api/people"],
        ];
      case "manufacturer":
        // Also bust the press-portal /me key so the Press Admin sees the
        // updated vinylPlaceholderUrl immediately (the portal reads that
        // endpoint for its catalog panel, not /api/manufacturers/:id).
        return [
          ["/api/manufacturers", id],
          ["/api/manufacturers"],
          [`/api/press/${id}/me`],
        ];
      case "album":
        return [
          ["/api/albums", id],
          ["/api/albums"],
          ["/api/admin/albums"],
        ];
      case "instrument":
        return [
          ["/api/instruments", id],
          ["/api/instruments"],
        ];
    }
  })();
  // Some index lists cache under their *full* URL including a query string
  // (e.g. the Maker/Reseller lists at `["/api/vendors?role=maker"]`), which
  // an exact key can never match. Sweep those by URL prefix — same approach
  // as AdminVendors' own `invalidateActive` — so every filter variant
  // refetches after an image write.
  const prefixes: readonly string[] =
    kind === "vendor" ? ["/api/vendors?role="] : [];

  await Promise.all([
    ...keys.map((queryKey) => qc.invalidateQueries({ queryKey })),
    ...prefixes.map((prefix) =>
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith(prefix),
      }),
    ),
  ]);
}
