// Task #2496 — HTTP-level proof that the partner-reports surface can't leak
// another artist's data.
//
// server/reports/partnerFunnelScope.db.test.ts already pins the SCOPE RESOLVER
// (resolveScope / partnerFunnelReleases / partnerAcquisitionFunnel) at the
// function level. What it does NOT cover is the real request path the browser
// drives: a socket request to /api/partner/reports/* that flows through the
// actual auth middleware (requireReportScope), the query-param parsing
// (?asPartner / ?asPartnerKind — the exact view-as read-through the AdminReports
// page sends), and the route handler wiring. A future refactor could keep the
// resolver unit tests green while the ROUTE diverges (a header renamed, the
// asPartner grant widened, the fail-closed cohort dropped) and re-open the
// cross-artist leak. This test boots the full Express router and asserts the
// guarantee end-to-end across sales, plays, payouts, and the funnel:
//
//   1. super_admin with NO partner selected → EMPTY cohort on every endpoint
//      (never the whole-catalog god-view — that lives only on /api/admin/*).
//   2. super_admin viewing AS artist X → only artist X's release/metrics; a
//      different artist Y NEVER appears. This is driven the way the browser
//      actually drives it: an `X-View-As-Token` header (the production-safe
//      HMAC view-as token queryClient.ts attaches to EVERY request from a
//      view-as tab), verified by activeMembershipContext, which injects the
//      partner hat into ALS so getUserRole → resolveReportScope scope the whole
//      request to artist X. The ?asPartner query-param read-through is also
//      retained as a legacy-compat check.
//
// We mount the route tree exactly as server/index.ts does and drive it over a
// real loopback socket (127.0.0.1 is an unknown host, so the host/kind boundary
// is skipped and the session kind is trusted — same seam the pressDataIsolation
// + adminAlbumDelete route tests use). A test-only /__test/login seam parks a
// verified super_admin session the way a finished 2FA login would.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/reports/partnerReportsHttpScope.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "../db";
import { authKindMiddleware } from "../auth/host";
import { registerRoutes } from "../routes";
import { mintViewAsToken } from "../auth/viewAsToken";

const exec = (q: any) => db.execute(q);

const tag = randomUUID().slice(0, 8);
const superAdminId = `t2496-super-${tag}`;
const artistX = `t2496-artistX-${tag}`;
const artistY = `t2496-artistY-${tag}`;
const albumX = `t2496-albumX-${tag}`;
const albumY = `t2496-albumY-${tag}`;
const custX = `t2496-custX-${tag}`;
const custY = `t2496-custY-${tag}`;
const orderX = `t2496-orderX-${tag}`;
const orderY = `t2496-orderY-${tag}`;
const sessX = `t2496-sessX-${tag}`;
const sessY = `t2496-sessY-${tag}`;

// Distinct sale amounts so we can prove the scoped total is exactly X's money
// and never sums in Y's.
const AMOUNT_X = 3300;
const AMOUNT_Y = 4400;
const PAYOUT_X = 3000;
const PAYOUT_Y = 4000;

let baseUrl = "";
let httpServer: HttpServer | undefined;

