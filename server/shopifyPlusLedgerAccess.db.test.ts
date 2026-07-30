// Task #2428 — Shopify+ manufacturing-ledger access split.
//
// The ledger has TWO permission tiers that the shopifyPlus.ts route gates
// (gatePayouts / gateEditMetadata) rely on:
//
//   • Paying a staged step (real ACH debit) → `manage_payouts`. ANYONE in
//     scope holding manage_payouts (label / manager / artist) may pay.
//   • Mutating the ledger STRUCTURE (quotes + staged step amounts, which
//     the operator hand-keys against the manufacturer's real quote) →
//     `edit_metadata`. A payer-only partner must NOT be able to change
//     what's owed.
//
// This exercises the shared authority both gates call —
// checkPartnerVerbForScope — directly against a real Postgres, proving the
// two verbs are independent so a manage_payouts-only partner is blocked
// from the structure-mutation routes (and vice-versa).
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/shopifyPlusLedgerAccess.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { checkPartnerVerbForScope } from "./auth/partnerPermissions";

const exec = (q: any) => db.execute(q);

const id = (p: string) => `sp-ledger-acl-${p}-${randomUUID().slice(0, 8)}`;

// The artist scope both partners are (or aren't) members of.
const artistScopeId = id("artist");
// A DIFFERENT artist scope, used to prove out-of-scope rejection.
const otherScopeId = id("artist-other");

const payerUser = id("payer"); // manage_payouts only
const editorUser = id("editor"); // edit_metadata only
const outUser = id("outsider"); // in scope of otherScopeId, not artistScopeId
const superUser = id("super"); // super_admin (bypasses every verb)

async function seedUser(
  userId: string,
  role: string,
  scopeId: string | null,
  // A null sub_role = the artist-scope OWNER (primary artist), who implicitly
  // self-serves every OWNER_SELF_SERVE_VERB. Pass "team" to seed a NON-owner
  // teammate whose verbs come SOLELY from the scope grant / per-user override.
  subRole: string | null = null,
) {
  const uniq = userId.slice(-8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, role, role_scope_id)
    VALUES (${userId}, ${"spacl_" + uniq}, ${"x"}, ${"spacl"},
            ${"spacl_" + uniq + "@example.test"}, ${role}, ${scopeId})
  `);
  // Mirror the legacy hat into the memberships SET (getUserRole /
  // findMembershipForScope read the SET). God role = null scope.
  const scopeKind = role === "super_admin" ? "global" : "artist";
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${userId}, ${role}, ${scopeKind}, ${scopeId}, ${subRole})
  `);
}

