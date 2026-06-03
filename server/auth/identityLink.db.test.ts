// Integration coverage for the unified-identity link seam
// (server/auth/identityLink.ts) against a real Postgres. These guard the
// two convergence invariants a code review flagged:
//
//   - Identity mirroring is BIDIRECTIONAL. A provider (Google/Apple) sub
//     attached only on the admin shell must be mirrored onto the canonical
//     fan row so the same sign-in resolves on the consumer player, and
//     vice-versa. A one-way mirror silently breaks one shell's OAuth.
//   - The fan-password fill never copies an `!oauth-only:` placeholder.
//     That string is not a hashed password; writing it into the canonical
//     customer_users.password would corrupt the store and break
//     forgot-password / password-compare.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/auth/identityLink.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  linkAdminToCustomer,
  mirrorAdminIdentitiesToCustomer,
  mirrorIdentityToLinked,
  unlinkIdentityEverywhere,
  writeLinkedPassword,
  adminLoginPasswordOk,
  isLinkableEmail,
} from "./identityLink";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  users: new Set<string>(),
  customers: new Set<string>(),
};

async function seedCustomer(opts: { password?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name, password)
    VALUES (${id}, ${"fan_" + tag}, ${"fan_" + tag + "@example.test"}, ${"Fan " + tag}, ${opts.password ?? null})
  `);
  created.customers.add(id);
  return id;
}

async function seedAdmin(opts: { password: string }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, email, display_name, password, is_admin)
    VALUES (${id}, ${"adm_" + tag}, ${"adm_" + tag + "@example.test"}, ${"Adm " + tag}, ${opts.password}, true)
  `);
  created.users.add(id);
  return id;
}

async function addAdminIdentity(adminId: string, provider: string, sub: string) {
  await exec(sql`
    INSERT INTO admin_identities (user_id, provider, provider_user_id, email, linked_at)
    VALUES (${adminId}, ${provider}, ${sub}, ${"id_" + sub + "@example.test"}, NOW())
    ON CONFLICT DO NOTHING
  `);
}

async function addCustomerIdentity(custId: string, provider: string, sub: string) {
  await exec(sql`
    INSERT INTO customer_identities (user_id, provider, provider_user_id, email, linked_at)
    VALUES (${custId}, ${provider}, ${sub}, ${"id_" + sub + "@example.test"}, NOW())
    ON CONFLICT DO NOTHING
  `);
}

async function custPassword(custId: string): Promise<string | null> {
  const r = await exec(sql`SELECT password FROM customer_users WHERE id = ${custId}`);
  return (rows(r)[0]?.password as string | null) ?? null;
}

async function adminPassword(adminId: string): Promise<string | null> {
  const r = await exec(sql`SELECT password FROM users WHERE id = ${adminId}`);
  return (rows(r)[0]?.password as string | null) ?? null;
}

async function adminLink(adminId: string): Promise<string | null> {
  const r = await exec(sql`SELECT customer_user_id FROM users WHERE id = ${adminId}`);
  return (rows(r)[0]?.customer_user_id as string | null) ?? null;
}

// Plain-equality comparator injected into adminLoginPasswordOk so the
// no-lockout *resolution* (own password OR linked-fan password) is what's
// under test, independent of the scrypt hashing scheme.
const eqCompare = async (supplied: string, stored: string) => supplied === stored;

async function customerHasIdentity(custId: string, provider: string, sub: string): Promise<boolean> {
  const r = await exec(sql`
    SELECT 1 FROM customer_identities
     WHERE user_id = ${custId} AND provider = ${provider} AND provider_user_id = ${sub}
  `);
  return rows(r).length > 0;
}

async function adminHasIdentity(adminId: string, provider: string, sub: string): Promise<boolean> {
  const r = await exec(sql`
    SELECT 1 FROM admin_identities
     WHERE user_id = ${adminId} AND provider = ${provider} AND provider_user_id = ${sub}
  `);
  return rows(r).length > 0;
}

test("link: an admin-only OAuth identity is mirrored onto the fan row (player shell resolves it)", async () => {
  const sub = "adminonly-" + randomUUID().slice(0, 8);
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const custId = await seedCustomer({ password: "$2b$10$" + "y".repeat(53) });
  await addAdminIdentity(adminId, "google", sub);

  await linkAdminToCustomer(adminId, custId);

  assert.equal(
    await customerHasIdentity(custId, "google", sub),
    true,
    "admin's google identity must be mirrored onto the canonical fan row",
  );
});

test("link: a fan-only OAuth identity is mirrored onto the admin row (admin shell resolves it)", async () => {
  const sub = "fanonly-" + randomUUID().slice(0, 8);
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const custId = await seedCustomer({ password: "$2b$10$" + "y".repeat(53) });
  await addCustomerIdentity(custId, "apple", sub);

  await linkAdminToCustomer(adminId, custId);

  assert.equal(
    await adminHasIdentity(adminId, "apple", sub),
    true,
    "fan's apple identity must be mirrored onto the linked admin row",
  );
});

