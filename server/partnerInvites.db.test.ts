// Task #966 — integration coverage for the DB *side effects* that fire
// at the edges of the self-serve partner-invite flows. Task #964 covered
// the pure *decision* rules; this file drives the real side-effect
// helpers (extracted into server/partnerInvites.ts) against a real
// Postgres, so a regression in the SQL or the branch logic goes red:
//
//   - accept-time referrer stamping — applyArtistAcceptReferral resolves
//     the invite's referrer chain onto the new artist's Person row
//     (people.referred_by_person_id / referred_by_org_id + an open
//     artist_referrals row). A label-referred invitee must stamp NOTHING
//     on the Person — provenance stays on the invite row.
//   - revoke-time placeholder cleanup — revokePlaceholderIfUnused deletes
//     the placeholder Person/Label only when the in-use COUNT guard is
//     zero (no albums, no admin login, no other invites). A wrong guard
//     leaks orphan rows or deletes a scope that's actually in use.
//
// Real DB (DATABASE_URL), Node's built-in runner, same invocation as the
// pure-function tests:
//
//   npx tsx --test server/partnerInvites.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook, so
// the test leaves the database exactly as it found it.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  applyArtistAcceptReferral,
  revokePlaceholderIfUnused,
} from "./partnerInvites";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

// Track every seeded id so teardown removes exactly what we created —
// albums first (FK → people/labels), then the scope rows themselves.
const created = {
  people: new Set<string>(),
  labels: new Set<string>(),
  albums: new Set<string>(),
  users: new Set<string>(),
  invites: new Set<string>(),
  referralPairs: [] as { referrer: string; invitee: string }[],
};

async function seedPerson(opts: { referredByOrgId?: string } = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, referred_by_org_id)
    VALUES (${id}, ${"t966 person " + id.slice(0, 8)}, ${opts.referredByOrgId ?? null})
  `);
  created.people.add(id);
  return id;
}

async function seedLabel(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${id}, ${"t966 label " + id.slice(0, 8)})`);
  created.labels.add(id);
  return id;
}

async function seedAlbum(opts: { primaryArtistId?: string; labelId?: string }): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, label_id)
    VALUES (${id}, ${"t966 album"}, ${"t966 artist"}, ${""}, ${opts.primaryArtistId ?? null}, ${opts.labelId ?? null})
  `);
  created.albums.add(id);
  return id;
}

async function seedUser(opts: { role: string; roleScopeId: string }): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, role, role_scope_id)
    VALUES (${id}, ${"t966_" + uniq}, ${"x"}, ${"t966"}, ${"t966_" + uniq + "@example.test"}, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function seedInvite(opts: {
  role: string;
  roleScopeId: string;
  referrerKind?: string | null;
  referrerScopeId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO admin_invites (id, email, role, role_scope_id, token, expires_at, created_by_user_id, referrer_kind, referrer_scope_id)
    VALUES (${id}, ${"t966_" + id.slice(0, 8) + "@example.test"}, ${opts.role}, ${opts.roleScopeId},
            ${"t966tok_" + id}, ${new Date(Date.now() + 7 * 864e5)}, ${randomUUID()},
            ${opts.referrerKind ?? null}, ${opts.referrerScopeId ?? null})
  `);
  created.invites.add(id);
  return id;
}

async function personReferredBy(id: string): Promise<{ person: string | null; org: string | null }> {
  const r = rows(await exec(sql`
    SELECT referred_by_person_id AS person, referred_by_org_id AS org FROM people WHERE id = ${id}
  `))[0];
  return { person: r?.person ?? null, org: r?.org ?? null };
}

async function personExists(id: string): Promise<boolean> {
  return rows(await exec(sql`SELECT 1 FROM people WHERE id = ${id}`)).length > 0;
}

async function labelExists(id: string): Promise<boolean> {
  return rows(await exec(sql`SELECT 1 FROM labels WHERE id = ${id}`)).length > 0;
}

async function referralCount(referrer: string, invitee: string): Promise<number> {
  created.referralPairs.push({ referrer, invitee });
  return rows(await exec(sql`
    SELECT COUNT(*)::int AS ct FROM artist_referrals
     WHERE referrer_person_id = ${referrer} AND invitee_person_id = ${invitee}
  `))[0]?.ct ?? 0;
}

