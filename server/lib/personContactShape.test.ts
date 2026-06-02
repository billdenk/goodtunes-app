// Task #935 — coverage for the contact-shape Person page contract.
//
// GET /api/admin/people/:id (server/routes.ts) derives three things the
// AdminPerson contact-shape view depends on, all inline in the route:
//   1. `shape` — artist vs contact heuristic.
//   2. `gtRole` per attachment — the plain-language GoodTunes role read off
//      the entity kind (+ the ambassador-inviter flag for non-profits).
//   3. `introductions[]` — artists this person invited/referred, with a
//      status derived from the invite lifecycle.
// None of it is pure-function code, so — as in albumSunriseGate.test.ts and
// vendorsParent.test.ts — we transcribe the route's logic 1:1 here and test
// the contract against seeded in-memory fixtures. If the route drifts from
// this contract, these tests are the canary.
//
//   npx tsx --test server/lib/personContactShape.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
// Task #968 — the artist-vs-contact predicate now lives in a real shared
// module that both the People list endpoint and the Person detail
// endpoint import, so the two can never drift. Test the real code, not a
// transcription.
import { personShape, hasArtistShape } from "./personArtistShape";

// ---------------------------------------------------------------------------
// Reference implementations — mirror of server/routes.ts GET
// /api/admin/people/:id. Keep these in lock-step with the route.
// ---------------------------------------------------------------------------

type EntityKind =
  | "non_profit"
  | "manufacturer"
  | "label"
  | "vendor"
  | "fulfillment_partner"
  | string;

// gtRoleFor: entity kind (+ canInviteAmbassadors for non-profits) → the
// plain-language platform role shown on the contact page.
function gtRoleFor(kind: EntityKind, canAmb: boolean): string {
  switch (kind) {
    case "non_profit":
      return canAmb ? "Ambassador" : "Staff";
    case "manufacturer":
      return "Press contact";
    case "label":
      return "Label staff";
    case "vendor":
      return "Vendor contact";
    case "fulfillment_partner":
      return "Fulfillment contact";
    default:
      return "Contact";
  }
}

type InviteRow = {
  personId: string | null;
  name: string;
  photoUrl?: string | null;
  usedAt?: string | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
};

type ReferredRow = {
  id: string;
  name: string;
  photoUrl?: string | null;
};

type Introduction = {
  id: string | null;
  name: string;
  photoUrl: string | null;
  status: "signed" | "invited" | "expired" | "declined";
  at: string | null;
};

// inviteStatus: used → signed, revoked → declined, past-expiry → expired,
// otherwise invited. (used wins over revoked wins over expired.)
function inviteStatus(
  r: InviteRow,
  now: number,
): "signed" | "invited" | "expired" | "declined" {
  return r.usedAt
    ? "signed"
    : r.revokedAt
      ? "declined"
      : r.expiresAt && new Date(r.expiresAt).getTime() < now
        ? "expired"
        : "invited";
}

// buildIntroductions: invites first (deduped by person_id into `seen`),
// then referred-by People that have no surviving invite row are folded in
// as `signed`.
function buildIntroductions(
  invites: InviteRow[],
  referred: ReferredRow[],
  now: number,
): Introduction[] {
  const out: Introduction[] = [];
  const seen = new Set<string>();
  for (const r of invites) {
    const status = inviteStatus(r, now);
    if (r.personId) seen.add(r.personId);
    out.push({
      id: r.personId ?? null,
      name: r.name,
      photoUrl: r.photoUrl ?? null,
      status,
      at: r.usedAt ?? r.createdAt ?? null,
    });
  }
  for (const r of referred) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      name: r.name,
      photoUrl: r.photoUrl ?? null,
      status: "signed",
      at: null,
    });
  }
  return out;
}

// A fixed "now" so the expiry math doesn't drift with the wall clock.
const NOW = new Date("2026-06-02T00:00:00Z").getTime();
const PAST = "2026-05-01T00:00:00Z";
const FUTURE = "2999-12-31T00:00:00Z";

// ---------------------------------------------------------------------------
// gtRole mapping per entity kind.
// ---------------------------------------------------------------------------

test("gtRole: non_profit with ambassador rights reads Ambassador", () => {
  assert.equal(gtRoleFor("non_profit", true), "Ambassador");
});

test("gtRole: non_profit without ambassador rights reads Staff", () => {
  assert.equal(gtRoleFor("non_profit", false), "Staff");
});

test("gtRole: manufacturer reads Press contact", () => {
  assert.equal(gtRoleFor("manufacturer", false), "Press contact");
  // The ambassador flag only affects non-profits.
  assert.equal(gtRoleFor("manufacturer", true), "Press contact");
});

test("gtRole: label reads Label staff", () => {
  assert.equal(gtRoleFor("label", false), "Label staff");
});

test("gtRole: vendor reads Vendor contact", () => {
  assert.equal(gtRoleFor("vendor", false), "Vendor contact");
});

test("gtRole: fulfillment_partner reads Fulfillment contact", () => {
  assert.equal(gtRoleFor("fulfillment_partner", false), "Fulfillment contact");
});

test("gtRole: unknown kind falls back to Contact", () => {
  assert.equal(gtRoleFor("mystery", false), "Contact");
  assert.equal(gtRoleFor("", true), "Contact");
});

// ---------------------------------------------------------------------------
// shape heuristic — artist vs contact.
// ---------------------------------------------------------------------------

test("shape: a pure contact (no signals, no credits) is 'contact'", () => {
  // A business contact carries no creative credits at all — their title
  // ("Director") lives on the entity_contacts row, not in people.roles[].
  assert.equal(personShape({}), "contact");
  assert.equal(personShape({ manualRoles: [] }), "contact");
  assert.equal(personShape({ manualRoles: ["", "  "] }), "contact");
});