test("link: an `!oauth-only:` admin placeholder is never copied into the canonical fan password", async () => {
  const adminId = await seedAdmin({ password: "!oauth-only:" + randomUUID().replace(/-/g, "") });
  const custId = await seedCustomer({ password: null });

  await linkAdminToCustomer(adminId, custId);

  assert.equal(
    await custPassword(custId),
    null,
    "fan password must stay NULL — the placeholder is not a hash and would corrupt the store",
  );
});

test("link: a real hashed admin password DOES fill an empty fan credential", async () => {
  const hash = "$2b$10$" + "z".repeat(53);
  const adminId = await seedAdmin({ password: hash });
  const custId = await seedCustomer({ password: null });

  await linkAdminToCustomer(adminId, custId);

  assert.equal(
    await custPassword(custId),
    hash,
    "an empty fan credential should adopt the admin's real hashed password",
  );
});

test("link: an existing fan password is never overwritten by the admin's", async () => {
  const fanHash = "$2b$10$" + "f".repeat(53);
  const adminHash = "$2b$10$" + "a".repeat(53);
  const adminId = await seedAdmin({ password: adminHash });
  const custId = await seedCustomer({ password: fanHash });

  await linkAdminToCustomer(adminId, custId);

  assert.equal(await custPassword(custId), fanHash, "fill-only: a real fan password must win");
});

test("mirror admin→customer: a sub already attached to a DIFFERENT fan is never re-pointed", async () => {
  const sub = "collide-" + randomUUID().slice(0, 8);
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const otherFan = await seedCustomer({ password: null });
  const targetFan = await seedCustomer({ password: null });
  await addAdminIdentity(adminId, "google", sub);
  await addCustomerIdentity(otherFan, "google", sub); // sub already owned elsewhere

  await mirrorAdminIdentitiesToCustomer(adminId, targetFan);

  assert.equal(
    await customerHasIdentity(targetFan, "google", sub),
    false,
    "ON CONFLICT DO NOTHING must skip a sub already attached to another fan",
  );
  assert.equal(
    await customerHasIdentity(otherFan, "google", sub),
    true,
    "the original owner of the sub is untouched",
  );
});

test("ongoing attach: a provider added on the admin shell mirrors to the linked fan", async () => {
  const sub = "attach-a2c-" + randomUUID().slice(0, 8);
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const custId = await seedCustomer({ password: "$2b$10$" + "y".repeat(53) });
  await linkAdminToCustomer(adminId, custId); // establish the link first
  await addAdminIdentity(adminId, "google", sub); // newly attached on admin

  await mirrorIdentityToLinked("admin", adminId, { provider: "google", providerUserId: sub, email: null });

  assert.equal(await customerHasIdentity(custId, "google", sub), true);
});

test("ongoing attach: a provider added on the fan shell mirrors to the linked admin", async () => {
  const sub = "attach-c2a-" + randomUUID().slice(0, 8);
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const custId = await seedCustomer({ password: "$2b$10$" + "y".repeat(53) });
  await linkAdminToCustomer(adminId, custId);
  await addCustomerIdentity(custId, "apple", sub);

  await mirrorIdentityToLinked("customer", custId, { provider: "apple", providerUserId: sub, email: null });

  assert.equal(await adminHasIdentity(adminId, "apple", sub), true);
});

test("ongoing detach: removing a provider on one shell removes it on the linked counterpart", async () => {
  const sub = "detach-" + randomUUID().slice(0, 8);
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const custId = await seedCustomer({ password: "$2b$10$" + "y".repeat(53) });
  await linkAdminToCustomer(adminId, custId);
  await addAdminIdentity(adminId, "google", sub);
  await addCustomerIdentity(custId, "google", sub);

  // Resolve the admin-side identity id, then unlink via the seam.
  const idRow = await exec(sql`
    SELECT id FROM admin_identities WHERE user_id = ${adminId} AND provider = ${"google"} AND provider_user_id = ${sub}
  `);
  const identityId = rows(idRow)[0]?.id as string;
  const ok = await unlinkIdentityEverywhere("admin", adminId, identityId);

  assert.equal(ok, true, "current-shell delete must report success");
  assert.equal(await adminHasIdentity(adminId, "google", sub), false, "removed on admin");
  assert.equal(await customerHasIdentity(custId, "google", sub), false, "and mirrored-removed on the linked fan");
});

test("ongoing detach: a missing identity id reports not-found (404 parity) and touches nothing", async () => {
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const ok = await unlinkIdentityEverywhere("admin", adminId, randomUUID());
  assert.equal(ok, false);
});

