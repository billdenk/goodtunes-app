// Task: Nightbirde Partner Acquisition Dashboard.
//
// The partner-facing acquisition funnel reuses the corrected `acquisitionFunnel`
// engine but wraps it so a partner sees ONLY their own releases. These tests
// pin the two scoping guarantees of the wrappers in server/reports/index.ts:
//
//  1. `partnerFunnelReleases(ctx)` lists exactly the caller's own albums — a
//     label sees its album, not another label's; a super_admin viewing AS an
//     artist sees only that artist's releases; a non-profit org scope owns no
//     albums so it sees none.
//  2. `partnerAcquisitionFunnel(ctx, {albumId})` refuses to drill into an
//     album outside the caller's cohort (returns the empty shape), even though
//     the underlying engine would happily aggregate it.
//  3. Task #2487 — the partner surface FAILS CLOSED: a super_admin with no
//     impersonation target, and any unresolvable/blank scope, resolve to an
//     EMPTY cohort — never the whole-catalog god-view (that lives only on
//     /api/admin/reports/*). This is the regression guard for the cross-artist
//     data leak.
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
// albumD is owned by an ARTIST person (primary_artist_id) so we can prove a
// super_admin viewing AS that artist sees only their release.
const albumD = `pfscope-albumD-${tag}`;
const personArtist = `pfscope-person-${tag}`;
const sA = `pfscope-sessA-${tag}`;
const sB = `pfscope-sessB-${tag}`;
const sD = `pfscope-sessD-${tag}`;

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
  await exec(sql`INSERT INTO people (id, name) VALUES (${personArtist}, ${"Scope Artist P"})`);
  // is_goodtunes_release must be TRUE — ownedReleasesWithFunnel (the release
  // picker) only lists GoodTunes storefront releases, so a seeded album without
  // it never appears in a partner's funnel-release list.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id, is_goodtunes_release)
    VALUES
      (${albumA}, ${"Scope Album A"}, ${"Artist A"}, ${"/album-placeholder.svg"}, ${labelA}, true),
      (${albumB}, ${"Scope Album B"}, ${"Artist B"}, ${"/album-placeholder.svg"}, ${labelB}, true),
      (${albumC}, ${"Scope Album C"}, ${"Artist C"}, ${"/album-placeholder.svg"}, ${labelA}, true)
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_goodtunes_release)
    VALUES (${albumD}, ${"Scope Album D"}, ${"Artist D"}, ${"/album-placeholder.svg"}, ${personArtist}, true)
  `);
  await ev(sA, albumA);
  await ev(sB, albumB);
  await ev(sD, albumD);
});

after(async () => {
  await exec(sql`DELETE FROM analytics_events WHERE session_id IN (${sA}, ${sB}, ${sD})`);
  await exec(sql`DELETE FROM albums WHERE id IN (${albumA}, ${albumB}, ${albumC}, ${albumD})`);
  await exec(sql`DELETE FROM people WHERE id = ${personArtist}`);
  await exec(sql`DELETE FROM labels WHERE id IN (${labelA}, ${labelB})`);
  await pool.end();
});

const window = () => ({ from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) });
const ctxFor = (scope: PartnerScope): ReportContext => ({ scope, ...window() });

const labelScope = (id: string): PartnerScope => ({ role: "label", roleScopeId: id });
// A super_admin with NO impersonation target — the exact shape that used to
// resolve to the whole-catalog god-view and leaked every partner's data.
const godScope: PartnerScope = { role: "super_admin", roleScopeId: null };
// A super_admin viewing AS an artist (the "View as this partner" path).
const artistViewAs = (personId: string): PartnerScope => ({
  role: "super_admin",
  roleScopeId: null,
  viewAs: { kind: "artist", id: personId },
});
// An unresolvable account now falls back to a plain, scope-less admin (see
// getPartnerScope) — it must fail closed exactly like an unimpersonated operator.
const blankScope: PartnerScope = { role: "admin", roleScopeId: null };
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

test("super_admin with NO impersonation target sees NO releases (fail closed)", async () => {
  const rows = await partnerFunnelReleases(ctxFor(godScope));
  const ids = rows.releases.map((r: any) => r.albumId);
  assert.equal(ids.length, 0, "an unimpersonated operator must get an EMPTY partner cohort, never god-view");
});

test("super_admin viewing AS an artist sees only that artist's own release", async () => {
  const rows = await partnerFunnelReleases(ctxFor(artistViewAs(personArtist)));
  const ids = rows.releases.map((r: any) => r.albumId);
  assert.ok(ids.includes(albumD), "view-as artist sees the artist's own release");
  assert.ok(
    !ids.includes(albumA) && !ids.includes(albumB) && !ids.includes(albumC),
    "view-as artist must NOT see any other partner's releases",
  );
});

test("an unresolvable/blank partner scope resolves to empty, never god-view", async () => {
  const rows = await partnerFunnelReleases(ctxFor(blankScope));
  assert.equal(rows.releases.length, 0, "a blank scope must fail closed to an empty cohort");
  const funnel = await partnerAcquisitionFunnel(ctxFor(blankScope), { albumId: albumA });
  assert.equal(funnel.album, null, "a blank scope cannot open any album funnel");
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

test("super_admin with NO impersonation target cannot open any album funnel", async () => {
  const data = await partnerAcquisitionFunnel(ctxFor(godScope), { albumId: albumB });
  assert.equal(data.album, null, "no album funnel resolves without an impersonation target");
  assert.equal(data.steps.length, 0, "no funnel steps leak to an unimpersonated operator");
});

test("super_admin viewing AS an artist can only open THAT artist's album funnel", async () => {
  const own = await partnerAcquisitionFunnel(ctxFor(artistViewAs(personArtist)), { albumId: albumD });
  assert.ok(own.album, "view-as artist opens its own album funnel");

  const foreign = await partnerAcquisitionFunnel(ctxFor(artistViewAs(personArtist)), { albumId: albumB });
  assert.equal(foreign.album, null, "view-as artist cannot drill into another partner's album");
});