test("shape: isArtistPromoted override flips to 'artist'", () => {
  assert.equal(personShape({ isArtistPromoted: true }), "artist");
});

test("shape: a group is 'artist'", () => {
  assert.equal(personShape({ isGroup: true }), "artist");
});

test("shape: an explicit 'Artist' role tag flips to 'artist'", () => {
  assert.equal(personShape({ manualRoles: ["artist"] }), "artist");
  assert.equal(personShape({ manualRoles: ["  ARTIST  "] }), "artist");
});

test("shape: Task #968 — ANY non-empty creative-credit hat is 'artist'", () => {
  // The catalog is music-only by design, so any non-empty people.roles[]
  // entry — guitar, lyricist, producer, engineer — means artist, not
  // just the literal "Artist" hat. Island Styles (Guitar / Lyricist)
  // becomes an artist automatically.
  assert.equal(personShape({ manualRoles: ["Guitar"] }), "artist");
  assert.equal(personShape({ manualRoles: ["Lyricist", "Electric guitar"] }), "artist");
  assert.equal(personShape({ manualRoles: ["Producer"] }), "artist");
});

test("shape: Task #968 — a per-track/album credit (derived) is 'artist'", () => {
  // A player credited only on songs (no manual tag, no primary-artist
  // album) still reads as an artist.
  assert.equal(personShape({ hasDerivedCredit: true }), "artist");
});

test("shape: any catalog artist signal (role-scope / album / discography) is 'artist'", () => {
  assert.equal(personShape({ hasArtistCatalogSignal: true }), "artist");
});

test("shape: hasArtistShape mirrors personShape", () => {
  assert.equal(hasArtistShape({ manualRoles: ["Drums"] }), true);
  assert.equal(hasArtistShape({}), false);
});

test("shape: dual artist+NPO contact keeps artist shape", () => {
  // Tagged Artist AND attached to a non-profit as staff. The artist
  // credit wins, so the page renders the artist shape (the affiliation
  // is shown alongside, not instead).
  assert.equal(personShape({ manualRoles: ["Artist", "Director"] }), "artist");
});

// ---------------------------------------------------------------------------
// introductions — status derivation + referred-by fallback.
// ---------------------------------------------------------------------------

test("inviteStatus: used_at → signed (wins over everything)", () => {
  assert.equal(
    inviteStatus(
      { personId: "a", name: "A", usedAt: PAST, revokedAt: PAST, expiresAt: PAST },
      NOW,
    ),
    "signed",
  );
});

test("inviteStatus: revoked_at → declined (when not used)", () => {
  assert.equal(
    inviteStatus(
      { personId: "a", name: "A", revokedAt: PAST, expiresAt: PAST },
      NOW,
    ),
    "declined",
  );
});

test("inviteStatus: past expiry → expired (when not used/revoked)", () => {
  assert.equal(
    inviteStatus({ personId: "a", name: "A", expiresAt: PAST }, NOW),
    "expired",
  );
});

test("inviteStatus: pending (future expiry, no use/revoke) → invited", () => {
  assert.equal(
    inviteStatus({ personId: "a", name: "A", expiresAt: FUTURE }, NOW),
    "invited",
  );
});

test("inviteStatus: dateless pending invite → invited", () => {
  assert.equal(inviteStatus({ personId: "a", name: "A" }, NOW), "invited");
});

test("introductions: referrer contact with mixed-status invites maps each row", () => {
  // Seeded referrer contact: one signed, one declined, one expired, one
  // still pending — every lifecycle state in one record.
  const invites: InviteRow[] = [
    { personId: "p-signed", name: "Signed Artist", usedAt: PAST, createdAt: PAST },
    { personId: "p-declined", name: "Declined Artist", revokedAt: PAST, createdAt: PAST },
    { personId: "p-expired", name: "Expired Artist", expiresAt: PAST, createdAt: PAST },
    { personId: "p-invited", name: "Pending Artist", expiresAt: FUTURE, createdAt: PAST },
  ];
  const intros = buildIntroductions(invites, [], NOW);
  assert.deepEqual(
    intros.map((i) => [i.id, i.status]),
    [
      ["p-signed", "signed"],
      ["p-declined", "declined"],
      ["p-expired", "expired"],
      ["p-invited", "invited"],
    ],
  );
});

test("introductions: a used invite stamps `at` from used_at, else created_at", () => {
  const intros = buildIntroductions(
    [
      { personId: "p1", name: "Used", usedAt: PAST, createdAt: FUTURE },
      { personId: "p2", name: "Pending", createdAt: PAST },
    ],
    [],
    NOW,
  );
  assert.equal(intros[0].at, PAST); // used_at wins
  assert.equal(intros[1].at, PAST); // falls back to created_at
});

test("introductions: referred-by People with no invite fold in as signed", () => {
  const intros = buildIntroductions(
    [],
    [{ id: "ref-1", name: "Seeded Referral" }],
    NOW,
  );
  assert.equal(intros.length, 1);
  assert.deepEqual(
    { id: intros[0].id, status: intros[0].status, at: intros[0].at },
    { id: "ref-1", status: "signed", at: null },
  );
});

test("introductions: an invite row de-dupes its referred-by twin", () => {
  // The artist appears both as a used invite AND as a referred_by row;
  // the invite wins and the referred-by fallback is skipped (no dupe).
  const intros = buildIntroductions(
    [{ personId: "dup", name: "Dual Source", usedAt: PAST, createdAt: PAST }],
    [{ id: "dup", name: "Dual Source" }],
    NOW,
  );
  assert.equal(intros.length, 1);
  assert.equal(intros[0].status, "signed");
});
