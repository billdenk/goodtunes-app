// Task #2468 — implicit self-serve grant for the OWNER of an artist scope.
//
// A brand-new artist holds NO partner_permissions row and NO per-user
// overrides. Before this task that meant every edit verb resolved to
// `allowed=false` → 403, locking an artist out of their own catalog. The
// implicit owner default (resolveVerbAllowed / isArtistScopeOwner) fixes
// that WITHOUT seeding a partner_permissions row, and MUST NOT:
//   • grant the non-self-serve verbs (map_shopify / invite_subusers),
//   • escalate a Team teammate (sub_role set) who only holds a narrow
//     override, or
//   • extend to label scopes (label partners stay recognition-only), or
//   • override an explicit per-user DENY.
//
// This drives the shared authority directly against a real Postgres.
//
//   npx tsx --test server/artistOwnerSelfServe.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  checkPartnerVerbForScope,
  getAlbumEditAccess,
  resolveVerbAllowed,
  isArtistScopeOwner,
} from "./auth/partnerPermissions";

const exec = (q: any) => db.execute(q);
const id = (p: string) => `t2468-${p}-${randomUUID().slice(0, 8)}`;

// The artist scope the owner + teammate belong to.
const artistScopeId = id("artist");
// A label scope, to prove the implicit grant does NOT extend to labels.
const labelScopeId = id("label");

const ownerUser = id("owner"); // artist, sub_role NULL, no perms/overrides
const teamUser = id("team"); // artist, sub_role 'team', credits-only override
const denyUser = id("deny"); // owner shape + explicit edit_metadata deny
const labelOwnerUser = id("labelowner"); // label owner, sub_role NULL

const ownedAlbumId = id("album"); // released pre-sale (is_prepping=false, no sale)
const preppingAlbumId = id("prepalbum"); // is_prepping=true
const soldAlbumId = id("soldalbum"); // first_sold_at set, no override
const soldOverrideAlbumId = id("soldovralbum"); // first_sold_at set + active override
const overrideId = id("override");

async function seedUser(
  userId: string,
  role: string,
  scopeKind: string,
  scopeId: string | null,
  subRole: string | null = null,
) {
  const uniq = userId.slice(-8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, role, role_scope_id)
    VALUES (${userId}, ${"sv_" + uniq}, ${"x"}, ${"sv"},
            ${"sv_" + uniq + "@example.test"}, ${role}, ${scopeId})
  `);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${userId}, ${role}, ${scopeKind}, ${scopeId}, ${subRole})
  `);
}

async function seedOverride(
  scopeKind: string,
  scopeId: string,
  userId: string,
  verb: string,
  granted: boolean,
) {
  await exec(sql`
    INSERT INTO partner_permission_overrides
      (scope_kind, scope_id, user_id, verb, granted, updated_by_user_id, updated_at)
    VALUES (${scopeKind}, ${scopeId}, ${userId}, ${verb}, ${granted}, ${null}, NOW())
  `);
}

before(async () => {
  // An artist scope id IS a people.id (albums.primary_artist_id → people.id).
  await exec(sql`INSERT INTO people (id, name) VALUES (${artistScopeId}, ${"t2468 artist"})`);
  await seedUser(ownerUser, "artist", "artist", artistScopeId, null);
  await seedUser(teamUser, "artist", "artist", artistScopeId, "team");
  await seedUser(denyUser, "artist", "artist", artistScopeId, null);
  await seedUser(labelOwnerUser, "label", "label", labelScopeId, null);

  // Team member gets ONLY the narrow credits override — nothing else.
  await seedOverride("artist", artistScopeId, teamUser, "edit_credits_and_gear", true);
  // The deny user is a scope OWNER but a super-admin revoked edit_metadata.
  await seedOverride("artist", artistScopeId, denyUser, "edit_metadata", false);

  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${ownedAlbumId}, ${"t2468 album"}, ${"t2468 artist"}, ${""}, ${artistScopeId})
  `);
  // Task #2468 T2 — phase fixtures. Same owner + scope, different phase.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_prepping)
    VALUES (${preppingAlbumId}, ${"t2468 prepping"}, ${"t2468 artist"}, ${""}, ${artistScopeId}, ${true})
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, first_sold_at)
    VALUES (${soldAlbumId}, ${"t2468 sold"}, ${"t2468 artist"}, ${""}, ${artistScopeId}, NOW())
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, first_sold_at)
    VALUES (${soldOverrideAlbumId}, ${"t2468 sold+ovr"}, ${"t2468 artist"}, ${""}, ${artistScopeId}, NOW())
  `);
  // Active, single-shot admin override on the sold+override album so the
  // post-sale metadata branch can CONSUME it and resolve to allow.
  await exec(sql`
    INSERT INTO admin_overrides (id, target_table, target_id, granted_by_user_id, reason)
    VALUES (${overrideId}, ${"albums"}, ${soldOverrideAlbumId}, ${ownerUser}, ${"t2468 test override"})
  `);
});

