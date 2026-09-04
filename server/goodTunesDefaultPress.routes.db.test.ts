import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { resolveGoodTunesDefaultPressId } from "./goodTunesDefaultPress";
import { pgArray } from "./lib/pgArray";

const created = {
  users: [] as string[],
  tokens: [] as string[],
  people: [] as string[],
  invites: [] as string[],
  manufacturers: [] as string[],
  albums: [] as string[],
};

let server: HttpServer;
let baseUrl = "";
let token = "";
let superAdminUserId = "";
let partnerToken = "";
let pressToken = "";
let partnerPersonId = "";
let mrpId = "";
let otherPressId = "";

async function request(method: string, path: string, body?: unknown, authToken = token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json().catch(() => null),
  };
}

async function pressFields(personId: string) {
  const result: any = await db.execute(sql`
    SELECT invited_by_press_id, default_press_id FROM people WHERE id = ${personId}
  `);
  return (result.rows ?? [])[0];
}

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  const userId = randomUUID();
  superAdminUserId = userId;
  created.users.push(userId);
  await db.execute(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${userId}, ${`t3467_${userId.slice(0, 8)}`}, 'x', 't3467 admin',
            ${`t3467_${userId.slice(0, 8)}@example.test`}, true, 'super_admin')
  `);
  token = `t3467tok_${randomUUID().replace(/-/g, "")}`;
  created.tokens.push(token);
  await storage.createAuthToken(token, userId, "admin");
  mrpId = await resolveGoodTunesDefaultPressId();
  otherPressId = randomUUID();
  created.manufacturers.push(otherPressId);
  await db.execute(sql`
    INSERT INTO manufacturers (id, name, domain)
    VALUES (${otherPressId}, ${`t3467 Other ${otherPressId.slice(0, 8)}`}, ${`t3467-${otherPressId}.example.test`})
  `);

  partnerPersonId = randomUUID();
  created.people.push(partnerPersonId);
  await db.execute(sql`
    INSERT INTO people (id, name)
    VALUES (${partnerPersonId}, ${`t3467 Partner ${partnerPersonId.slice(0, 8)}`})
  `);
  const partnerUserId = randomUUID();
  created.users.push(partnerUserId);
  await db.execute(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${partnerUserId}, ${`t3467_partner_${partnerUserId.slice(0, 8)}`}, 'x',
            't3467 artist partner', ${`t3467_partner_${partnerUserId.slice(0, 8)}@example.test`},
            true, 'artist', ${partnerPersonId})
  `);
  await db.execute(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, invite_subusers)
    VALUES ('artist', ${partnerPersonId}, true)
  `);
  partnerToken = `t3467partnertok_${randomUUID().replace(/-/g, "")}`;
  created.tokens.push(partnerToken);
  await storage.createAuthToken(partnerToken, partnerUserId, "admin");

  const pressUserId = randomUUID();
  created.users.push(pressUserId);
  await db.execute(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${pressUserId}, ${`t3467_press_${pressUserId.slice(0, 8)}`}, 'x',
            't3467 press partner', ${`t3467_press_${pressUserId.slice(0, 8)}@example.test`},
            true, 'manufacturer', ${otherPressId})
  `);
  await db.execute(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, invite_subusers)
    VALUES ('manufacturer', ${otherPressId}, true)
  `);
  pressToken = `t3467presstok_${randomUUID().replace(/-/g, "")}`;
  created.tokens.push(pressToken);
  await storage.createAuthToken(pressToken, pressUserId, "admin");
});

test("Super Admin People creation defaults to MRP and later clear/reassign stays authoritative", async () => {
  const made = await request("POST", "/api/admin/people", {
    name: `t3467 Direct ${randomUUID().slice(0, 8)}`,
    roles: ["artist"],
    goodTunesArtist: true,
  });
  assert.equal(made.status, 201);
  created.people.push(made.json.id);
  assert.equal((await pressFields(made.json.id)).default_press_id, mrpId);

  const cleared = await request("PATCH", `/api/admin/people/${made.json.id}/default-press`, {
    pressId: null,
  });
  assert.equal(cleared.status, 200);
  assert.equal((await pressFields(made.json.id)).default_press_id, null);

  const reassigned = await request("PATCH", `/api/admin/people/${made.json.id}/default-press`, {
    pressId: otherPressId,
  });
  assert.equal(reassigned.status, 200);
  assert.equal((await pressFields(made.json.id)).default_press_id, otherPressId);
});

test("generic contact creation is never homed to MRP", async () => {
  const made = await request("POST", "/api/admin/people", {
    name: `t3467 Contact ${randomUUID().slice(0, 8)}`,
  });
  assert.equal(made.status, 201);
  created.people.push(made.json.id);
  assert.equal((await pressFields(made.json.id)).default_press_id, null);
});

test("GoodTunes invite placeholders use MRP while an originating press wins", async () => {
  const goodTunesInvite = await request("POST", "/api/admin/invites", {
    email: `t3467-goodtunes-${randomUUID()}@example.test`,
    name: `t3467 GoodTunes Invite ${randomUUID().slice(0, 8)}`,
    role: "artist",
  });
  assert.equal(goodTunesInvite.status, 200);
  created.invites.push(goodTunesInvite.json.id);

  const goodTunesRow: any = await db.execute(sql`
    SELECT role_scope_id FROM admin_invites WHERE id = ${goodTunesInvite.json.id}
  `);
  const goodTunesPersonId = goodTunesRow.rows[0].role_scope_id;
  created.people.push(goodTunesPersonId);
  assert.equal((await pressFields(goodTunesPersonId)).default_press_id, mrpId);

  const pressInvite = await request("POST", "/api/admin/invites", {
    email: `t3467-press-${randomUUID()}@example.test`,
    name: `t3467 Press Invite ${randomUUID().slice(0, 8)}`,
    role: "artist",
    referrerKind: "manufacturer",
    referrerScopeId: otherPressId,
  });
  assert.equal(pressInvite.status, 200);
  created.invites.push(pressInvite.json.id);

  const pressRow: any = await db.execute(sql`
    SELECT role_scope_id FROM admin_invites WHERE id = ${pressInvite.json.id}
  `);
  const pressPersonId = pressRow.rows[0].role_scope_id;
  created.people.push(pressPersonId);
  assert.equal((await pressFields(pressPersonId)).default_press_id, otherPressId);
});

test("selected existing Person receives MRP when the GoodTunes artist invite is accepted", async () => {
  const personId = randomUUID();
  created.people.push(personId);
  await db.execute(sql`
    INSERT INTO people (id, name)
    VALUES (${personId}, ${`t3467 Selected ${personId.slice(0, 8)}`})
  `);
  const invited = await request("POST", "/api/admin/invites", {
    email: `t3467-selected-${randomUUID()}@example.test`,
    role: "artist",
    roleScopeId: personId,
  });
  assert.equal(invited.status, 200);
  created.invites.push(invited.json.id);
  assert.equal((await pressFields(personId)).default_press_id, null);
  const inviteRow: any = await db.execute(sql`
    SELECT token FROM admin_invites WHERE id = ${invited.json.id}
  `);
  const accepted = await request("POST", `/api/invites/${inviteRow.rows[0].token}/accept`, {
    username: `t3467_selected_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    displayName: "t3467 selected artist",
    password: "test-password-3467",
  });
  assert.equal(accepted.status, 200);
  created.users.push(accepted.json.id);
  assert.equal((await pressFields(personId)).default_press_id, mrpId);
});

