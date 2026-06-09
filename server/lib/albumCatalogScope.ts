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
]);

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
      // non_profit) have dedicated per-partner album endpoints.  Fail closed
      // here so they never see the shared catalog.
      return NO_ALBUM_LIST_ROLES.has(info.role) ? [] : null;
  }
}