after(async () => {
  try {
    await exec(sql`DELETE FROM admin_overrides WHERE id = ${overrideId}`);
    await exec(sql`DELETE FROM albums WHERE id IN (${ownedAlbumId}, ${preppingAlbumId}, ${soldAlbumId}, ${soldOverrideAlbumId})`);
    await exec(
      sql`DELETE FROM partner_permission_overrides WHERE user_id IN (${teamUser}, ${denyUser})`,
    );
    await exec(
      sql`DELETE FROM memberships WHERE user_id IN (${ownerUser}, ${teamUser}, ${denyUser}, ${labelOwnerUser})`,
    );
    await exec(
      sql`DELETE FROM users WHERE id IN (${ownerUser}, ${teamUser}, ${denyUser}, ${labelOwnerUser})`,
    );
    await exec(sql`DELETE FROM people WHERE id = ${artistScopeId}`);
  } finally {
    await pool.end();
  }
});

const artistScope = () => ({ kind: "artist" as const, id: artistScopeId });

test("pure resolveVerbAllowed: artist owner gets the four self-serve verbs, nothing else", () => {
  const owner = { role: "artist" as const, subRole: null };
  assert.equal(resolveVerbAllowed("artist", owner, null, "edit_metadata", null), true);
  assert.equal(resolveVerbAllowed("artist", owner, null, "upload_masters", null), true);
  assert.equal(resolveVerbAllowed("artist", owner, null, "edit_credits_and_gear", null), true);
  assert.equal(resolveVerbAllowed("artist", owner, null, "manage_payouts", null), true);
  // Not self-serve — artist owner still can't touch these implicitly.
  assert.equal(resolveVerbAllowed("artist", owner, null, "map_shopify", null), false);
  assert.equal(resolveVerbAllowed("artist", owner, null, "invite_subusers", null), false);
});

test("pure resolveVerbAllowed: explicit deny beats the owner default", () => {
  const owner = { role: "artist" as const, subRole: null };
  assert.equal(resolveVerbAllowed("artist", owner, null, "edit_metadata", false), false);
});

test("pure resolveVerbAllowed: teammates + label scopes get no implicit grant", () => {
  assert.equal(isArtistScopeOwner("artist", { role: "artist", subRole: "team" }), false);
  assert.equal(isArtistScopeOwner("artist", { role: "artist", subRole: "manager" }), false);
  assert.equal(isArtistScopeOwner("label", { role: "label", subRole: null }), false);
  const team = { role: "artist" as const, subRole: "team" };
  assert.equal(resolveVerbAllowed("artist", team, null, "edit_metadata", null), false);
  const labelOwner = { role: "label" as const, subRole: null };
  assert.equal(resolveVerbAllowed("label", labelOwner, null, "edit_metadata", null), false);
});

test("DB: artist owner (no perms row) may run every self-serve verb", async () => {
  for (const verb of ["edit_metadata", "upload_masters", "edit_credits_and_gear", "manage_payouts"] as const) {
    const err = await checkPartnerVerbForScope(ownerUser, verb, artistScope());
    assert.equal(err, null, `owner must be allowed ${verb} (null = pass)`);
  }
});

test("DB: artist owner is still refused the non-self-serve verbs", async () => {
  for (const verb of ["map_shopify", "invite_subusers"] as const) {
    const err = await checkPartnerVerbForScope(ownerUser, verb, artistScope());
    assert.equal(err?.status, 403, `owner must be refused ${verb}`);
  }
});