test("link: sets the link only when null — an already-linked admin is never re-pointed", async () => {
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53) });
  const firstFan = await seedCustomer({ password: null });
  const secondFan = await seedCustomer({ password: null });

  await linkAdminToCustomer(adminId, firstFan);
  assert.equal(await adminLink(adminId), firstFan, "first link should stick");

  // A second link attempt with a DIFFERENT fan must be a no-op on the
  // link column — re-pointing would silently steal the admin from the
  // human it already belongs to.
  await linkAdminToCustomer(adminId, secondFan);
  assert.equal(
    await adminLink(adminId),
    firstFan,
    "an already-linked admin must keep its original fan (link is set-once)",
  );
});

test("writeLinkedPassword: given the admin id, writes BOTH linked rows", async () => {
  const adminId = await seedAdmin({ password: "old-admin" });
  const custId = await seedCustomer({ password: "old-fan" });
  await linkAdminToCustomer(adminId, custId);

  const next = "converged-" + randomUUID().slice(0, 8);
  await writeLinkedPassword({ adminUserId: adminId, hashed: next });

  assert.equal(await adminPassword(adminId), next, "admin row updated");
  assert.equal(await custPassword(custId), next, "linked fan row updated via the link");
});

test("writeLinkedPassword: given the customer id, writes BOTH linked rows", async () => {
  const adminId = await seedAdmin({ password: "old-admin" });
  const custId = await seedCustomer({ password: "old-fan" });
  await linkAdminToCustomer(adminId, custId);

  const next = "converged-" + randomUUID().slice(0, 8);
  await writeLinkedPassword({ customerId: custId, hashed: next });

  assert.equal(await custPassword(custId), next, "fan row updated");
  assert.equal(await adminPassword(adminId), next, "linked admin row updated via the link");
});

test("writeLinkedPassword: with no link, only the row you passed is written (missing side no-ops)", async () => {
  const adminId = await seedAdmin({ password: "old-admin" });
  const unlinkedFan = await seedCustomer({ password: "fan-untouched" });

  const next = "admin-only-" + randomUUID().slice(0, 8);
  await writeLinkedPassword({ adminUserId: adminId, hashed: next });

  assert.equal(await adminPassword(adminId), next, "the passed admin row is written");
  assert.equal(await adminLink(adminId), null, "no link exists");
  assert.equal(
    await custPassword(unlinkedFan),
    "fan-untouched",
    "an unrelated fan with no link is never touched",
  );
});

test("login no-lockout: a linked admin signs in with EITHER its own password OR the fan password", async () => {
  const adminId = await seedAdmin({ password: "admin-secret" });
  const custId = await seedCustomer({ password: "fan-secret" });
  await linkAdminToCustomer(adminId, custId);
  const user = { password: "admin-secret", customerUserId: custId };

  assert.equal(await adminLoginPasswordOk(user, "admin-secret", eqCompare), true, "own password works");
  assert.equal(
    await adminLoginPasswordOk(user, "fan-secret", eqCompare),
    true,
    "the linked fan's canonical password is accepted too (no lockout)",
  );
  assert.equal(await adminLoginPasswordOk(user, "neither", eqCompare), false, "a wrong password is rejected");
});

test("login no-lockout: an UNLINKED admin only accepts its own password (no phantom fallback)", async () => {
  const user = { password: "admin-secret", customerUserId: null };
  assert.equal(await adminLoginPasswordOk(user, "admin-secret", eqCompare), true);
  assert.equal(
    await adminLoginPasswordOk(user, "fan-secret", eqCompare),
    false,
    "with no link there is no fan password to fall back to",
  );
});

test("isLinkableEmail: relay + @oauth.local placeholders are excluded from email-based linking", () => {
  // Real, operator-/provider-verified addresses ARE linkable.
  assert.equal(isLinkableEmail("real.person@example.com"), true);
  assert.equal(isLinkableEmail("MixedCase@Example.COM"), true, "case-insensitive");
  // Apple "Hide my email" relay masks are not proof of a shared human.
  assert.equal(isLinkableEmail("abc123@privaterelay.appleid.com"), false);
  assert.equal(isLinkableEmail("ABC@PrivateRelay.AppleID.com"), false, "relay match is case-insensitive");
  // Synthetic OAuth-no-email placeholders are not real addresses.
  assert.equal(isLinkableEmail("somehandle@oauth.local"), false);
  // Empty / missing never links.
  assert.equal(isLinkableEmail(null), false);
  assert.equal(isLinkableEmail(undefined), false);
  assert.equal(isLinkableEmail("   "), false);
});

after(async () => {
  for (const id of created.users) {
    await exec(sql`DELETE FROM admin_identities WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.customers) {
    await exec(sql`DELETE FROM customer_identities WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
  }
  await pool.end();
});
