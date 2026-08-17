// Task #3154 — regression coverage for the press template file download
// route's status mapping:
//
//   • a stored /objects/… path → 302 redirect (same-origin, already ours)
//   • a legacy EXTERNAL link that no longer serves a PDF (dead host, 404,
//     HTML instead of PDF) → 422 { code: "template_link_dead" }, NEVER 5xx —
//     these are client-state (a stale pasted link), and 5xx here used to
//     page ops via the /api 5xx alert on every open of the Templates page.
//   • no file on the slot → 404.
//
// Hermetic external-fetch pattern (hermetic-external-fetch-test-stub.md):
// globalThis.fetch is stubbed for the TEST-NET-3 IP-literal host
// (203.0.113.x — dns.lookup short-circuits IP literals so the SSRF guard
// passes offline); the test's own loopback requests ride the captured
// realFetch.
//
//   npx tsx --test server/pressTemplateFileRoute.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  specs: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
let pressId = "";
let adminToken = "";
let objectSpecId = ""; // template_file_url = /objects/uploads/…
let deadSpecId = ""; // external link → stub answers 404
let htmlSpecId = ""; // external link → stub answers HTML, not a PDF
let emptySpecId = ""; // no template_file_url

const DEAD_URL = "https://203.0.113.10/legacy/template.pdf";
const HTML_URL = "https://203.0.113.11/legacy/template.pdf";
const OBJECT_PATH = "/objects/uploads/t3154-template.pdf";

const realFetch = globalThis.fetch;

before(async () => {
  // Stub the external hosts only; everything else (incl. our loopback
  // server) rides the real fetch.
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    if (url.startsWith("https://203.0.113.10/")) {
      return new Response("gone", { status: 404 });
    }
    if (url.startsWith("https://203.0.113.11/")) {
      return new Response("<html><body>Sign in to view this file</body></html>", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "48" },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;

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

  pressId = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3154 Press"})`);
  created.manufacturers.add(pressId);

  const adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t3154_" + tag}, ${"x"}, ${"t3154"}, ${"t3154_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = "t3154tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");
  created.tokens.add(adminToken);

  const seedSpec = async (componentKey: string, fileUrl: string | null): Promise<string> => {
    const id = randomUUID();
    await exec(sql`
      INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count, template_file_url)
      VALUES (${id}, ${pressId}, ${"12_lp"}, ${componentKey}, ${""}, ${1}, ${fileUrl})
    `);
    created.specs.add(id);
    return id;
  };
  objectSpecId = await seedSpec("jacket", OBJECT_PATH);
  deadSpecId = await seedSpec("labels", DEAD_URL);
  htmlSpecId = await seedSpec("inner_sleeve", HTML_URL);
  emptySpecId = await seedSpec("booklet", null);
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const id of created.specs) {
    await exec(sql`DELETE FROM press_template_specs WHERE id = ${id}`);
  }
  for (const token of created.tokens) {
    await exec(sql`DELETE FROM auth_tokens WHERE token = ${token}`);
  }
  for (const id of created.users) {
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.manufacturers) {
    await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  }
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
  await pool.end();
});

const filePath = (specId: string) => `/api/press/${pressId}/templates/${specId}/file`;

async function get(specId: string): Promise<Response> {
  return realFetch(`${baseUrl}${filePath(specId)}`, {
    headers: { authorization: `Bearer ${adminToken}` },
    redirect: "manual",
  });
}

test("stored /objects path → 302 redirect to the object", async () => {
  const res = await get(objectSpecId);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), OBJECT_PATH);
});

test("dead external link (upstream 404) → 422 template_link_dead, not 5xx", async () => {
  const res = await get(deadSpecId);
  assert.equal(res.status, 422, "dead link must be client-state, never a 5xx that pages ops");
  const body = (await res.json()) as { code?: string; message?: string };
  assert.equal(body.code, "template_link_dead");
  assert.match(body.message ?? "", /Re-attach/i);
});

test("external link serving HTML instead of a PDF → 422 template_link_dead", async () => {
  const res = await get(htmlSpecId);
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "template_link_dead");
});

test("no file on the slot → 404", async () => {
  const res = await get(emptySpecId);
  assert.equal(res.status, 404);
});
