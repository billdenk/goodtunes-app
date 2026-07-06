// Task #2568 — regression coverage for the super-admin-only "back-fill a
// referral" escape hatch: POST /api/admin/partners/:kind/:id/backfill-referral.
// This route records an already-happened referral relationship (artist→
// artist or NPO→artist) without sending any invite/transactional email, and
// mints a copyable welcome-back sign-in link for the referred artist.
//
// Covers:
//   - non-super-admin is 403'd (requireRole("super_admin") gate)
//   - a fresh referred artist gets the referrer stamped + an
//     artist_referrals row opened (artist referrer only) + a redeemable
//     sign-in link, and a customer + admin(artist) account are provisioned
//   - re-running against the SAME referrer is idempotent (still 200, still
//     mints a link, alreadyAttributed:true)
//   - re-attributing an already-attributed artist to a DIFFERENT referrer
//     is rejected with 409 (not a silent no-op success)
//   - the operator-supplied effective date back-dates the artist_referrals
//     anchor used for the one-year referral-payout window
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/backfillReferral.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);

const created = {
  people: new Set<string>(),
  orgs: new Set<string>(),
  users: new Set<string>(),
  customerUsers: new Set<string>(),
  emails: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let superAdminId = "";
let plainAdminId = "";
let referrerArtistId = "";
let anotherReferrerArtistId = "";
let referrerNpoId = "";

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam: park a verified admin session the way a finished 2FA
  // login would. Mounted AFTER registerRoutes so the real express-session
  // middleware (installed inside registerRoutes) is already in scope.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  superAdminId = await seedAdminUser("super_admin", null);
  plainAdminId = await seedAdminUser("label", randomUUID());
  referrerArtistId = await seedPerson("t2568 Referrer Artist");
  anotherReferrerArtistId = await seedPerson("t2568 Another Referrer");
  referrerNpoId = await seedNpo("t2568 Referrer NPO");
});

async function seedNpo(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO organizations (id, name, kind) VALUES (${id}, ${name}, 'non_profit')`);
  created.orgs.add(id);
  return id;
}

async function seedPerson(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name, roles) VALUES (${id}, ${name}, ARRAY['artist']::text[])`);
  created.people.add(id);
  return id;
}

async function seedAdminUser(role: string, roleScopeId: string | null): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2568_" + tag}, ${"x"}, ${"t2568"}, ${"t2568_" + tag + "@example.test"},
            true, ${role}, ${roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function makeSessionClient(userId: string) {
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
    captureCookie(res);
    return { status: res.status, json: await safeJson(res) };
  }
  function captureCookie(res: Response) {
    const setCookies = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies as string[]) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) cookie = first;
    }
  }
  const login = await post("/__test/login", { userId });
  assert.equal(login.status, 200, "test login seam established a session");
  return { post };
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function freshEmail(tag: string): string {
  const email = `t2568_${tag}_${randomUUID().slice(0, 8)}@example.test`;
  created.emails.add(email);
  return email;
}

test("SESSION: a non-super-admin is 403'd on backfill-referral", async () => {
  const client = await makeSessionClient(plainAdminId);
  const res = await client.post(`/api/admin/partners/artist/${referrerArtistId}/backfill-referral`, {
    referredPersonId: referrerArtistId,
    email: freshEmail("nope"),
    effectiveDate: "2026-01-01",
  });
  assert.equal(res.status, 403, "only super_admin may back-fill a referral");
});

