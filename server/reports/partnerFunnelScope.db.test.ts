// Task: Nightbirde Partner Acquisition Dashboard.
//
// The partner-facing acquisition funnel reuses the corrected `acquisitionFunnel`
// engine but wraps it so a partner sees ONLY their own releases. These tests
// pin the two scoping guarantees of the wrappers in server/reports/index.ts:
//
//  1. `partnerFunnelReleases(ctx)` lists exactly the caller's own albums — a
//     label sees its album, not another label's; a super_admin with no
//     impersonation sees both (god-view); a non-profit org scope owns no
//     albums so it sees none.
//  2. `partnerAcquisitionFunnel(ctx, {albumId})` refuses to drill into an
//     album outside the caller's cohort (returns the empty shape), even though
//     the underlying engine would happily aggregate it.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/reports/partnerFunnelScope.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { partnerFunnelReleases, partnerAcquisitionFunnel, type ReportContext } from "./index";
import type { PartnerScope } from "../auth/roles";

const exec = (q: any) => db.execute(q);

const tag = randomUUID().slice(0, 8);
const labelA = `pfscope-labelA-${tag}`;
const labelB = `pfscope-labelB-${tag}`;
const albumA = `pfscope-albumA-${tag}`;
const albumB = `pfscope-albumB-${tag}`;
// albumC belongs to labelA but is seeded with ZERO traffic — it must still
// appear in labelA's release list so the campaign link-builder works for a
// brand-new release (the exact moment a partner needs the link).
const albumC = `pfscope-albumC-${tag}`;
const sA = `pfscope-sessA-${tag}`;
const sB = `pfscope-sessB-${tag}`;

function ev(sessionId: string, albumId: string) {
  return exec(sql`
    INSERT INTO analytics_events (id, name, payload, ts, session_id)
    VALUES (
      ${randomUUID()}, ${"album_viewed"},
      ${JSON.stringify({ albumId, _utm_source: "instagram" })}::json,
      now(), ${sessionId}
    )
  `);
}

before(async () => {
  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelA}, ${"Scope Label A"}), (${labelB}, ${"Scope Label B"})`);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id)
    VALUES
      (${albumA}, ${"Scope Album A"}, ${"Artist A"}, ${"/album-placeholder.svg"}, ${labelA}),
      (${albumB}, ${"Scope Album B"}, ${"Artist B"}, ${"/album-placeholder.svg"}, ${labelB}),
      (${albumC}, ${"Scope Album C"}, ${"Artist C"}, ${"/album-placeholder.svg"}, ${labelA})
  `);
  await ev(sA, albumA);
  await ev(sB, albumB);
});

after(async () => {
  await exec(sql`DELETE FROM analytics_events WHERE session_id IN (${sA}, ${sB})`);
  await exec(sql`DELETE FROM albums WHERE id IN (${albumA}, ${albumB}, ${albumC})`);
  await exec(sql`DELETE FROM labels WHERE id IN (${labelA}, ${labelB})`);
  await pool.end();
});

const window = () => ({ from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) });
const ctxFor = (scope: PartnerScope): ReportContext => ({ scope, ...window() });

const labelScope = (id: string): PartnerScope => ({ role: "label", roleScopeId: id });
const godScope: PartnerScope = { role: "super_admin", roleScopeId: null };
const npoScope = (id: string): PartnerScope => ({ role: "non_profit", roleScopeId: id });

test("a label's funnel releases list contains only its own album", async () => {
  const rows = await partnerFunnelReleases(ctxFor(labelScope(labelA)));
  const ids = rows.releases.map((r: any) => r.albumId);
  assert.ok(ids.includes(albumA), "label A should see album A");
  assert.ok(!ids.includes(albumB), "label A must NOT see album B");
});

test("a label sees its zero-traffic release so it can still build campaign links", async () => {
  const rows = await partnerFunnelReleases(ctxFor(labelScope(labelA)));
  const ids = rows.releases.map((r: any) => r.albumId);
  assert.ok(ids.includes(albumC), "a brand-new release with no traffic must still be pickable");
  const c = rows.releases.find((r: any) => r.albumId === albumC);
  assert.equal(c.landed, 0, "the zero-traffic release reports 0 landed sessions");
});

test("super_admin god-view sees both albums", async () => {
  const rows = await partnerFunnelReleases(ctxFor(godScope));
  const ids = rows.releases.map((r: any) => r.albumId);
  assert.ok(ids.includes(albumA) && ids.includes(albumB), "god-view sees every release");
});

test("a non-profit org scope owns no album releases", async () => {
  const rows = await partnerFunnelReleases(ctxFor(npoScope(`pfscope-org-${tag}`)));
  const ids = rows.releases.map((r: any) => r.albumId);
  assert.ok(!ids.includes(albumA) && !ids.includes(albumB), "org scope owns no albums");
});

test("a label cannot drill into another label's album funnel", async () => {
  const ownFunnel = await partnerAcquisitionFunnel(ctxFor(labelScope(labelA)), { albumId: albumA });
  assert.ok(ownFunnel.album, "label A can open its own album funnel");
  assert.ok(ownFunnel.steps.length > 0, "own funnel has steps");

  const foreign = await partnerAcquisitionFunnel(ctxFor(labelScope(labelA)), { albumId: albumB });
  assert.equal(foreign.album, null, "foreign album funnel is the empty shape");
  assert.equal(foreign.steps.length, 0, "no steps leak for a foreign album");
});

test("super_admin god-view can open any album funnel", async () => {
  const data = await partnerAcquisitionFunnel(ctxFor(godScope), { albumId: albumB });
  assert.ok(data.album, "god-view opens album B");
});