test("direct grant to an existing account defaults MRP but preserves another press", async () => {
  const directPersonId = randomUUID();
  const attributedPersonId = randomUUID();
  const skuBackedPersonId = randomUUID();
  created.people.push(directPersonId, attributedPersonId, skuBackedPersonId);
  await db.execute(sql`
    INSERT INTO people (id, name)
    VALUES (${directPersonId}, ${`t3467 Direct Grant ${directPersonId.slice(0, 8)}`})
  `);
  await db.execute(sql`
    INSERT INTO people (id, name, invited_by_press_id, default_press_id)
    VALUES (
      ${attributedPersonId},
      ${`t3467 Attributed Grant ${attributedPersonId.slice(0, 8)}`},
      ${otherPressId},
      ${otherPressId}
    )
  `);
  await db.execute(sql`
    INSERT INTO people (id, name)
    VALUES (${skuBackedPersonId}, ${`t3467 SKU-backed Grant ${skuBackedPersonId.slice(0, 8)}`})
  `);
  const skuBackedAlbumId = randomUUID();
  created.albums.push(skuBackedAlbumId);
  await db.execute(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_goodtunes_release)
    VALUES (
      ${skuBackedAlbumId},
      't3467 SKU-backed grant album',
      't3467 SKU-backed grant artist',
      '/album-placeholder.svg',
      ${skuBackedPersonId},
      true
    )
  `);
  await db.execute(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, press_id)
    VALUES (${randomUUID()}, ${skuBackedAlbumId}, 'vinyl', 3000, ${otherPressId})
  `);

  for (const [personId, prefix] of [
    [directPersonId, "direct"],
    [attributedPersonId, "attributed"],
    [skuBackedPersonId, "sku-backed"],
  ] as const) {
    const userId = randomUUID();
    created.users.push(userId);
    const email = `t3467-${prefix}-account-${randomUUID()}@example.test`;
    await db.execute(sql`
      INSERT INTO users (id, username, password, display_name, email, is_admin)
      VALUES (
        ${userId},
        ${`t3467_${prefix}_${userId.slice(0, 8)}`},
        'x',
        ${`t3467 ${prefix} account`},
        ${email},
        false
      )
    `);
    const granted = await request("POST", "/api/admin/invites", {
      email,
      role: "artist",
      roleScopeId: personId,
    });
    assert.equal(granted.status, 200);
    assert.equal(granted.json.added, true);
  }

  assert.equal((await pressFields(directPersonId)).default_press_id, mrpId);
  assert.deepEqual(await pressFields(attributedPersonId), {
    invited_by_press_id: otherPressId,
    default_press_id: otherPressId,
  });
  assert.deepEqual(await pressFields(skuBackedPersonId), {
    invited_by_press_id: null,
    default_press_id: null,
  });
});

