// Album catalog scoping — "fail closed" filter for partner-admin roles.
//
// Operators (super_admin / admin) get the full catalog including hidden
// albums; fans/customers get the full public store (handled upstream by
// storage.getAlbums({ includeHidden: false })); every partner-admin role
// is explicitly scoped to its own entity and returns an empty list when
// unattached.  No partner-admin role may fall through to the full catalog.
//
// Kept as a pure, synchronous helper so it can be tested without a DB.
// Manager scoping requires an async roster lookup — the caller passes in
// the already-resolved roster Set.

export interface RoleInfo {
  role: string;
  roleScopeId: string | null;
}

export interface AlbumStub {
  primaryArtistId: string | null;
  labelId: string | null;
}

// Partner-admin roles that have NO shared album-list access. They each have
// their own dedicated endpoints (/api/admin/<kind>/:id/albums) that return
// the albums relevant to them.
export const NO_ALBUM_LIST_ROLES = new Set([
  "manufacturer",
  "fulfillment",
  "vendor",
  "non_profit",
  // Task #2081 — a publisher/writer account is scoped to its own mechanical
  // statement (GET /api/publisher/statement) and has no shared-catalog access.
  // Without this it fell through to the operator full catalog (including hidden
  // releases) on GET /api/albums. Fail closed.
  "publisher",
]);

/**
 * Decide whether the caller may see a single HIDDEN/unreleased album on the
 * admin-aware detail read (GET /api/albums/:id).
 *
 * Operators (super_admin / admin) keep the full god-view. Every other
 * partner-admin role carries `isAdmin=true` but must only get the hidden
 * god-view for albums INSIDE its own scope — otherwise an isAdmin-flagged
 * partner (label, manager, manufacturer, vendor, fulfillment, non_profit,
 * publisher, artist, …) could deep-link a hidden/staged/sunrise release it
 * doesn't own by guessing the UUID. Released albums stay public regardless and
 * are resolved by the caller without this gate.
 *
 * Reuses `filterAlbumsForPartnerRole` on a single-album list so the per-role
 * scoping logic lives in exactly one place. A non-empty result = in scope;
 * `null` (the full-catalog signal) is only ever returned for operators, who
 * are short-circuited above — so for any non-operator role we fail closed.
 *
 * @param managerRoster  Pre-resolved roster Set — only required when
 *                       role==="manager" (same contract as filterAlbums…).
 */
export function partnerRoleCanSeeHiddenAlbum(
  album: AlbumStub,
  info: RoleInfo,
  managerRoster?: Set<string>,
): boolean {
  if (info.role === "super_admin" || info.role === "admin") return true;
  const scoped = filterAlbumsForPartnerRole([album], info, managerRoster);
  return !!scoped && scoped.length > 0;
}

/**
 * Return the subset of `albums` visible to a partner-admin, or `null` when
 * the caller is an operator and should see the full catalog.
 *
 * @param managerRoster  Pre-resolved set of artist person IDs on the
 *                       manager's roster — only required when role==="manager".
 */
export function filterAlbumsForPartnerRole<T extends AlbumStub>(
  albums: T[],
  info: RoleInfo,
  managerRoster?: Set<string>,
): T[] | null {
  switch (info.role) {
    case "super_admin":
    case "admin":
      return null; // operator → full catalog, caller handles

    case "artist": {
      const sid = info.roleScopeId;
      if (!sid) return [];
      return albums.filter((a) => a.primaryArtistId === sid);
    }

    case "label": {
      const sid = info.roleScopeId;
      if (!sid) return [];
      return albums.filter((a) => a.labelId === sid);
    }

    case "manager": {
      const sid = info.roleScopeId;
      if (!sid || !managerRoster) return [];
      return albums.filter(
        (a) => !!a.primaryArtistId && managerRoster.has(a.primaryArtistId),
      );
    }

    default:
      // All other partner-admin roles (manufacturer, fulfillment, vendor,
      // non_profit, publisher) have dedicated per-partner endpoints.  Fail
      // closed here so they never see the shared catalog.
      return NO_ALBUM_LIST_ROLES.has(info.role) ? [] : null;
  }
}