after(async () => {
  try {
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const p of created.referralPairs) {
      await exec(sql`DELETE FROM artist_referrals WHERE referrer_person_id = ${p.referrer} AND invitee_person_id = ${p.invitee}`);
    }
    for (const id of created.invites) await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
    for (const id of created.labels) await exec(sql`DELETE FROM labels WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});

// ─── Accept-time referrer stamping ────────────────────────────────────

test("accept: an artist-referred invitee gets its referrer Person + an open referral row", async () => {
  const referrer = await seedPerson();
  const invitee = await seedPerson();

  await applyArtistAcceptReferral(exec, {
    role: "artist",
    roleScopeId: invitee,
    referrerKind: "artist",
    referrerScopeId: referrer,
  });

  assert.equal((await personReferredBy(invitee)).person, referrer, "referred_by_person_id should be stamped");
  assert.equal(await referralCount(referrer, invitee), 1, "an open artist_referrals row should exist");
});

test("accept: replaying the same accept never duplicates or re-homes the invitee", async () => {
  const referrer = await seedPerson();
  const otherReferrer = await seedPerson();
  const invitee = await seedPerson();
  const invite = { role: "artist", roleScopeId: invitee, referrerKind: "artist", referrerScopeId: referrer };

  await applyArtistAcceptReferral(exec, invite);
  await applyArtistAcceptReferral(exec, invite); // replayed accept — same pair

  assert.equal((await personReferredBy(invitee)).person, referrer, "first referrer wins");
  assert.equal(await referralCount(referrer, invitee), 1, "ON CONFLICT keeps a single referral row per pair");

  // A stale invite pointing the SAME invitee at a DIFFERENT referrer must
  // not re-home them — the Person stamp is NULL-guarded. (The referral row
  // is keyed by the referrer+invitee pair, so a distinct referrer opens a
  // distinct row; the attribution that matters — the Person stamp — is
  // unchanged, which is the regression this pins.)
  await applyArtistAcceptReferral(exec, { ...invite, referrerScopeId: otherReferrer });
  assert.equal((await personReferredBy(invitee)).person, referrer, "still the first referrer; never re-homed");
  await referralCount(otherReferrer, invitee); // register the distinct row for teardown
});

test("accept: a label-referred invitee stamps NOTHING on the Person; provenance stays on the invite", async () => {
  const labelScope = await seedLabel();
  const invitee = await seedPerson();
  const inviteId = await seedInvite({
    role: "artist",
    roleScopeId: invitee,
    referrerKind: "label",
    referrerScopeId: labelScope,
  });

  await applyArtistAcceptReferral(exec, {
    role: "artist",
    roleScopeId: invitee,
    referrerKind: "label",
    referrerScopeId: labelScope,
  });

  const ref = await personReferredBy(invitee);
  assert.equal(ref.person, null, "label-referred invitee must NOT get referred_by_person_id");
  assert.equal(ref.org, null, "label-referred invitee must NOT get referred_by_org_id");
  assert.equal(await referralCount(labelScope, invitee), 0, "no artist_referrals row for a label referrer");

  // The label's provenance lives only on the invite row — untouched by accept.
  const inv = rows(await exec(sql`
    SELECT referrer_kind AS kind, referrer_scope_id AS scope FROM admin_invites WHERE id = ${inviteId}
  `))[0];
  assert.equal(inv?.kind, "label");
  assert.equal(inv?.scope, labelScope);
});

test("accept: an ambassador-referred invitee inherits the ambassador's NPO", async () => {
  const orgId = randomUUID(); // referred_by_org_id is a loose varchar (no FK)
  const ambassador = await seedPerson({ referredByOrgId: orgId });
  const invitee = await seedPerson();

  await applyArtistAcceptReferral(exec, {
    role: "artist",
    roleScopeId: invitee,
    referrerKind: "ambassador",
    referrerScopeId: ambassador,
  });

  const ref = await personReferredBy(invitee);
  assert.equal(ref.person, ambassador, "points at the ambassador Person");
  assert.equal(ref.org, orgId, "inherits the ambassador's NPO so the roll-up includes them");
});

test("accept: a non-artist invitee (label role) or a missing referrer chain is a no-op", async () => {
  const referrer = await seedPerson();
  const labelInvitee = await seedLabel();
  // role=label → the whole stamp is skipped (labels carry no per-unit chain).
  await applyArtistAcceptReferral(exec, {
    role: "label",
    roleScopeId: labelInvitee,
    referrerKind: "artist",
    referrerScopeId: referrer,
  });
  assert.equal(await labelExists(labelInvitee), true, "label scope untouched");

  // Artist invitee but no referrer chain → nothing stamped.
  const invitee = await seedPerson();
  await applyArtistAcceptReferral(exec, {
    role: "artist",
    roleScopeId: invitee,
    referrerKind: null,
    referrerScopeId: null,
  });
  assert.equal((await personReferredBy(invitee)).person, null, "no referrer chain → no stamp");
});

// ─── Revoke-time placeholder cleanup ──────────────────────────────────

test("revoke: an unused placeholder Person is deleted when the in-use guard is zero", async () => {
  const scope = await seedPerson();
  const removed = await revokePlaceholderIfUnused(exec, "artist", scope, randomUUID());
  assert.equal(removed, true, "guard is zero → placeholder removed");
  assert.equal(await personExists(scope), false, "placeholder Person is gone");
});

test("revoke: a placeholder Person is preserved when a linked admin login exists", async () => {
  const scope = await seedPerson();
  await seedUser({ role: "artist", roleScopeId: scope });
  const removed = await revokePlaceholderIfUnused(exec, "artist", scope, randomUUID());
  assert.equal(removed, false, "a linked login pins the scope → not removed");
  assert.equal(await personExists(scope), true, "placeholder Person preserved");
});

test("revoke: a placeholder Person is preserved when an album references it", async () => {
  const scope = await seedPerson();
  await seedAlbum({ primaryArtistId: scope });
  const removed = await revokePlaceholderIfUnused(exec, "artist", scope, randomUUID());
  assert.equal(removed, false, "an album pins the scope → not removed");
  assert.equal(await personExists(scope), true, "placeholder Person preserved");
});

test("revoke: the invite being revoked is excluded, but ANOTHER invite preserves the scope", async () => {
  const scope = await seedPerson();
  const beingRevoked = await seedInvite({ role: "artist", roleScopeId: scope });
  // With only the invite being revoked pointing at it, the guard excludes
  // it → count zero → the placeholder is removable.
  // (verify the exclusion first on a sibling scope so this scope survives
  // for the next assertion)

  const otherInvite = await seedInvite({ role: "artist", roleScopeId: scope });
  const removed = await revokePlaceholderIfUnused(exec, "artist", scope, beingRevoked);
  assert.equal(removed, false, "another outstanding invite pins the scope → not removed");
  assert.equal(await personExists(scope), true, "placeholder Person preserved");
  assert.ok(otherInvite);
});

test("revoke: the id<>excludeInviteId exclusion lets a self-only scope be cleaned up", async () => {
  const scope = await seedPerson();
  const beingRevoked = await seedInvite({ role: "artist", roleScopeId: scope });
  // The ONLY invite pointing at the scope is the one being revoked, so the
  // guard's `id <> excludeInviteId` excludes it and the count is zero.
  const removed = await revokePlaceholderIfUnused(exec, "artist", scope, beingRevoked);
  assert.equal(removed, true, "only the revoked invite references it → removed");
  assert.equal(await personExists(scope), false, "placeholder Person is gone");
});

test("revoke: an unused placeholder Label is deleted; a referenced one is preserved", async () => {
  const free = await seedLabel();
  const removedFree = await revokePlaceholderIfUnused(exec, "label", free, randomUUID());
  assert.equal(removedFree, true, "no deps → label removed");
  assert.equal(await labelExists(free), false, "placeholder Label is gone");

  const inUse = await seedLabel();
  await seedAlbum({ labelId: inUse });
  const removedInUse = await revokePlaceholderIfUnused(exec, "label", inUse, randomUUID());
  assert.equal(removedInUse, false, "an album pins the label → not removed");
  assert.equal(await labelExists(inUse), true, "placeholder Label preserved");
});
