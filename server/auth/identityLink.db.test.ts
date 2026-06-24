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
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "../db";
import { storage } from "../storage";
import { authKindMiddleware } from "./host";
import { registerRoutes, __setTestOauthExchange } from "../routes";
import {
  linkAdminToCustomer,
  mirrorAdminIdentitiesToCustomer,
  mirrorIdentityToLinked,
  unlinkIdentityEverywhere,
  writeLinkedPassword,
  adminLoginPasswordOk,
  isLinkableEmail,
  isProviderVerifiedEmailForLink,
  isUnclaimedCustomer,
} from "./identityLink";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  users: new Set<string>(),
  customers: new Set<string>(),
  invites: new Set<string>(),
};

// ─── In-process HTTP harness ────────────────────────────────────────────
// The register no-link rule is a ROUTE-level invariant (the absence of any
// link call in the customer branch of /api/register), so a faithful guard
// must drive the real Express handler, not a re-implementation of it. We
// mount the full route tree exactly as server/index.ts does — authKind
// middleware + JSON body parser + registerRoutes — and exercise it over a
// real loopback socket. A future refactor that re-introduces an auto-link
// inside /api/register would then fail this test instead of slipping past.
let baseUrl = "";
let httpServer: HttpServer | undefined;

// The invite-accept test below drives the REAL route, which mints the new
// admin via storage.createUser. That helper grants every new signup the seed
// albums by doing `db.select().from(albums)` — i.e. a SELECT of every column
// the Drizzle schema declares. Isolated/throwaway DB clones lag behind
// shared/schema.ts, so the newest nullable album columns can be missing and
// that full-row SELECT 500s (the rest of the file never calls createUser, so
// it slips past). Bring the columns this path needs up to the schema before
// the route runs — idempotent, so it's a no-op on an already-migrated DB.
async function ensureAlbumColumnsForCreateUser() {
  await exec(sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS original_release_date text`);
  await exec(sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS copyright_line text`);
}