test("DB: an explicit edit_metadata deny beats the owner default", async () => {
  const denied = await checkPartnerVerbForScope(denyUser, "edit_metadata", artistScope());
  assert.equal(denied?.status, 403, "explicit deny → 403");
  // The deny is verb-scoped: masters upload still works for the owner.
  const stillOk = await checkPartnerVerbForScope(denyUser, "upload_masters", artistScope());
  assert.equal(stillOk, null, "deny on edit_metadata must NOT bleed into upload_masters");
});

test("DB: a Team teammate is NOT escalated by the owner default", async () => {
  const okCredits = await checkPartnerVerbForScope(teamUser, "edit_credits_and_gear", artistScope());
  assert.equal(okCredits, null, "team keeps its granted credits verb");
  const denyMeta = await checkPartnerVerbForScope(teamUser, "edit_metadata", artistScope());
  assert.equal(denyMeta?.status, 403, "team must still be refused edit_metadata");
  const denyMasters = await checkPartnerVerbForScope(teamUser, "upload_masters", artistScope());
  assert.equal(denyMasters?.status, 403, "team must still be refused upload_masters");
});

test("DB: a label owner gets NO implicit grant (labels stay recognition-only)", async () => {
  const denied = await checkPartnerVerbForScope(labelOwnerUser, "edit_metadata", {
    kind: "label",
    id: labelScopeId,
  });
  assert.equal(denied?.status, 403, "label owner must be refused edit_metadata");
});

test("DB: getAlbumEditAccess reports the owner default (canEdit + canManagePayouts)", async () => {
  const owner = await getAlbumEditAccess(ownerUser, ownedAlbumId);
  assert.ok(owner, "edit-access resolves for a scoped artist");
  assert.equal(owner!.canEdit, true, "owner canEdit");
  assert.equal(owner!.canManagePayouts, true, "owner canManagePayouts");
  assert.deepEqual(owner!.missingPermissions, [], "owner has no missing permissions");

  const team = await getAlbumEditAccess(teamUser, ownedAlbumId);
  assert.ok(team, "edit-access resolves for a teammate");
  assert.equal(team!.canEdit, false, "credits-only teammate cannot edit metadata");
  assert.ok(team!.missingPermissions.includes("edit_metadata"), "teammate missing edit_metadata");
});

// ─── T2: phase-based gate (commerce pricing path) ───────────────────
// checkPartnerVerbForScope with albumIdForLock+phaseAware is the gate the
// commerce SKU/add-on pricing routes run through. There's no divert
// channel there, so a queued outcome collapses to a 403 that carries
// `requestChange` (the client turns that into "Request a change").

test("DB phase: prepping owner edits metadata + masters directly", async () => {
  const meta = await checkPartnerVerbForScope(ownerUser, "edit_metadata", artistScope(), {
    albumIdForLock: preppingAlbumId,
    phaseAware: true,
  });
  assert.equal(meta, null, "prepping metadata → allow (null)");
  const masters = await checkPartnerVerbForScope(ownerUser, "upload_masters", artistScope(), {
    albumIdForLock: preppingAlbumId,
  });
  assert.equal(masters, null, "prepping masters → allow (null)");
});

test("DB phase: released pre-sale owner → request-a-change (pricing has no queue)", async () => {
  const meta = await checkPartnerVerbForScope(ownerUser, "edit_metadata", artistScope(), {
    albumIdForLock: ownedAlbumId,
    phaseAware: true,
  });
  assert.equal(meta?.status, 403, "released metadata (commerce path) → 403");
  assert.equal(meta?.body?.requestChange, true, "carries requestChange");
  assert.equal(meta?.body?.locked, false, "not locked pre-sale");
  const masters = await checkPartnerVerbForScope(ownerUser, "upload_masters", artistScope(), {
    albumIdForLock: ownedAlbumId,
  });
  assert.equal(masters?.status, 403, "released masters → 403");
  assert.equal(masters?.body?.requestChange, true, "masters carries requestChange");
  assert.equal(masters?.body?.locked, false, "masters not locked pre-sale");
});