test("artist partner direct invite never acquires the GoodTunes MRP default", async () => {
  const invited = await request(
    "POST",
    "/api/admin/invites",
    {
      email: `t3467-partner-invite-${randomUUID()}@example.test`,
      name: `t3467 Partner Invite ${randomUUID().slice(0, 8)}`,
      role: "artist",
    },
    partnerToken,
  );
  assert.equal(invited.status, 200);
  created.invites.push(invited.json.id);
  const inviteRow: any = await db.execute(sql`
    SELECT role_scope_id FROM admin_invites WHERE id = ${invited.json.id}
  `);
  const personId = inviteRow.rows[0].role_scope_id;
  created.people.push(personId);
  assert.equal((await pressFields(personId)).default_press_id, null);
});

test("manufacturer invite homes an unknown artist to that press through acceptance", async () => {
  const invited = await request(
    "POST",
    "/api/admin/invites",
    {
      email: `t3467-press-origin-${randomUUID()}@example.test`,
      name: `t3467 Press Origin ${randomUUID().slice(0, 8)}`,
      role: "artist",
    },
    pressToken,
  );
  assert.equal(invited.status, 200);
  created.invites.push(invited.json.id);
  const inviteRow: any = await db.execute(sql`
    SELECT role_scope_id, token FROM admin_invites WHERE id = ${invited.json.id}
  `);
  const personId = inviteRow.rows[0].role_scope_id;
  created.people.push(personId);
  assert.deepEqual(await pressFields(personId), {
    invited_by_press_id: null,
    default_press_id: otherPressId,
  });

  const accepted = await request("POST", `/api/invites/${inviteRow.rows[0].token}/accept`, {
    username: `t3467_press_accept_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    displayName: "t3467 press-origin artist",
    password: "test-password-3467",
  });
  assert.equal(accepted.status, 200);
  created.users.push(accepted.json.id);
  assert.deepEqual(await pressFields(personId), {
    invited_by_press_id: otherPressId,
    default_press_id: otherPressId,
  });
});

test("scopeless acceptance with a non-press referrer never acquires MRP", async () => {
  const inviteId = randomUUID();
  const inviteToken = `t3467_accept_${randomUUID().replace(/-/g, "")}`;
  created.invites.push(inviteId);
  await db.execute(sql`
    INSERT INTO admin_invites (
      id, email, role, role_scope_id, token, expires_at, created_by_user_id,
      referrer_kind, referrer_scope_id
    )
    VALUES (
      ${inviteId}, ${`t3467-accept-${randomUUID()}@example.test`}, 'artist', NULL,
      ${inviteToken}, NOW() + INTERVAL '1 day', ${superAdminUserId},
      'artist', ${partnerPersonId}
    )
  `);
  const accepted = await request("POST", `/api/invites/${inviteToken}/accept`, {
    username: `t3467_accept_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    displayName: "t3467 referred artist",
    password: "test-password-3467",
  });
  assert.equal(accepted.status, 200);
  created.users.push(accepted.json.id);
  const acceptedUser: any = await db.execute(sql`
    SELECT role_scope_id FROM users WHERE id = ${accepted.json.id}
  `);
  const personId = acceptedUser.rows[0].role_scope_id;
  created.people.push(personId);
  assert.equal((await pressFields(personId)).default_press_id, null);
});