before(async () => {
  await ensureAlbumColumnsForCreateUser();
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam to put a verified Apple identity on the session exactly
  // the way handleProviderCallback's Hide-My-Email branch does, WITHOUT
  // standing up the full OAuth state + token-exchange dance (those hit
  // external providers and can't be stubbed without DI). Mounted AFTER
  // registerRoutes so the real express-session middleware (installed inside
  // registerRoutes) is already in scope — req.session is therefore the same
  // store the /api/auth/claim/* routes read from. registerRoutes adds no
  // catch-all, so this route resolves normally.
  app.post("/__test/seed-claim", (req, res) => {
    (req.session as any).pendingOauthClaim = req.body?.pending ?? undefined;
    req.session.save(() => res.json({ ok: true }));
  });
  // Companion seam for the OAuth-callback tests: park the `oauthState` bag the
  // callback validates against, the same way buildGoogleAuthUrl would. Paired
  // with __setTestOauthExchange (below) this lets a test drive the real
  // handleProviderCallback offline.
  app.post("/__test/seed-oauth-state", (req, res) => {
    (req.session as any).oauthState = req.body?.state ?? undefined;
    req.session.save(() => res.json({ ok: true }));
  });
  // The OAuth callback's token exchange is stubbed to return whatever the
  // current test parked in `nextOauthIdentity`. Cleared in the after hook.
  __setTestOauthExchange(async () => {
    if (!nextOauthIdentity) throw new Error("test exchange called without a parked identity");
    return nextOauthIdentity;
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  // 127.0.0.1 is an unknown host → authKindMiddleware falls back to the
  // path-based rule, so /api/register resolves as the CUSTOMER shell
  // (exactly the self-serve fan path this test is about).
  baseUrl = `http://127.0.0.1:${port}`;
});

async function postJson(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function seedCustomer(opts: { password?: string | null; email?: string } = {}): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  const email = opts.email ?? "fan_" + tag + "@example.test";
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name, password)
    VALUES (${id}, ${"fan_" + tag}, ${email}, ${"Fan " + tag}, ${opts.password ?? null})
  `);
  created.customers.add(id);
  return id;
}

// Email-verification rows are keyed by email (not by a tracked customer id),
// so claim tests register the addresses they mint codes for and tear them
// down explicitly in the after hook.
const claimEmails = new Set<string>();

// The identity the stubbed OAuth token exchange returns for the NEXT callback
// the test drives. Set per-test right before hitting /api/auth/<p>/callback.
let nextOauthIdentity:
  | { sub: string; email: string | null; emailVerified: boolean; picture?: string | null; name?: string | null }
  | null = null;

// A cookie-jar POST helper for the multi-request claim flow. The session
// cookie is `secure: true` + `sameSite: none`, so we send
// `x-forwarded-proto: https` (with `trust proxy` already on the harness app)
// or express-session refuses to set it; we then echo `connect.sid` back on
// every follow-up so `pendingOauthClaim` survives across requests.
function makeSessionClient() {
  let cookie = "";
  async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const setCookies = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies as string[]) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) cookie = first;
    }
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
  // The OAuth callback responds with a 30x redirect (never JSON), so this
  // GET captures the status + Location WITHOUT following it.
  async function getNoFollow(path: string): Promise<{ status: number; location: string | null }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "x-forwarded-proto": "https",
        ...(cookie ? { cookie } : {}),
      },
    });
    const setCookies = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies as string[]) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) cookie = first;
    }
    return { status: res.status, location: res.headers.get("location") };
  }
  return { post, getNoFollow };
}

async function seedAdmin(opts: { password: string; email?: string }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  const email = opts.email ?? "adm_" + tag + "@example.test";
  await exec(sql`
    INSERT INTO users (id, username, email, display_name, password, is_admin)
    VALUES (${id}, ${"adm_" + tag}, ${email}, ${"Adm " + tag}, ${opts.password}, true)
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

// ─── Route-boundary: the self-serve register no-link invariant ──────────
//
// Task #1037 deliberately does NOT auto-link a brand-new self-serve fan
// signup to an existing admin that happens to share the same email. The
// reason is security: /api/register only proves control of a chosen
// password, NOT ownership of the email address. Because admin login now
// accepts the linked fan password as a valid first factor, auto-linking
// here would let anyone register a fan with a known admin's email and
// thereby seed an admin first-factor for an email they don't own. The
// invariant is enforced by the ABSENCE of any link call in the customer
// branch of /api/register — only a code comment guarded it until now.
//
// This hits the REAL /api/register route over the loopback socket (so a
// route refactor that re-adds an auto-link can't slip past) and asserts the
// same-email admin's `customer_user_id` stays NULL: registration created no
// link, and therefore could not seed an admin first-factor.
test("register route: a self-serve fan with the SAME email as an existing admin is NOT linked", async () => {
  const sharedEmail = "shared_" + randomUUID().slice(0, 8) + "@example.test";
  const adminId = await seedAdmin({ password: "$2b$10$" + "x".repeat(53), email: sharedEmail });

  const res = await postJson("/api/register", {
    username: "reg_" + randomUUID().slice(0, 8),
    email: sharedEmail,
    displayName: "Reg Fan",
    password: "fan-password-123",
  });
  assert.equal(res.status, 201, "self-serve fan registration should succeed");
  if (res.json?.id) created.customers.add(res.json.id);

  // Sanity: the fan row really was created on the customer side with the
  // shared email (so this isn't a vacuous pass on a no-op request).
  const fan = await storage.getCustomerByEmail(sharedEmail);
  assert.ok(fan, "the register route must have created a customer row for the shared email");

  assert.equal(
    await adminLink(adminId),
    null,
    "self-serve register must NEVER link a same-email admin — unverified email can't seed an admin first-factor",
  );
});

// ─── Positive control: the trusted invite-accept route DOES link ────────
//
// The other side of the boundary, also driven through the REAL route: an
// operator-issued invite is a trusted path (the operator typed the real
// address), so accepting it links the freshly-minted admin to a same-email
// fan. This documents that the no-link rule above is specific to the
// UNTRUSTED self-serve path, not a blanket "never link" rule — and that a
// refactor dropping the trusted-path link would also be caught.
test("invite-accept route: a same-email fan IS linked to the new admin (trusted path)", async () => {
  const sharedEmail = "invite_" + randomUUID().slice(0, 8) + "@example.test";
  // NOTE: no admin pre-exists for this email — the accept route mints a new
  // admin row, then links it to the same-email fan. (A pre-existing admin
  // would take the separate "existingAccount" branch instead.)
  const custId = await seedCustomer({ password: "$2b$10$" + "y".repeat(53) });
  await exec(sql`UPDATE customer_users SET email = ${sharedEmail} WHERE id = ${custId}`);

  // Mint a trusted operator invite for an admin-role hat (no scope needed).
  const creatorId = await seedAdmin({ password: "$2b$10$" + "c".repeat(53) });
  const token = "invtok-" + randomUUID().replace(/-/g, "");
  const invite = await storage.createAdminInvite({
    email: sharedEmail,
    role: "admin",
    roleScopeId: null,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdByUserId: creatorId,
  } as any);
  created.invites.add(invite.id);

  const res = await postJson(`/api/invites/${encodeURIComponent(token)}/accept`, {
    username: "inv_" + randomUUID().slice(0, 8),
    displayName: "Invited Admin",
    password: "invite-password-123",
  });
  assert.equal(res.status, 200, "accepting a valid invite should succeed");
  const newAdminId = res.json?.id as string | undefined;
  assert.ok(newAdminId, "the accept route should return the new admin id");
  created.users.add(newAdminId!);

  assert.equal(
    await adminLink(newAdminId!),
    custId,
    "invite-accept (trusted) DOES link the new admin to the same-email fan",
  );
});

// ─── isUnclaimedCustomer: the takeover-guard gate (true/false matrix) ────
//
// This single predicate decides whether a verified social login may
// auto-attach to an existing same-email account. It must return true ONLY
// for an account with nothing to hijack: no real password AND no attached
// OAuth identity AND not a merged row. Each branch below is a way the guard
// could silently weaken into letting a code-to-email seize a credentialed
// account.
test("isUnclaimedCustomer: no password + no identity + not merged ⇒ unclaimed (true)", async () => {
  const custId = await seedCustomer({ password: null });
  assert.equal(await isUnclaimedCustomer(custId), true);
});

test("isUnclaimedCustomer: an `!oauth-only:` placeholder password is NOT a real credential ⇒ true", async () => {
  // The placeholder is what an OAuth-only signup stores; it isn't a hash and
  // can't be used to sign in with a password, so the row is still claimable.
  const custId = await seedCustomer({ password: "!oauth-only:" + randomUUID().replace(/-/g, "") });
  assert.equal(await isUnclaimedCustomer(custId), true);
});

test("isUnclaimedCustomer: a real hashed password ⇒ claimed (false)", async () => {
  const custId = await seedCustomer({ password: "$2b$10$" + "p".repeat(53) });
  assert.equal(
    await isUnclaimedCustomer(custId),
    false,
    "a real password is a credential — the takeover guard must hold",
  );
});

test("isUnclaimedCustomer: ≥1 attached OAuth identity ⇒ claimed (false), even with no password", async () => {
  const custId = await seedCustomer({ password: null });
  await addCustomerIdentity(custId, "google", "claimed-" + randomUUID().slice(0, 8));
  assert.equal(
    await isUnclaimedCustomer(custId),
    false,
    "an existing social login is a credential — never let a new provider bolt on",
  );
});

test("isUnclaimedCustomer: a merged row is never a valid target ⇒ false", async () => {
  const survivor = await seedCustomer({ password: null });
  const merged = await seedCustomer({ password: null });
  await exec(sql`UPDATE customer_users SET merged_into_id = ${survivor} WHERE id = ${merged}`);
  assert.equal(
    await isUnclaimedCustomer(merged),
    false,
    "a row already merged into another account is off-limits regardless of credential state",
  );
});

test("isUnclaimedCustomer: an unknown customer id ⇒ false (no row to claim)", async () => {
  assert.equal(await isUnclaimedCustomer(randomUUID()), false);
});

// ─── isProviderVerifiedEmailForLink: the verified-email half of the gate ─
//
// The email-collision auto-link requires BOTH halves to be true:
// isUnclaimedCustomer (above) AND a provider-verified, non-relay, customer-
// shell email (here). This matrix pins the second half so a refactor can't
// quietly start auto-linking on an unverified or relay address.
test("isProviderVerifiedEmailForLink: customer + real verified email ⇒ true", () => {
  assert.equal(
    isProviderVerifiedEmailForLink({ kind: "customer", email: "real@example.com", emailVerified: true }),
    true,
  );
});

test("isProviderVerifiedEmailForLink: an UNVERIFIED email never links", () => {
  assert.equal(
    isProviderVerifiedEmailForLink({ kind: "customer", email: "real@example.com", emailVerified: false }),
    false,
    "the provider must assert the address is verified",
  );
});

test("isProviderVerifiedEmailForLink: an Apple relay mask never links (even if 'verified')", () => {
  assert.equal(
    isProviderVerifiedEmailForLink({
      kind: "customer",
      email: "abc123@privaterelay.appleid.com",
      emailVerified: true,
    }),
    false,
    "a relay address is not a verifiable real address",
  );
  assert.equal(
    isProviderVerifiedEmailForLink({
      kind: "customer",
      email: "ABC@PrivateRelay.AppleID.com",
      emailVerified: true,
    }),
    false,
    "relay match is case-insensitive",
  );
});

test("isProviderVerifiedEmailForLink: the admin shell never email-auto-links", () => {
  assert.equal(
    isProviderVerifiedEmailForLink({ kind: "admin", email: "real@example.com", emailVerified: true }),
    false,
    "admin OAuth sign-up is invite-only — email collisions must not auto-link",
  );
});

test("isProviderVerifiedEmailForLink: a missing email never links", () => {
  assert.equal(isProviderVerifiedEmailForLink({ kind: "customer", email: null, emailVerified: true }), false);
  assert.equal(isProviderVerifiedEmailForLink({ kind: "customer", email: undefined, emailVerified: true }), false);
});

// ─── Route-boundary: POST /api/auth/claim/confirm (the takeover guard) ───
//
// This is the most security-sensitive endpoint of the Hide-My-Email claim
// flow: it attaches a parked Apple identity to an existing account after the
// fan proves control of the email with a 6-digit code. The guard is that a
// verified code to an email is NOT permission to bolt a new login onto an
// account that ALREADY has a credential. These tests drive the real
// start→confirm pipeline over the loopback socket (real session, real
// email-verification rows, real takeover guard).
//
// We seed the parked identity via a tiny test-only /__test/seed-claim route
// (it sets req.session.pendingOauthClaim exactly like the OAuth callback);
// the rest is the genuine route code path.

test("claim/confirm: a credentialed account is REFUSED with 409 hasCredential (takeover guard holds)", async () => {
  const email = "claim_cred_" + randomUUID().slice(0, 8) + "@example.test";
  claimEmails.add(email);
  const sub = "appleclaim-" + randomUUID().slice(0, 8);
  // The account on this email has a REAL password — it is claimed.
  await seedCustomer({ password: "$2b$10$" + "p".repeat(53), email });

  const client = makeSessionClient();
  const seeded = await client.post("/__test/seed-claim", {
    pending: { provider: "apple", sub, email, emailVerified: true, name: null, picture: null },
  });
  assert.equal(seeded.status, 200, "seeding the parked claim should succeed");

  const start = await client.post("/api/auth/claim/start", { email });
  assert.equal(start.status, 200, "claim/start should mail a code");
  const code = start.json?.devCode as string | undefined;
  assert.ok(code, "non-prod claim/start returns the dev code");

  const confirm = await client.post("/api/auth/claim/confirm", { email, code });
  assert.equal(confirm.status, 409, "a credentialed account must be refused");
  assert.equal(confirm.json?.hasCredential, true, "the refusal flags the existing credential");
});

test("claim/confirm: an unknown email returns 404 noAccount (nothing to claim)", async () => {
  // No customer row uses this email — verifying a code can't conjure one.
  const email = "claim_none_" + randomUUID().slice(0, 8) + "@example.test";
  claimEmails.add(email);
  const sub = "applenone-" + randomUUID().slice(0, 8);

  const client = makeSessionClient();
  await client.post("/__test/seed-claim", {
    pending: { provider: "apple", sub, email, emailVerified: true, name: null, picture: null },
  });
  const start = await client.post("/api/auth/claim/start", { email });
  const code = start.json?.devCode as string | undefined;
  assert.ok(code, "dev code returned");

  const confirm = await client.post("/api/auth/claim/confirm", { email, code });
  assert.equal(confirm.status, 404, "no account on that email");
  assert.equal(confirm.json?.noAccount, true);
});

test("claim/confirm: an UNCLAIMED account succeeds — the Apple identity is attached and a token is issued", async () => {
  const email = "claim_ok_" + randomUUID().slice(0, 8) + "@example.test";
  claimEmails.add(email);
  const sub = "appleok-" + randomUUID().slice(0, 8);
  // Unclaimed: no password, no identity.
  const custId = await seedCustomer({ password: null, email });

  const client = makeSessionClient();
  await client.post("/__test/seed-claim", {
    pending: { provider: "apple", sub, email, emailVerified: true, name: null, picture: null },
  });
  const start = await client.post("/api/auth/claim/start", { email });
  const code = start.json?.devCode as string | undefined;
  assert.ok(code, "dev code returned");

  const confirm = await client.post("/api/auth/claim/confirm", { email, code });
  assert.equal(confirm.status, 200, "an unclaimed account is claimable");
  assert.equal(confirm.json?.ok, true);
  assert.ok(confirm.json?.token, "a fresh auth token is issued for the now-claimed account");
  assert.equal(confirm.json?.landing, "/account", "the fan lands in the player");

  assert.equal(
    await customerHasIdentity(custId, "apple", sub),
    true,
    "the parked Apple identity is attached to the previously-unclaimed account",
  );

  // The parked claim must be cleared off the session once consumed, so a
  // replay can't re-run the attach. Re-hitting confirm on the same session
  // now sees no pending claim and returns the 400 "nothing to claim".
  const replay = await client.post("/api/auth/claim/confirm", { email, code });
  assert.equal(replay.status, 400, "the pending claim is cleared after a successful confirm");
});

test("claim/confirm: a wrong code never claims (400, identity stays unattached)", async () => {
  const email = "claim_bad_" + randomUUID().slice(0, 8) + "@example.test";
  claimEmails.add(email);
  const sub = "applebad-" + randomUUID().slice(0, 8);
  const custId = await seedCustomer({ password: null, email });

  const client = makeSessionClient();
  await client.post("/__test/seed-claim", {
    pending: { provider: "apple", sub, email, emailVerified: true, name: null, picture: null },
  });
  await client.post("/api/auth/claim/start", { email });

  const confirm = await client.post("/api/auth/claim/confirm", { email, code: "000000" });
  assert.equal(confirm.status, 400, "an unmatched code is rejected before the account is touched");
  assert.equal(
    await customerHasIdentity(custId, "apple", sub),
    false,
    "no identity is attached when the code doesn't verify",
  );
});

test("claim/confirm: with no parked claim on the session ⇒ 400 (nothing to claim)", async () => {
  // No /__test/seed-claim call, so req.session.pendingOauthClaim is unset.
  const client = makeSessionClient();
  const confirm = await client.post("/api/auth/claim/confirm", {
    email: "whoever_" + randomUUID().slice(0, 8) + "@example.test",
    code: "123456",
  });
  assert.equal(confirm.status, 400, "the claim flow must be entered from the OAuth callback");
});

// ─── Route-boundary: handleProviderCallback email-collision auto-link ─────
//
// This is the OTHER entry point to the same takeover guard — the live Google
// (non-relay) sign-in where the provider's verified email already belongs to
// an account. The route auto-links ONLY when BOTH halves hold:
//   isUnclaimedCustomer(existing) === true  AND  providerVerifiedEmail.
// We drive the REAL callback offline via two seams: /__test/seed-oauth-state
// parks the state bag the callback validates, and __setTestOauthExchange
// (installed in the before hook) returns the canned identity instead of
// hitting Google. The three cases below pin the conjunction: flipping either
// half off must fall back to the ?prompt=link guard, not auto-link.

// Drive a Google callback for a collision against `email`, returning the
// resulting redirect. A fresh client => fresh session each call.
async function driveGoogleCollision(opts: {
  email: string;
  emailVerified: boolean;
  sub: string;
}): Promise<{ status: number; location: string | null }> {
  const client = makeSessionClient();
  const state = "st_" + opts.sub;
  await client.post("/__test/seed-oauth-state", {
    state: { state, kind: "customer", provider: "google" },
  });
  nextOauthIdentity = {
    sub: opts.sub,
    email: opts.email,
    emailVerified: opts.emailVerified,
    name: null,
    picture: null,
  };
  try {
    return await client.getNoFollow(
      `/api/auth/google/callback?state=${encodeURIComponent(state)}&code=testcode`,
    );
  } finally {
    nextOauthIdentity = null;
  }
}

test("callback collision: UNCLAIMED account + VERIFIED email ⇒ auto-links and signs in (both halves true)", async () => {
  const email = "collide_ok_" + randomUUID().slice(0, 8) + "@example.test";
  const sub = "gsubok-" + randomUUID().slice(0, 8);
  const custId = await seedCustomer({ password: null, email });

  const r = await driveGoogleCollision({ email, emailVerified: true, sub });
  assert.equal(r.status, 302);
  assert.ok(
    (r.location ?? "").startsWith("/account#token="),
    `expected a signed-in redirect into the player, got ${r.location}`,
  );
  assert.equal(
    await customerHasIdentity(custId, "google", sub),
    true,
    "the Google identity is attached to the previously-unclaimed account",
  );
});

test("callback collision: CLAIMED account (has password) + VERIFIED email ⇒ NO auto-link, diverts to ?prompt=link", async () => {
  const email = "collide_claimed_" + randomUUID().slice(0, 8) + "@example.test";
  const sub = "gsubclaimed-" + randomUUID().slice(0, 8);
  const custId = await seedCustomer({ password: "$2b$10$" + "p".repeat(53), email });

  const r = await driveGoogleCollision({ email, emailVerified: true, sub });
  assert.equal(r.status, 302);
  assert.ok(
    (r.location ?? "").startsWith("/login?prompt=link"),
    `verified email is not enough when the account is claimed — expected the takeover guard, got ${r.location}`,
  );
  assert.equal(
    await customerHasIdentity(custId, "google", sub),
    false,
    "a credentialed account must NOT have a new identity bolted on",
  );
});

test("callback collision: UNCLAIMED account + UNVERIFIED email ⇒ NO auto-link, diverts to ?prompt=link", async () => {
  // The mirror of the case above: unclaimed alone is not enough — the
  // provider must also assert the email is verified, or the guard holds.
  const email = "collide_unverified_" + randomUUID().slice(0, 8) + "@example.test";
  const sub = "gsubunver-" + randomUUID().slice(0, 8);
  const custId = await seedCustomer({ password: null, email });

  const r = await driveGoogleCollision({ email, emailVerified: false, sub });
  assert.equal(r.status, 302);
  assert.ok(
    (r.location ?? "").startsWith("/login?prompt=link"),
    `unverified email must fall back to the guard even on an unclaimed account, got ${r.location}`,
  );
  assert.equal(
    await customerHasIdentity(custId, "google", sub),
    false,
    "an unverified provider email must NOT auto-link, even with nothing to hijack",
  );
});

test("callback collision: account that ALREADY has a social login + VERIFIED email ⇒ NO second login bolted on, diverts to ?prompt=link", async () => {
  // The headline case for this task: an account that already has ONE social
  // login (no password — but an attached OAuth identity is itself a
  // credential) must never have a SECOND, different social login silently
  // bolted on just because the new provider asserts a matching verified
  // email. isUnclaimedCustomer() returns false the moment any identity is
  // attached, so the conjunction fails and the callback falls back to the
  // ?prompt=link takeover guard instead of auto-linking.
  const email = "collide_hasoauth_" + randomUUID().slice(0, 8) + "@example.test";
  const existingSub = "gsub-existing-" + randomUUID().slice(0, 8);
  const newSub = "gsub-new-" + randomUUID().slice(0, 8);
  const custId = await seedCustomer({ password: null, email });
  // Pre-attach an existing social login (its own provider sub) — this is the
  // "account that already has one".
  await addCustomerIdentity(custId, "google", existingSub);

  const r = await driveGoogleCollision({ email, emailVerified: true, sub: newSub });
  assert.equal(r.status, 302);
  assert.ok(
    (r.location ?? "").startsWith("/login?prompt=link"),
    `an account with an existing social login is claimed — a verified email is not permission to bolt a new one on, got ${r.location}`,
  );
  assert.equal(
    await customerHasIdentity(custId, "google", newSub),
    false,
    "the NEW provider sub must NOT be attached to an account that already has a social login",
  );
  assert.equal(
    await customerHasIdentity(custId, "google", existingSub),
    true,
    "the account's original social login is left untouched",
  );
});

after(async () => {
  __setTestOauthExchange(null);
  if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  for (const email of claimEmails) {
    await exec(sql`DELETE FROM email_verifications WHERE email = ${email}`);
  }
  for (const id of created.invites) {
    await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
  }
  // auth_tokens rows cascade off the admin/customer FKs (onDelete: cascade),
  // so deleting the owning rows below clears any minted tokens too.
  for (const id of created.users) {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM admin_identities WHERE user_id = ${id}`);
    await exec(sql`UPDATE users SET customer_user_id = NULL WHERE id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.customers) {
    await exec(sql`DELETE FROM customer_identities WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
  }
  await pool.end();
});