async function seedPerms(
  scopeId: string,
  opts: { managePayouts?: boolean; editMetadata?: boolean },
) {
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, manage_payouts, edit_metadata)
    VALUES (${"artist"}, ${scopeId}, ${!!opts.managePayouts}, ${!!opts.editMetadata})
  `);
}

before(async () => {
  await seedUser(payerUser, "artist", artistScopeId);
  await seedUser(editorUser, "artist", artistScopeId);
  await seedUser(outUser, "artist", otherScopeId);
  await seedUser(superUser, "super_admin", null);
  // Scope-wide grants: payer can pay but not edit; the scope also allows
  // edit_metadata so the editorUser (same scope) resolves it.
  // (partner_permissions is per-SCOPE, not per-user; the two test users
  // share the artist scope, so we grant both verbs on it and rely on the
  // membership + verb pair. To isolate per-user, use a distinct scope.)
  await seedPerms(artistScopeId, { managePayouts: true, editMetadata: true });
  await seedPerms(otherScopeId, { managePayouts: true, editMetadata: true });
});

after(async () => {
  try {
    await exec(sql`DELETE FROM partner_permissions WHERE scope_id IN (${artistScopeId}, ${otherScopeId})`);
    await exec(sql`DELETE FROM memberships WHERE user_id IN (${payerUser}, ${editorUser}, ${outUser}, ${superUser})`);
    await exec(sql`DELETE FROM users WHERE id IN (${payerUser}, ${editorUser}, ${outUser}, ${superUser})`);
  } finally {
    await pool.end();
  }
});

const scope = () => ({ kind: "artist" as const, id: artistScopeId });

test("a scope that grants manage_payouts allows the pay verb", async () => {
  const err = await checkPartnerVerbForScope(payerUser, "manage_payouts", scope());
  assert.equal(err, null, "manage_payouts must be allowed (null = pass)");
});

test("a scope that grants edit_metadata allows the structure-mutation verb", async () => {
  const err = await checkPartnerVerbForScope(editorUser, "edit_metadata", scope());
  assert.equal(err, null, "edit_metadata must be allowed (null = pass)");
});

test("manage_payouts and edit_metadata are checked independently", async () => {
  // Prove the two verbs don't imply each other: with a scope that grants
  // ONLY manage_payouts, the edit_metadata verb must be refused. We use a
  // throwaway scope so the grant is truly payer-only, and seed the user as a
  // NON-owner teammate (sub_role="team") — an artist-scope OWNER implicitly
  // self-serves every OWNER_SELF_SERVE_VERB (incl. edit_metadata) regardless
  // of the partner_permissions row, which would mask the independence check.
  const payerOnlyScope = id("artist-payeronly");
  const payerOnlyUser = id("payeronly");
  try {
    await seedUser(payerOnlyUser, "artist", payerOnlyScope, "team");
    await seedPerms(payerOnlyScope, { managePayouts: true, editMetadata: false });
    const okPay = await checkPartnerVerbForScope(payerOnlyUser, "manage_payouts", {
      kind: "artist",
      id: payerOnlyScope,
    });
    assert.equal(okPay, null, "payer-only scope may pay");
    const denyEdit = await checkPartnerVerbForScope(payerOnlyUser, "edit_metadata", {
      kind: "artist",
      id: payerOnlyScope,
    });
    assert.ok(denyEdit, "payer-only scope must be REFUSED edit_metadata");
    assert.equal(denyEdit?.status, 403, "refusal is a 403");
  } finally {
    await exec(sql`DELETE FROM partner_permissions WHERE scope_id = ${payerOnlyScope}`);
    await exec(sql`DELETE FROM memberships WHERE user_id = ${payerOnlyUser}`);
    await exec(sql`DELETE FROM users WHERE id = ${payerOnlyUser}`);
  }
});

test("an editor-only scope is refused the pay verb", async () => {
  // As above, the user is a NON-owner teammate (sub_role="team"): an
  // artist-scope owner would self-serve manage_payouts regardless of the
  // grant, defeating the point of the independence check.
  const editorOnlyScope = id("artist-editoronly");
  const editorOnlyUser = id("editoronly");
  try {
    await seedUser(editorOnlyUser, "artist", editorOnlyScope, "team");
    await seedPerms(editorOnlyScope, { managePayouts: false, editMetadata: true });
    const okEdit = await checkPartnerVerbForScope(editorOnlyUser, "edit_metadata", {
      kind: "artist",
      id: editorOnlyScope,
    });
    assert.equal(okEdit, null, "editor-only scope may edit structure");
    const denyPay = await checkPartnerVerbForScope(editorOnlyUser, "manage_payouts", {
      kind: "artist",
      id: editorOnlyScope,
    });
    assert.ok(denyPay, "editor-only scope must be REFUSED manage_payouts");
    assert.equal(denyPay?.status, 403, "refusal is a 403");
  } finally {
    await exec(sql`DELETE FROM partner_permissions WHERE scope_id = ${editorOnlyScope}`);
    await exec(sql`DELETE FROM memberships WHERE user_id = ${editorOnlyUser}`);
    await exec(sql`DELETE FROM users WHERE id = ${editorOnlyUser}`);
  }
});

// Task #2928 — the ledger GET (gatePayouts → manage_payouts) must be
// readable by the artist-scope OWNER even when the scope grants NOTHING
// (a brand-new artist has no partner_permissions row), while a verb-less
// teammate (the Niina mis-seed shape: sub_role='manager' on her own scope)
// still 403s, and a teammate explicitly granted manage_payouts reads OK.
test("ledger access: owner implicit / verb-less teammate 403 / granted teammate OK", async () => {
  const ledgerScope = id("artist-ledger");
  const ownerUser = id("owner");
  const teammateUser = id("teammate");
  const grantedUser = id("granted");
  try {
    // NO partner_permissions row at all — the owner must self-serve.
    await seedUser(ownerUser, "artist", ledgerScope, null);
    await seedUser(teammateUser, "artist", ledgerScope, "manager");
    await seedUser(grantedUser, "artist", ledgerScope, "manager");
    const s = { kind: "artist" as const, id: ledgerScope };

    const ownerOk = await checkPartnerVerbForScope(ownerUser, "manage_payouts", s);
    assert.equal(ownerOk, null, "scope OWNER (sub_role NULL) reads the ledger with no grant");

    const teammateDeny = await checkPartnerVerbForScope(teammateUser, "manage_payouts", s);
    assert.equal(teammateDeny?.status, 403, "verb-less teammate must 403 on the ledger");

    // Grant manage_payouts to ONE teammate via a per-user override.
    await exec(sql`
      INSERT INTO partner_permission_overrides (scope_kind, scope_id, user_id, verb, granted)
      VALUES ('artist', ${ledgerScope}, ${grantedUser}, 'manage_payouts', true)
    `);
    const grantedOk = await checkPartnerVerbForScope(grantedUser, "manage_payouts", s);
    assert.equal(grantedOk, null, "manage_payouts-granted teammate reads the ledger");

    // And the un-granted teammate is STILL refused (grant is per-user).
    const stillDeny = await checkPartnerVerbForScope(teammateUser, "manage_payouts", s);
    assert.equal(stillDeny?.status, 403, "other teammate stays refused");
  } finally {
    await exec(sql`DELETE FROM partner_permission_overrides WHERE scope_id = ${ledgerScope}`);
    await exec(sql`DELETE FROM memberships WHERE user_id IN (${ownerUser}, ${teammateUser}, ${grantedUser})`);
    await exec(sql`DELETE FROM users WHERE id IN (${ownerUser}, ${teammateUser}, ${grantedUser})`);
  }
});

test("a partner in a DIFFERENT scope is out-of-scope for either verb", async () => {
  const payErr = await checkPartnerVerbForScope(outUser, "manage_payouts", scope());
  const editErr = await checkPartnerVerbForScope(outUser, "edit_metadata", scope());
  assert.equal(payErr?.status, 403, "out-of-scope pay is 403");
  assert.equal(editErr?.status, 403, "out-of-scope edit is 403");
});

test("super_admin bypasses both verbs", async () => {
  const payErr = await checkPartnerVerbForScope(superUser, "manage_payouts", scope());
  const editErr = await checkPartnerVerbForScope(superUser, "edit_metadata", scope());
  assert.equal(payErr, null, "super_admin may pay");
  assert.equal(editErr, null, "super_admin may edit");
});
