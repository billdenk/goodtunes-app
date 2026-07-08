// Task #968 — single source of truth for the admin "is this Person an
// artist or a business contact?" decision.
//
// Bill's model: if you're tied to the music itself — writing,
// performance, or production/engineering — you're a musician/artist. A
// pure business role (label staff, NPO admin, press/vendor contact) is
// not. These are two independent axes on the *same* person, so being an
// artist never erases a partner affiliation and vice-versa.
//
// This works because every creative credit in the catalog is already
// music-only: `people.roles[]` holds catalog credit hats (Composer,
// Lyricist, Guitar, Drums, Producer, Engineer, …) and the per-track /
// per-album credit tables hold the same kind of hats. Business
// affiliations live entirely in separate tables (organization_people,
// entity_contacts) and never appear in roles[]. So the rule is:
//
//   any creative credit  ⇒ artist
//   affiliation alone     ⇒ contact
//   both at once          ⇒ artist (affiliation still shown alongside)
//
// Both the People list endpoint and the single-Person detail endpoint
// derive this; keep them calling THIS helper so the list classification
// and the detail page never drift.

export interface ArtistShapeSignals {
  // Operator override — "Promote to artist" / the explicit Artist hat.
  isArtistPromoted?: boolean | null;
  // A band / duo / orchestra row is always an artist.
  isGroup?: boolean | null;
  // people.roles[] — manual creative-credit tags off the role picker.
  // Any non-empty entry counts (the catalog is music-only by design).
  manualRoles?: readonly string[] | null;
  // True when the person carries any per-track / per-album creative
  // credit (track_writers ∪ track_performers ∪ album_credits).
  hasDerivedCredit?: boolean | null;
  // True for the long-standing artist signals: a primary-artist album,
  // a person_discography row, or a users.role='artist' role-scope.
  hasArtistCatalogSignal?: boolean | null;
}

function hasNonEmptyRole(roles?: readonly string[] | null): boolean {
  return Array.isArray(roles) && roles.some((r) => String(r ?? "").trim() !== "");
}

/**
 * The core predicate: does this Person read as an artist (vs a pure
 * business contact)? True when promoted, a group, carries any catalog
 * artist signal, has any per-track/album credit, OR has any non-empty
 * manual creative-credit tag.
 */
export function hasArtistShape(s: ArtistShapeSignals): boolean {
  if (s.isArtistPromoted || s.isGroup) return true;
  if (s.hasArtistCatalogSignal) return true;
  if (s.hasDerivedCredit) return true;
  return hasNonEmptyRole(s.manualRoles);
}

/** Same predicate, projected to the `"artist" | "contact"` shape string. */
export function personShape(s: ArtistShapeSignals): "artist" | "contact" {
  return hasArtistShape(s) ? "artist" : "contact";
}

/**
 * Task #2637 — is the operator "promote to artist" override the ONLY
 * artist signal on this person? Only then is removing the artist profile
 * a safe, honest demotion (it can never hide a real credit/catalog
 * signal). False when the person isn't promoted at all, or when any
 * other signal (group, manual creative role, catalog signal, derived
 * credit) would keep them in the artist shape anyway.
 */
export function promotionIsOnlyArtistSignal(s: ArtistShapeSignals): boolean {
  if (!s.isArtistPromoted) return false;
  return !hasArtistShape({ ...s, isArtistPromoted: false });
}
