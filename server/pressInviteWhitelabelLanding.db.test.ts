// Task #3331 — press-invited artists must land in the white-label client
// portal, not GoodTunes chrome. An artist invite homed to a press
// (admin_invites.default_press_id) and accepted ON that press's white-label
// host must return landingPath "/dashboard" (the MRP client portal) when the
// press's portal skin is active (email_branding set), and the invite read
// must carry the sanitized press brand. Control cases lock in that:
//   • the same invite accepted on a plain GoodTunes host keeps today's
//     "/artist" landing, and
//   • a press WITHOUT the portal skin keeps today's landing even on its
//     own white-label host (graceful branded fallback, no redirect loop).
//
//   npx tsx --test server/pressInviteWhitelabelLanding.db.test.ts

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
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  users: new Set<string>(),
  people: new Set<string>(),
  invites: new Set<string>(),
  manufacturers: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}

async function seedPress(slug: string, opts: { skinned: boolean }): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, white_label_slug, email_branding)
    VALUES (${id}, ${"T3331 Press " + slug}, ${slug},
            ${opts.skinned ? sql`'{"accent":"#D9C153"}'::jsonb` : sql`NULL`})
  `);
  created.manufacturers.add(id);
  return id;
}

async function seedInvite(email: string, pressId: string): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = "t3331tok_" + id.replace(/-/g, "");
  await exec(sql`
    INSERT INTO admin_invites
      (id, email, role, role_scope_id, token, expires_at, created_by_user_id,
       review_status, referrer_kind, referrer_scope_id, default_press_id)
    VALUES
      (${id}, ${email}, 'artist', ${null}, ${token},
       ${new Date(Date.now() + 7 * 864e5)}, ${"00000000-0000-0000-0000-000000000001"},
       'approved', 'manufacturer', ${pressId}, ${pressId})
  `);
  created.invites.add(id);
  return { id, token };
}

async function acceptInvite(token: string, tag: string, host?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (host) {
    headers.host = host;
    headers["x-forwarded-host"] = host;
    headers["x-forwarded-proto"] = "https";
  }
  const res = await fetch(`${baseUrl}/api/invites/${token}/accept`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: `t3331u_${tag}`,
      displayName: `T3331 Artist ${tag}`,
      password: "Password123!",
    }),
  });
  const json = await safeJson(res);
  // Track for cleanup regardless of assertion outcome.
  const ur = rows(await exec(sql`SELECT id, role_scope_id FROM users WHERE username = ${`t3331u_${tag}`} LIMIT 1`));
  if (ur[0]) {
    created.users.add(ur[0].id);
    if (ur[0].role_scope_id) created.people.add(ur[0].role_scope_id);
  }
  return { status: res.status, json };
}

test("accept on the press's white-label host lands in the client portal", async () => {
  const tag = randomUUID().slice(0, 8);
  const slug = `t3331a${tag}`;
  const pressId = await seedPress(slug, { skinned: true });
  const { token } = await seedInvite(`t3331_wl_${tag}@example.test`, pressId);

  // Invite read carries the sanitized press brand (accept page skin).
  const read = await fetch(`${baseUrl}/api/invites/${token}`, {
    headers: { host: `${slug}.makesvinyl.com`, "x-forwarded-host": `${slug}.makesvinyl.com`, "x-forwarded-proto": "https" },
  });
  const readJson = await safeJson(read);
  assert.equal(read.status, 200, `invite read returned ${read.status}`);
  assert.equal(readJson?.pressBrand?.pressName, `T3331 Press ${slug}`, "invite read must carry the press brand");

  const { status, json } = await acceptInvite(token, tag, `${slug}.makesvinyl.com`);
  assert.equal(status, 200, `accept returned ${status}: ${JSON.stringify(json)}`);
  assert.equal(json?.landingPath, "/dashboard", `expected /dashboard landing, got ${json?.landingPath}`);
  assert.equal(json?.pressPortal, true, "accept must flag the press-portal landing");
  assert.ok(json?.token, "accept must return a bearer token");

  // End-to-end: the freshly-minted ADMIN-kind artist can read the client
  // portal on the same branded host (Task #3331 admin fallback in
  // resolvePortalClient) — honest empty list, never a 401 bounce.
  const portal = await fetch(`${baseUrl}/api/press-client/portal`, {
    headers: {
      host: `${slug}.makesvinyl.com`,
      "x-forwarded-host": `${slug}.makesvinyl.com`,
      "x-forwarded-proto": "https",
      authorization: `Bearer ${json.token}`,
    },
  });
  const portalJson = await safeJson(portal);
  assert.equal(portal.status, 200, `portal read returned ${portal.status}: ${JSON.stringify(portalJson)}`);
  assert.ok(Array.isArray(portalJson?.estimates), "portal must return an estimates list");

  // Server-authoritative steer decision (WhitelabelArtistSteer's source of
  // truth): on the artist's OWN press host → /dashboard; on a DIFFERENT
  // skinned press's host → null (a foreign artist must never be steered
  // into someone else's portal).
  const steerOn = async (h: string) => {
    const r = await fetch(`${baseUrl}/api/me/whitelabel-landing`, {
      headers: {
        host: h, "x-forwarded-host": h, "x-forwarded-proto": "https",
        authorization: `Bearer ${json.token}`,
      },
    });
    return (await safeJson(r))?.landing ?? null;
  };
  assert.equal(await steerOn(`${slug}.makesvinyl.com`), "/dashboard", "homed artist must be steered on their press's host");
  const otherSlug = `t3331f${tag}`;
  await seedPress(otherSlug, { skinned: true });
  assert.equal(await steerOn(`${otherSlug}.makesvinyl.com`), null, "artist homed to a different press must NOT be steered");
});

test("control: the same press invite accepted on a GoodTunes host is unchanged", async () => {
  const tag = randomUUID().slice(0, 8);
  const slug = `t3331b${tag}`;
  const pressId = await seedPress(slug, { skinned: true });
  const { token } = await seedInvite(`t3331_gt_${tag}@example.test`, pressId);

  // No whitelabel Host header — plain host, exactly like an accept on
  // the GoodTunes admin host family.
  const { status, json } = await acceptInvite(token, tag);
  assert.equal(status, 200, `accept returned ${status}: ${JSON.stringify(json)}`);
  assert.equal(json?.landingPath, "/artist", `expected legacy /artist landing, got ${json?.landingPath}`);
  assert.equal(json?.pressPortal, false, "no press-portal landing off the white-label host");
});

test("non-artist invites on the skinned host keep their normal landing", async () => {
  // The /dashboard override is ARTIST-only: a press staff / manufacturer
  // invite homed to the same skinned press must land in its own portal,
  // never the client dashboard.
  const tag = randomUUID().slice(0, 8);
  const slug = `t3331d${tag}`;
  const pressId = await seedPress(slug, { skinned: true });
  const id = randomUUID();
  const token = "t3331tok_" + id.replace(/-/g, "");
  await exec(sql`
    INSERT INTO admin_invites
      (id, email, role, role_scope_id, token, expires_at, created_by_user_id,
       review_status, referrer_kind, referrer_scope_id, default_press_id)
    VALUES
      (${id}, ${`t3331_mfg_${tag}@example.test`}, 'manufacturer', ${pressId}, ${token},
       ${new Date(Date.now() + 7 * 864e5)}, ${"00000000-0000-0000-0000-000000000001"},
       'approved', 'manufacturer', ${pressId}, ${pressId})
  `);
  created.invites.add(id);

  const { status, json } = await acceptInvite(token, tag, `${slug}.makesvinyl.com`);
  assert.equal(status, 200, `accept returned ${status}: ${JSON.stringify(json)}`);
  assert.notEqual(json?.landingPath, "/dashboard", "non-artist invite must never land in the client portal");
  assert.equal(json?.pressPortal, false, "non-artist invite must not flag the press-portal landing");
});

test("existing-account sign-in-to-accept on the skinned host also lands in the portal", async () => {
  // Task #3331 review follow-through: the existing-account branch honors
  // the same branded landing contract — an account whose effective role is
  // artist, homed to the host press, gets /dashboard from sign-in-to-accept.
  const tag = randomUUID().slice(0, 8);
  const slug = `t3331e${tag}`;
  const pressId = await seedPress(slug, { skinned: true });
  const email = `t3331_ex_${tag}@example.test`;

  // Seed the pre-existing artist account via a first accept (plain host).
  const first = await seedInvite(email, pressId);
  const firstAccept = await acceptInvite(first.token, tag);
  assert.equal(firstAccept.status, 200);

  // Second invite to the same email, accepted via sign-in on the branded host.
  const second = await seedInvite(email, pressId);
  const res = await fetch(`${baseUrl}/api/invites/${second.token}/accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: `${slug}.makesvinyl.com`,
      "x-forwarded-host": `${slug}.makesvinyl.com`,
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ signin: true, password: "Password123!" }),
  });
  const json = await safeJson(res);
  assert.equal(res.status, 200, `sign-in-to-accept returned ${res.status}: ${JSON.stringify(json)}`);
  assert.equal(json?.existingAccount, true);
  assert.equal(json?.landingPath, "/dashboard", `existing-account accept must land in the portal, got ${json?.landingPath}`);
  assert.equal(json?.pressPortal, true);
});

test("a press without the portal skin keeps today's landing on its own host", async () => {
  const tag = randomUUID().slice(0, 8);
  const slug = `t3331c${tag}`;
  const pressId = await seedPress(slug, { skinned: false });
  const { token } = await seedInvite(`t3331_ns_${tag}@example.test`, pressId);

  const { status, json } = await acceptInvite(token, tag, `${slug}.makesvinyl.com`);
  assert.equal(status, 200, `accept returned ${status}: ${JSON.stringify(json)}`);
  assert.equal(json?.landingPath, "/artist", `expected legacy /artist landing, got ${json?.landingPath}`);
  assert.equal(json?.pressPortal, false, "unskinned press must not land in the portal");
});

after(async () => {
  for (const id of created.invites) await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
  for (const id of created.users) {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  httpServer?.close();
  await pool.end();
});