test("operator correction clears divergent provenance and default together", async () => {
  const personId = randomUUID();
  created.people.push(personId);
  const originPressId = otherPressId;
  await db.execute(sql`
    INSERT INTO people (id, name, invited_by_press_id, default_press_id)
    VALUES (${personId}, ${`t3467 divergent ${personId.slice(0, 8)}`}, ${originPressId}, ${mrpId})
  `);
  const cleared = await request("PATCH", `/api/admin/people/${personId}/invited-press`, {
    pressId: null,
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await pressFields(personId), {
    invited_by_press_id: null,
    default_press_id: null,
  });
});

after(async () => {
  if (created.people.length) {
    await db.execute(sql`
      DELETE FROM artist_referrals
       WHERE referrer_person_id = ANY(${pgArray(created.people)})
          OR invitee_person_id = ANY(${pgArray(created.people)})
    `);
    await db.execute(sql`
      DELETE FROM partner_permissions WHERE scope_id = ANY(${pgArray(created.people)})
    `);
    await db.execute(sql`DELETE FROM partner_permissions WHERE scope_id = ${otherPressId}`);
  }
  if (created.invites.length) {
    await db.execute(sql`DELETE FROM admin_invites WHERE id = ANY(${pgArray(created.invites)})`);
  }
  if (created.albums.length) {
    await db.execute(sql`DELETE FROM albums WHERE id = ANY(${pgArray(created.albums)})`);
  }
  if (created.users.length) {
    await db.execute(sql`DELETE FROM memberships WHERE user_id = ANY(${pgArray(created.users)})`);
    await db.execute(sql`DELETE FROM auth_tokens WHERE admin_user_id = ANY(${pgArray(created.users)})`);
  }
  if (created.people.length) {
    await db.execute(sql`DELETE FROM people WHERE id = ANY(${pgArray(created.people)})`);
  }
  if (created.tokens.length) {
    await db.execute(sql`DELETE FROM auth_tokens WHERE token = ANY(${pgArray(created.tokens)})`);
  }
  if (created.users.length) {
    await db.execute(sql`DELETE FROM users WHERE id = ANY(${pgArray(created.users)})`);
  }
  if (created.manufacturers.length) {
    await db.execute(sql`DELETE FROM manufacturers WHERE id = ANY(${pgArray(created.manufacturers)})`);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});