function ev(sessionId: string, albumId: string, name: string) {
  return exec(sql`
    INSERT INTO analytics_events (id, name, payload, ts, session_id)
    VALUES (
      ${randomUUID()}, ${name},
      ${JSON.stringify({ albumId, _utm_source: "instagram" })}::json,
      now(), ${sessionId}
    )
  `);
}

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam: park a verified super_admin session the way a finished 2FA
  // login would. Mounted AFTER registerRoutes so the real express-session
  // middleware (installed inside registerRoutes) is in scope — req.session is
  // therefore the same store resolveReportScope reads from.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  // A genuine super_admin operator (is_admin so resolveReportScope admits it;
  // role=super_admin so ?asPartner impersonation is granted). No memberships
  // rows → getUserRole synthesizes exactly this hat from the legacy columns.
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${superAdminId}, ${"t2496_" + tag}, ${"x"}, ${"t2496 Super"},
            ${"t2496_" + tag + "@example.test"}, true, ${"super_admin"}, ${null})
  `);
  await exec(sql`
    INSERT INTO people (id, name) VALUES (${artistX}, ${"Scope Artist X"}), (${artistY}, ${"Scope Artist Y"})
  `);
  // is_goodtunes_release must be TRUE — the release picker (ownedReleasesWithFunnel)
  // only lists GoodTunes storefront releases.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_goodtunes_release)
    VALUES
      (${albumX}, ${"Scope Album X"}, ${"Artist X"}, ${"/album-placeholder.svg"}, ${artistX}, true),
      (${albumY}, ${"Scope Album Y"}, ${"Artist Y"}, ${"/album-placeholder.svg"}, ${artistY}, true)
  `);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${custX}, ${custX}, ${custX + "@example.test"}, ${"Buyer X"}),
           (${custY}, ${custY}, ${custY + "@example.test"}, ${"Buyer Y"})
  `);
  // Paid + transferred-payout orders feed sales AND payouts for each album.
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, created_at,
                        payout_status, payout_amount_cents, payout_at, buyer_name)
    VALUES
      (${orderX}, ${custX}, ${albumX}, ${AMOUNT_X}, ${"paid"}, now(),
       ${"transferred"}, ${PAYOUT_X}, now(), ${"Buyer X"}),
      (${orderY}, ${custY}, ${albumY}, ${AMOUNT_Y}, ${"paid"}, now(),
       ${"transferred"}, ${PAYOUT_Y}, now(), ${"Buyer Y"})
  `);
  // Plays + funnel-landed events for each album.
  await ev(sessX, albumX, "play_start");
  await ev(sessX, albumX, "album_viewed");
  await ev(sessY, albumY, "play_start");
  await ev(sessY, albumY, "album_viewed");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    await exec(sql`DELETE FROM analytics_events WHERE session_id IN (${sessX}, ${sessY})`);
    await exec(sql`DELETE FROM orders WHERE id IN (${orderX}, ${orderY})`);
    await exec(sql`DELETE FROM customer_users WHERE id IN (${custX}, ${custY})`);
    await exec(sql`DELETE FROM albums WHERE id IN (${albumX}, ${albumY})`);
    await exec(sql`DELETE FROM people WHERE id IN (${artistX}, ${artistY})`);
    await exec(sql`DELETE FROM memberships WHERE user_id = ${superAdminId}`);
    await exec(sql`DELETE FROM users WHERE id = ${superAdminId}`);
  } finally {
    await pool.end();
  }
});

// A wide window that comfortably brackets the now() rows regardless of clock.
const WINDOW = (() => {
  const from = new Date(Date.now() - 86400_000).toISOString();
  const to = new Date(Date.now() + 86400_000).toISOString();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
})();

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// A cookie-jar client authenticated via a real express-session cookie
// (secure + sameSite:lax → needs x-forwarded-proto:https with trust proxy on).
async function makeSessionClient(userId: string) {
  let cookie = "";
  function captureCookie(res: Response) {
    const setCookies = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies as string[]) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) cookie = first;
    }
  }
  async function get(
    path: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        "x-forwarded-proto": "https",
        ...(cookie ? { cookie } : {}),
        ...extraHeaders,
      },
    });
    captureCookie(res);
    return { status: res.status, json: await safeJson(res) };
  }
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
  const login = await post("/__test/login", { userId });
  assert.equal(login.status, 200, "test login seam established a session");
  return { get };
}

// Query string for the "no partner selected" god tab.
const godQs = WINDOW;
// The production-safe view-as header for artist X — exactly what queryClient.ts
// attaches to every request from a "View as partner" tab. Minted for the
// super_admin caller (verifyViewAsToken does a live super_admin DB check), so
// activeMembershipContext injects the artist-X hat and the WHOLE request scopes
// to X without any query param.
const viewAsXHeaders = {
  "X-View-As-Token": mintViewAsToken({
    sub: superAdminId,
    role: "artist",
    scopeKind: "artist",
    scopeId: artistX,
    label: "Scope Artist X",
  }),
};
// Legacy read-through the AdminReports page also sends via the query string.
const viewAsXQs = `${WINDOW}&asPartner=${artistX}&asPartnerKind=artist`;

// ─── super_admin with NO partner selected → EMPTY cohort (fail closed) ────

test("HTTP: no partner selected → sales report is an EMPTY cohort", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/sales?${godQs}`);
  assert.equal(res.status, 200, "operator reaches the sales endpoint");
  assert.equal(res.json.totalUnits, 0, "an unimpersonated operator sees ZERO units, never god-view");
  assert.equal(res.json.totalCents, 0, "and zero dollars");
});

test("HTTP: no partner selected → plays report is an EMPTY cohort", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/plays?${godQs}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.totals.playStarts, 0, "no plays leak without an impersonation target");
});

test("HTTP: no partner selected → payouts report is an EMPTY cohort", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/payouts?${godQs}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.totalCount, 0, "no payouts leak without an impersonation target");
  assert.equal(res.json.totalCents, 0);
});

test("HTTP: no partner selected → funnel release picker is EMPTY", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/funnel/releases?${godQs}`);
  assert.equal(res.status, 200);
  const ids = (res.json.releases ?? []).map((r: any) => r.albumId);
  assert.ok(!ids.includes(albumX) && !ids.includes(albumY), "no releases leak to an unimpersonated operator");
});