test("DB phase: post-sale owner without an override is locked → request-a-change", async () => {
  const meta = await checkPartnerVerbForScope(ownerUser, "edit_metadata", artistScope(), {
    albumIdForLock: soldAlbumId,
    phaseAware: true,
  });
  assert.equal(meta?.status, 403, "post-sale metadata → 403");
  assert.equal(meta?.body?.requestChange, true, "carries requestChange");
  assert.equal(meta?.body?.locked, true, "locked post-sale");
  const masters = await checkPartnerVerbForScope(ownerUser, "upload_masters", artistScope(), {
    albumIdForLock: soldAlbumId,
  });
  assert.equal(masters?.status, 403, "post-sale masters → 403");
  assert.equal(masters?.body?.locked, true, "masters locked post-sale");
});

test("DB phase: post-sale metadata consumes an active admin override → allow", async () => {
  const ok = await checkPartnerVerbForScope(ownerUser, "edit_metadata", artistScope(), {
    albumIdForLock: soldOverrideAlbumId,
    phaseAware: true,
  });
  assert.equal(ok, null, "active override consumed → allow (null)");
});

test("DB phase: ownerOnly passes NON-owners through byte-for-byte (commerce)", async () => {
  // A Team teammate on the SAME scope is not the owner → ownerOnly
  // short-circuits to null (no gate), exactly as commerce's bearer-only
  // requireAdmin let them through before this task.
  const team = await checkPartnerVerbForScope(teamUser, "edit_metadata", artistScope(), {
    albumIdForLock: soldAlbumId,
    phaseAware: true,
    ownerOnly: true,
  });
  assert.equal(team, null, "ownerOnly + non-owner teammate → pass (null)");
  // A label owner on a DIFFERENT scope likewise passes untouched.
  const label = await checkPartnerVerbForScope(
    labelOwnerUser,
    "edit_metadata",
    { kind: "label", id: labelScopeId },
    { albumIdForLock: soldAlbumId, phaseAware: true, ownerOnly: true },
  );
  assert.equal(label, null, "ownerOnly + label owner → pass (null)");
});

test("DB phase: ownerOnly STILL gates the artist owner (post-sale lock holds)", async () => {
  const meta = await checkPartnerVerbForScope(ownerUser, "edit_metadata", artistScope(), {
    albumIdForLock: soldAlbumId,
    phaseAware: true,
    ownerOnly: true,
  });
  assert.equal(meta?.status, 403, "owner + ownerOnly post-sale → still 403");
  assert.equal(meta?.body?.requestChange, true, "carries requestChange");
});

// ─── T3: getAlbumEditAccess surfaces phase state for the editor ──────
// The client (AdminAlbum) reads {isPrepping, requestOnly} to show a
// "Request a change" affordance instead of a dead-disabled field. This
// read must only PEEK — it never consumes an override — so it stays safe
// to call on every editor render. (Fixtures below don't depend on the
// override, which the commerce consume test above already burned.)

test("DB phase: edit-access surfaces prepping owner as direct edit", async () => {
  const a = await getAlbumEditAccess(ownerUser, preppingAlbumId);
  assert.ok(a, "resolves");
  assert.equal(a!.isPrepping, true, "prepping");
  assert.equal(a!.canEdit, true, "prepping owner can edit directly");
  assert.equal(a!.requestOnly, false, "prepping edits apply directly, not request-only");
});

test("DB phase: edit-access surfaces released owner as request-only", async () => {
  const a = await getAlbumEditAccess(ownerUser, ownedAlbumId);
  assert.ok(a, "resolves");
  assert.equal(a!.isPrepping, false, "released");
  assert.equal(a!.locked, false, "not locked pre-sale");
  assert.equal(a!.canEdit, true, "owner CAN edit a released release");
  assert.equal(a!.requestOnly, true, "released owner edits divert to review");
});

test("DB phase: edit-access surfaces post-sale owner as locked + request-only", async () => {
  const a = await getAlbumEditAccess(ownerUser, soldAlbumId);
  assert.ok(a, "resolves");
  assert.equal(a!.locked, true, "locked post-sale");
  assert.equal(a!.canEdit, false, "post-sale metadata is locked without an override");
  assert.equal(a!.requestOnly, true, "post-sale owner can still request a change");
});