test("SESSION: super_admin back-fills a fresh referral, stamps + mints a link + opens the earning window", async () => {
  const referred = await seedPerson("t2568 Fresh Referred Artist");
  const email = freshEmail("fresh");
  const client = await makeSessionClient(superAdminId);

  const res = await client.post(`/api/admin/partners/artist/${referrerArtistId}/backfill-referral`, {
    referredPersonId: referred,
    email,
    effectiveDate: "2026-01-15",
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.alreadyAttributed, false);
  assert.equal(res.json.createdAccount, true, "no prior account existed for this email");
  assert.ok(typeof res.json.signInUrl === "string" && res.json.signInUrl.length > 0, "a sign-in link is minted");

  const personRow = await exec(sql`SELECT referred_by_person_id FROM people WHERE id = ${referred}`);
  assert.equal((personRow as any).rows[0].referred_by_person_id, referrerArtistId, "the referrer is stamped on the referred person");

  const referralRow = await exec(sql`
    SELECT created_at FROM artist_referrals
    WHERE referrer_person_id = ${referrerArtistId} AND invitee_person_id = ${referred} AND album_id IS NULL
  `);
  assert.equal((referralRow as any).rows.length, 1, "an artist_referrals row is opened");
  const createdAt = new Date((referralRow as any).rows[0].created_at as string);
  assert.equal(createdAt.toISOString().slice(0, 10), "2026-01-15", "the operator's effective date anchors the referral window");

  const newAdmin = await exec(sql`SELECT role, role_scope_id FROM users WHERE email = ${email}`);
  assert.equal((newAdmin as any).rows[0].role, "artist");
  assert.equal((newAdmin as any).rows[0].role_scope_id, referred);

  const cust = await exec(sql`SELECT id FROM customer_users WHERE email = ${email}`);
  assert.equal((cust as any).rows.length, 1, "a fan/customer row is provisioned for the login link");
  created.customerUsers.add((cust as any).rows[0].id);
});

test("SESSION: re-running against the SAME referrer is idempotent, not a duplicate/error", async () => {
  const referred = await seedPerson("t2568 Idempotent Referred Artist");
  const email = freshEmail("idem");
  const client = await makeSessionClient(superAdminId);

  const first = await client.post(`/api/admin/partners/artist/${referrerArtistId}/backfill-referral`, {
    referredPersonId: referred,
    email,
    effectiveDate: "2026-02-01",
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.alreadyAttributed, false);

  const second = await client.post(`/api/admin/partners/artist/${referrerArtistId}/backfill-referral`, {
    referredPersonId: referred,
    email,
    effectiveDate: "2026-02-01",
  });
  assert.equal(second.status, 200, JSON.stringify(second.json));
  assert.equal(second.json.alreadyAttributed, true, "re-running against the same referrer reads as idempotent, not an error");
  assert.ok(second.json.signInUrl, "a link is still minted on the idempotent path");
});

test("SESSION: re-attributing to a DIFFERENT referrer is a 409 conflict, never a silent no-op", async () => {
  const referred = await seedPerson("t2568 Conflict Referred Artist");
  const email = freshEmail("conflict");
  const client = await makeSessionClient(superAdminId);

  const first = await client.post(`/api/admin/partners/artist/${referrerArtistId}/backfill-referral`, {
    referredPersonId: referred,
    email,
    effectiveDate: "2026-03-01",
  });
  assert.equal(first.status, 200);

  const second = await client.post(`/api/admin/partners/artist/${anotherReferrerArtistId}/backfill-referral`, {
    referredPersonId: referred,
    email: freshEmail("conflict2"),
    effectiveDate: "2026-03-02",
  });
  assert.equal(second.status, 409, "re-attributing to a different referrer must surface a conflict");
  assert.match(second.json.message, /already attributed/i);

  const personRow = await exec(sql`SELECT referred_by_person_id FROM people WHERE id = ${referred}`);
  assert.equal(
    (personRow as any).rows[0].referred_by_person_id,
    referrerArtistId,
    "the original attribution is untouched by the rejected re-attribution attempt",
  );
});

test("SESSION: NPO referrer can back-fill an artist referral (org-side stamp, no earning-window row)", async () => {
  const referred = await seedPerson("t2568 NPO-Referred Artist");
  const email = freshEmail("npo");
  const client = await makeSessionClient(superAdminId);

  const res = await client.post(`/api/admin/partners/non_profit/${referrerNpoId}/backfill-referral`, {
    referredPersonId: referred,
    email,
    effectiveDate: "2026-04-01",
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.alreadyAttributed, false);
  assert.ok(res.json.signInUrl);

  const personRow = await exec(sql`SELECT referred_by_org_id FROM people WHERE id = ${referred}`);
  assert.equal((personRow as any).rows[0].referred_by_org_id, referrerNpoId, "the NPO is stamped as the referrer");

  const referralRow = await exec(sql`SELECT id FROM artist_referrals WHERE invitee_person_id = ${referred}`);
  assert.equal((referralRow as any).rows.length, 0, "NPO referrals don't open an artist_referrals earning-window row");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const email of created.emails) {
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id IN (SELECT id FROM users WHERE email = ${email}) OR customer_user_id IN (SELECT id FROM customer_users WHERE email = ${email})`);
      await exec(sql`DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email = ${email})`);
      await exec(sql`DELETE FROM users WHERE email = ${email}`);
      await exec(sql`DELETE FROM customer_users WHERE email = ${email}`);
    }
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.people) {
      await exec(sql`DELETE FROM artist_referrals WHERE referrer_person_id = ${id} OR invitee_person_id = ${id}`);
    }
    for (const id of created.people) {
      await exec(sql`DELETE FROM people WHERE id = ${id}`);
    }
    for (const id of created.orgs) {
      await exec(sql`DELETE FROM organizations WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