test("HTTP: no partner selected → cannot open any album funnel", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/funnel?${godQs}&albumId=${albumX}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.album, null, "no album funnel resolves without an impersonation target");
  assert.equal((res.json.steps ?? []).length, 0, "no funnel steps leak");
});

// ─── super_admin viewing AS artist X via the real X-View-As-Token header ───
// (the exact browser path — token minted for the caller, sent as a header, and
//  scoped entirely by activeMembershipContext with NO ?asPartner query param).

test("HTTP(token): view-as artist X → sales shows ONLY X's order, never Y's", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/sales?${godQs}`, viewAsXHeaders);
  assert.equal(res.status, 200);
  assert.equal(res.json.totalUnits, 1, "exactly artist X's single order");
  assert.equal(res.json.totalCents, AMOUNT_X, "the total is X's amount alone — Y's is never summed in");
  assert.notEqual(res.json.totalCents, AMOUNT_X + AMOUNT_Y, "Y's sale never bleeds into X's report");
});

test("HTTP(token): view-as artist X → plays shows ONLY X's play", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/plays?${godQs}`, viewAsXHeaders);
  assert.equal(res.status, 200);
  assert.equal(res.json.totals.playStarts, 1, "only artist X's play_start is counted");
});

test("HTTP(token): view-as artist X → payouts shows ONLY X's payout", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/payouts?${godQs}`, viewAsXHeaders);
  assert.equal(res.status, 200);
  assert.equal(res.json.totalCount, 1, "exactly one payout — X's");
  assert.equal(res.json.totalCents, PAYOUT_X, "X's payout alone, never Y's");
});

test("HTTP(token): view-as artist X → release picker lists X's album, not Y's", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/funnel/releases?${godQs}`, viewAsXHeaders);
  assert.equal(res.status, 200);
  const ids = (res.json.releases ?? []).map((r: any) => r.albumId);
  assert.ok(ids.includes(albumX), "view-as artist X sees album X");
  assert.ok(!ids.includes(albumY), "view-as artist X must NEVER see album Y");
});

test("HTTP(token): view-as artist X → can open X's funnel but NOT Y's", async () => {
  const c = await makeSessionClient(superAdminId);
  const own = await c.get(`/api/partner/reports/funnel?${godQs}&albumId=${albumX}`, viewAsXHeaders);
  assert.equal(own.status, 200);
  assert.ok(own.json.album, "view-as artist X opens its own album funnel");

  const foreign = await c.get(`/api/partner/reports/funnel?${godQs}&albumId=${albumY}`, viewAsXHeaders);
  assert.equal(foreign.status, 200);
  assert.equal(foreign.json.album, null, "view-as artist X cannot drill into artist Y's album");
  assert.equal((foreign.json.steps ?? []).length, 0, "no steps leak for a foreign album");
});

// A forged/invalid token must NOT scope anything — it falls back to the
// unimpersonated super_admin, which is fail-closed (empty cohort), never god-view.
test("HTTP(token): a tampered X-View-As-Token is ignored → still EMPTY cohort", async () => {
  const c = await makeSessionClient(superAdminId);
  const bad = viewAsXHeaders["X-View-As-Token"].slice(0, -4) + "AAAA"; // corrupt sig
  const res = await c.get(`/api/partner/reports/sales?${godQs}`, { "X-View-As-Token": bad });
  assert.equal(res.status, 200);
  assert.equal(res.json.totalUnits, 0, "a bad token never grants a cohort");
  assert.equal(res.json.totalCents, 0);
});

// ─── legacy ?asPartner query-param read-through (AdminReports buildQs) ─────

test("HTTP(query): legacy ?asPartner=X read-through → sales shows ONLY X's order", async () => {
  const c = await makeSessionClient(superAdminId);
  const res = await c.get(`/api/partner/reports/sales?${viewAsXQs}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.totalUnits, 1, "exactly artist X's single order");
  assert.equal(res.json.totalCents, AMOUNT_X, "the total is X's amount alone — Y's is never summed in");
});
