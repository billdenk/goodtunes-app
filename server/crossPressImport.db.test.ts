// Task #3394 — Cross-press project import: isolation walls, tested against
// real Postgres.
//
// The walls (Bill's ruling principles):
//   • Flags OFF ⇒ zero new surfaces: the per-press routes 404 (indistinct
//     from "doesn't exist"), eligibility answers only {enabled:false}, and
//     the GoodTunes cross-press view 404s (compile-time flag).
//   • Specs travel, never commerce: no import payload carries a price key.
//   • Never name the other press: portal project lists and started drafts
//     carry no source press id or name; the masters-release row carries no
//     destination info; the source press's own data is untouched.
//
//   npx tsx --test server/crossPressImport.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { registerPressPortalRoutes } from "./pressPortal";
import { storage } from "./storage";
import { findForbiddenPriceKeys } from "@shared/crossPressImport";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any).rows ?? [];

let server: Server;
let baseUrl: string;

// Fixture world: SOURCE press A (no white-label needed), DESTINATION press B
// with a white-label slug and the import flag toggled per test-phase.
const SOURCE_PRESS_NAME = `Wall Test Source Press ${randomUUID().slice(0, 8)}`;
let pressA: string; // source
let pressB: string; // destination
let slugB: string;
let customerId: string;
let bearer: string;
let sourceEstimateId: string;
let destTierId: string;
let destColorId: string;

function get(path: string) {
  return fetch(`${baseUrl}${path}${path.includes("?") ? "&" : "?"}wl=${slugB}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
}
function post(path: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}${path.includes("?") ? "&" : "?"}wl=${slugB}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
}

async function setImportFlag(on: boolean) {
  await exec(sql`UPDATE manufacturers SET cross_press_import_enabled = ${on} WHERE id = ${pressB}`);
}

// The SOURCE press's own flag — gates its press-side masters-release inbox.
async function setSourceImportFlag(on: boolean) {
  await exec(sql`UPDATE manufacturers SET cross_press_import_enabled = ${on} WHERE id = ${pressA}`);
}

before(async () => {
  const app = express();
  app.use(express.json());
  const noop = (_req: any, _res: any, next: any) => next();
  registerPressPortalRoutes(app, noop, noop);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no server port");
  baseUrl = `http://127.0.0.1:${addr.port}`;

  pressA = randomUUID();
  pressB = randomUUID();
  slugB = `walltest${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressA}, ${SOURCE_PRESS_NAME})`);
  await exec(sql`
    INSERT INTO manufacturers (id, name, white_label_slug, cross_press_import_enabled)
    VALUES (${pressB}, ${"Wall Test Dest Press " + pressB.slice(0, 8)}, ${slugB}, false)
  `);

  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const c = await storage.createCustomer({
    username: `walltest${suffix}`,
    email: `walltest-${suffix}@example.com`,
    displayName: "Wall Test Customer",
    realName: null,
    password: null,
  } as any);
  customerId = c.id;
  bearer = randomBytes(32).toString("hex");
  await storage.createAuthToken(bearer, customerId, "customer");

  // Source project at press A: a saved builder state that ALSO carries the
  // commerce fields a real payload has — none of it may travel.
  sourceEstimateId = randomUUID();
  const payload = {
    acceptedByCustomerId: customerId,
    clientName: "Wall Test Customer",
    totalCents: 512345,
    builderState: {
      sizeId: "12",
      discs: 1,
      weightId: "140",
      colorTierName: "Wild Splatter",
      colorName: "Crimson Splatter",
      jacketId: "gatefold", // the builder's own symbolic style id
      qty: 500,
      totalCents: 512345,
      unitPriceCents: 1024,
      priceLadder: [{ qty: 100, unitCents: 1235 }],
    },
  };
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, display_id, title, status, payload)
    VALUES (${sourceEstimateId}, ${pressA}, 'estimate', 'WALL-01', 'Californialand', 'Sent', ${JSON.stringify(payload)}::jsonb)
  `);

  // Destination catalog at press B (no exact "Wild Splatter" tier — the
  // translation must surface "Splatter" as a closest match, never swap).
  await exec(sql`INSERT INTO press_formats (press_id, format) VALUES (${pressB}, '12_lp')`);
  destTierId = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name, canonical_attrs)
    VALUES (${destTierId}, ${pressB}, '12_lp', 'Splatter', '{"effectFamily":"splatter","confirmed":true}'::jsonb)
  `);
  destColorId = randomUUID();
  await exec(sql`
    INSERT INTO press_colors (id, tier_id, name, swatch_hex)
    VALUES (${destColorId}, ${destTierId}, 'Red Splatter', '#cc2222')
  `);
  await exec(sql`INSERT INTO press_jackets (press_id, name) VALUES (${pressB}, 'Gatefold jacket')`);
});

after(async () => {
  try {
    await exec(sql`DELETE FROM masters_release_requests WHERE customer_user_id = ${customerId}`);
    await exec(sql`DELETE FROM cross_press_import_dismissals WHERE customer_user_id = ${customerId}`);
    await exec(sql`DELETE FROM press_estimates WHERE press_id IN (${pressA}, ${pressB})`);
    await exec(sql`DELETE FROM press_colors WHERE tier_id = ${destTierId}`);
    await exec(sql`DELETE FROM press_color_tiers WHERE press_id = ${pressB}`);
    await exec(sql`DELETE FROM press_jackets WHERE press_id = ${pressB}`);
    await exec(sql`DELETE FROM press_formats WHERE press_id = ${pressB}`);
    await exec(sql`DELETE FROM auth_tokens WHERE customer_user_id = ${customerId}`);
    await exec(sql`DELETE FROM customer_users WHERE id = ${customerId}`);
    await exec(sql`DELETE FROM manufacturers WHERE id IN (${pressA}, ${pressB})`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

// ── Wall 1: flags OFF ⇒ zero new surfaces ────────────────────────────────

test("flag OFF: even eligibility 404s — an off-state probe learns nothing, not even that the feature exists", async () => {
  await setImportFlag(false);
  const res = await get("/api/press-client/import/eligibility");
  assert.equal(res.status, 404);
});

test("flag OFF: every other import route 404s, indistinguishable from not existing", async () => {
  await setImportFlag(false);
  assert.equal((await get("/api/press-client/import/projects")).status, 404);
  assert.equal((await post("/api/press-client/import/dismiss", {})).status, 404);
  assert.equal((await post("/api/press-client/import/translate", { projectId: `est:${sourceEstimateId}` })).status, 404);
  assert.equal((await post("/api/press-client/import/start", { projectId: `est:${sourceEstimateId}` })).status, 404);
  assert.equal((await post("/api/press-client/masters-release-request", { projectId: `est:${sourceEstimateId}` })).status, 404);
  assert.equal((await get("/api/press-client/masters-release-requests")).status, 404, "the status list is walled off too — held OFF means the endpoint does not exist");
});

test("GoodTunes cross-press view 404s while the compile-time flag is false", async () => {
  const res = await fetch(`${baseUrl}/api/customer/cross-press-projects`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  assert.equal(res.status, 404);
});

// ── Wall 2 + 3: flag ON — price-free, source press never named ──────────

test("flag ON: project list is price-free and never names or identifies the source press", async () => {
  await setImportFlag(true);
  const elig = await (await get("/api/press-client/import/eligibility")).json();
  assert.equal(elig.enabled, true);
  assert.ok(elig.eligibleCount >= 1);

  const res = await get("/api/press-client/import/projects");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(findForbiddenPriceKeys(body), [], "no price key may travel");
  const flat = JSON.stringify(body);
  assert.ok(!flat.includes(SOURCE_PRESS_NAME), "source press name must not appear");
  assert.ok(!flat.includes(pressA), "source press id must not appear");
  const proj = body.projects.find((p: any) => p.id === `est:${sourceEstimateId}`);
  assert.ok(proj, "the source project is offered under an opaque id");
  assert.equal(proj.lastQuantity, 500);
});

test("translate is honest: closest-match tier needs confirmation, no price anywhere", async () => {
  await setImportFlag(true);
  const res = await post("/api/press-client/import/translate", { projectId: `est:${sourceEstimateId}` });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(findForbiddenPriceKeys(body), []);
  assert.ok(!JSON.stringify(body).includes(SOURCE_PRESS_NAME));
  const tier = body.proposal.fields.find((f: any) => f.field === "colorTier");
  assert.equal(tier.status, "closest", "different name, same family ⇒ closest, never silent swap");
  assert.equal(tier.candidates[0].name, "Splatter");
  assert.equal(body.proposal.proposedBuilderState.colorTierName, undefined, "unconfirmed pick must not be pre-written");
  assert.equal(body.proposal.needsConfirmation, true);
});

test("start creates a destination Draft with no source press identity and no imported price; the source press's data is untouched", async () => {
  await setImportFlag(true);
  const beforeA = rows(await exec(sql`SELECT id, status, payload FROM press_estimates WHERE press_id = ${pressA} ORDER BY id`));

  const res = await post("/api/press-client/import/start", {
    projectId: `est:${sourceEstimateId}`,
    confirmations: { colorTierId: destTierId, colorId: destColorId },
  });
  assert.equal(res.status, 200);
  const { estimateId } = await res.json();

  const draft = rows(await exec(sql`SELECT press_id, status, payload FROM press_estimates WHERE id = ${estimateId}`))[0];
  assert.equal(draft.press_id, pressB, "draft lands at the DESTINATION press");
  assert.equal(draft.status, "Draft");
  const flat = JSON.stringify(draft.payload);
  assert.ok(!flat.includes(pressA), "no source press id in the draft payload");
  assert.ok(!flat.includes(SOURCE_PRESS_NAME), "no source press name in the draft payload");
  assert.deepEqual(findForbiddenPriceKeys(draft.payload.builderState), [], "no imported price in the draft");
  // The draft speaks the destination quote builder's OWN hydration
  // vocabulary — colorId (press_colors row id) + colorKind (tier slug) +
  // symbolic jacket style — so opening it shows the confirmed choices.
  assert.equal(draft.payload.builderState.colorId, destColorId, "builder hydrates colorId — the press_colors row id");
  assert.equal(draft.payload.builderState.colorKind, "splatter", "builder hydrates colorKind — the tier-name slug");
  assert.equal(draft.payload.builderState.colorTierName, "Splatter", "confirmed pick lands in destination vocabulary");
  assert.equal(draft.payload.builderState.colorName, "Red Splatter");
  assert.equal(draft.payload.builderState.jacketId, "gatefold", "symbolic builder jacket style, never a press_jackets UUID");
  assert.equal(draft.payload.builderState.qty, 500, "last quantity carries");
  assert.ok(Array.isArray(draft.payload.builderState.done), "pre-filled steps are marked done for the builder");
  for (const step of ["ctype", "color", "jacket", "qty"]) {
    assert.ok(draft.payload.builderState.done.includes(step), `step ${step} pre-marked done`);
  }

  // The SOURCE press sees nothing: same rows, byte-identical payloads.
  const afterA = rows(await exec(sql`SELECT id, status, payload FROM press_estimates WHERE press_id = ${pressA} ORDER BY id`));
  assert.deepEqual(afterA, beforeA, "an import writes ZERO signal at the source press");
});

test("bad confirmation ids are rejected — an invented option can't sneak into the draft", async () => {
  await setImportFlag(true);
  const res = await post("/api/press-client/import/start", {
    projectId: `est:${sourceEstimateId}`,
    confirmations: { colorTierId: randomUUID() },
  });
  assert.equal(res.status, 400);
});

test("omitted confirmations are rejected while any field still needs one — no draft without explicit consent", async () => {
  await setImportFlag(true);
  const res = await post("/api/press-client/import/start", {
    projectId: `est:${sourceEstimateId}`,
    confirmations: {},
  });
  assert.equal(res.status, 400, "closest-match fields unconfirmed ⇒ refuse");
});

test("stray confirmations for fields that didn't ask are rejected — an exact match can't be silently overridden", async () => {
  await setImportFlag(true);
  // The jacket resolves EXACTLY ("Gatefold jacket" exists at B) — trying to
  // confirm it into something else must fail, not swap.
  const jacket = rows(await exec(sql`SELECT id FROM press_jackets WHERE press_id = ${pressB} LIMIT 1`))[0];
  const res = await post("/api/press-client/import/start", {
    projectId: `est:${sourceEstimateId}`,
    confirmations: { colorTierId: destTierId, colorId: destColorId, jacketId: jacket.id },
  });
  assert.equal(res.status, 400);
});

test("multi-tier coherence: confirming a NON-top tier regenerates color candidates from it, and a color from another tier is refused", async () => {
  await setImportFlag(true);
  // Second same-family tier at B with its own color.
  const tier2 = randomUUID();
  const color2 = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name, canonical_attrs)
    VALUES (${tier2}, ${pressB}, '12_lp', 'Splatter Deluxe', '{"effectFamily":"splatter","confirmed":true}'::jsonb)
  `);
  await exec(sql`
    INSERT INTO press_colors (id, tier_id, name, swatch_hex)
    VALUES (${color2}, ${tier2}, 'Emerald Splatter', '#22aa55')
  `);
  try {
    // Re-translate against the confirmed tier: candidates come from IT only.
    const tRes = await post("/api/press-client/import/translate", {
      projectId: `est:${sourceEstimateId}`,
      confirmedTierId: tier2,
    });
    assert.equal(tRes.status, 200);
    const tBody = await tRes.json();
    const colorField = tBody.proposal.fields.find((f: any) => f.field === "color");
    assert.equal(colorField.status, "closest");
    assert.ok(colorField.candidates.some((c: any) => c.id === color2), "the confirmed tier's color is offered");
    assert.ok(!colorField.candidates.some((c: any) => c.id === destColorId), "other tiers' colors are NOT offered");

    // A color from ANOTHER tier is refused even though it exists at B.
    const bad = await post("/api/press-client/import/start", {
      projectId: `est:${sourceEstimateId}`,
      confirmations: { colorTierId: tier2, colorId: destColorId },
    });
    assert.equal(bad.status, 400, "tier/color pairs from different tiers fail closed");

    // The coherent pair starts fine and lands in builder vocabulary.
    const ok = await post("/api/press-client/import/start", {
      projectId: `est:${sourceEstimateId}`,
      confirmations: { colorTierId: tier2, colorId: color2 },
    });
    assert.equal(ok.status, 200);
    const { estimateId } = await ok.json();
    const draft = rows(await exec(sql`SELECT payload FROM press_estimates WHERE id = ${estimateId}`))[0];
    assert.equal(draft.payload.builderState.colorId, color2);
    assert.equal(draft.payload.builderState.colorKind, "splatter-deluxe");
    assert.equal(draft.payload.builderState.colorTierName, "Splatter Deluxe");
    await exec(sql`DELETE FROM press_estimates WHERE id = ${estimateId}`);
  } finally {
    await exec(sql`DELETE FROM press_colors WHERE id = ${color2}`);
    await exec(sql`DELETE FROM press_color_tiers WHERE id = ${tier2}`);
  }
});

test("destination jacket catalog gates the jacket: a source gatefold at a single-only press is never matched exact or hydrated silently", async () => {
  await setImportFlag(true);
  // Swap press B's jackets: no gatefold, single-pocket only.
  const gate = rows(await exec(sql`SELECT id FROM press_jackets WHERE press_id = ${pressB} AND name = 'Gatefold jacket'`))[0];
  const singleId = randomUUID();
  await exec(sql`DELETE FROM press_jackets WHERE id = ${gate.id}`);
  await exec(sql`INSERT INTO press_jackets (id, press_id, name) VALUES (${singleId}, ${pressB}, 'Standard jacket')`);
  try {
    const tRes = await post("/api/press-client/import/translate", { projectId: `est:${sourceEstimateId}` });
    assert.equal(tRes.status, 200);
    const tBody = await tRes.json();
    const jacket = tBody.proposal.fields.find((f: any) => f.field === "jacket");
    assert.equal(jacket.status, "closest", "unoffered gatefold ⇒ confirmation required, never exact");
    assert.deepEqual(jacket.candidates.map((c: any) => c.id), ["single"], "only the destination's own jackets are offered");
    assert.equal(tBody.proposal.proposedBuilderState.jacketId, undefined, "no silent gatefold hydration");

    // Starting without confirming the jacket is refused…
    const bad = await post("/api/press-client/import/start", {
      projectId: `est:${sourceEstimateId}`,
      confirmations: { colorTierId: destTierId, colorId: destColorId },
    });
    assert.equal(bad.status, 400);

    // …and the confirmed alternative lands, in builder vocabulary.
    const ok = await post("/api/press-client/import/start", {
      projectId: `est:${sourceEstimateId}`,
      confirmations: { colorTierId: destTierId, colorId: destColorId, jacketId: "single" },
    });
    assert.equal(ok.status, 200);
    const { estimateId } = await ok.json();
    const draft = rows(await exec(sql`SELECT payload FROM press_estimates WHERE id = ${estimateId}`))[0];
    assert.equal(draft.payload.builderState.jacketId, "single");
    await exec(sql`DELETE FROM press_estimates WHERE id = ${estimateId}`);
  } finally {
    await exec(sql`DELETE FROM press_jackets WHERE id = ${singleId}`);
    await exec(sql`INSERT INTO press_jackets (id, press_id, name) VALUES (${gate.id}, ${pressB}, 'Gatefold jacket')`);
  }
});

// ── Wall 4: masters-release request carries no destination info ─────────

test("masters-release request lands at the SOURCE press with no destination information; duplicate requests dedupe", async () => {
  await setImportFlag(true);
  const res = await post("/api/press-client/masters-release-request", { projectId: `est:${sourceEstimateId}`, note: "please" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "requested");

  const row = rows(await exec(sql`SELECT * FROM masters_release_requests WHERE id = ${body.id}`))[0];
  assert.equal(row.press_id, pressA, "routed to the source press as its own customer's request");
  const cols = Object.keys(row).join(",");
  assert.ok(!/destination/i.test(cols), "the table has no destination column by design");
  assert.ok(!JSON.stringify(row.source_ref).includes(pressB), "no destination press id anywhere on the row");

  const dup = await post("/api/press-client/masters-release-request", { projectId: `est:${sourceEstimateId}` });
  assert.equal((await dup.json()).alreadyRequested, true);

  // Press-side inbox is behind press A's OWN flag: while it is off (the
  // held-OFF default, and the post-disable state) both press-side endpoints
  // 404 — the whole flow is withdrawn, including its inbox.
  await setSourceImportFlag(false);
  assert.equal((await fetch(`${baseUrl}/api/press/${pressA}/masters-release-requests`)).status, 404);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/press/${pressA}/masters-release-requests/${body.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged" }),
      })
    ).status,
    404,
    "status updates are withdrawn too while the press's flag is off",
  );

  // Flag ON: press A sees a normal inbound request — status, note, customer —
  // and nothing about where the customer is going.
  await setSourceImportFlag(true);
  try {
    const pressView = await fetch(`${baseUrl}/api/press/${pressA}/masters-release-requests`);
    assert.equal(pressView.status, 200);
    const pv = await pressView.json();
    const req0 = pv.requests.find((r: any) => r.id === body.id);
    assert.ok(req0);
    assert.ok(!JSON.stringify(req0).includes(pressB), "press view carries no destination");
  } finally {
    await setSourceImportFlag(false);
  }
});

// ── Entry-point dismissal is one-time, per customer, per press ───────────

test("dismiss flips eligibility.dismissed and is idempotent", async () => {
  await setImportFlag(true);
  assert.equal((await post("/api/press-client/import/dismiss", {})).status, 200);
  assert.equal((await post("/api/press-client/import/dismiss", {})).status, 200);
  const elig = await (await get("/api/press-client/import/eligibility")).json();
  assert.equal(elig.dismissed, true);
});

// ── /translate confirmation wall: only its own suggested matches ─────────

test("translate rejects a confirmedTierId that isn't one of its own closest-match candidates", async () => {
  await setImportFlag(true);
  const res = await post("/api/press-client/import/translate", {
    projectId: `est:${sourceEstimateId}`,
    confirmedTierId: "00000000-0000-4000-8000-00000000beef",
  });
  assert.equal(res.status, 400, "an arbitrary destination tier id never becomes the preview tier");
});

// ── Format wall on COLORS: merged same-name tiers keep per-format rows ───

test("a color sold only on another size's copy of a same-named tier is neither offered nor accepted", async () => {
  await setImportFlag(true);
  // Press B also sells "Splatter" for 7" records, with a color that does
  // NOT exist on the 12" copy. The source project is a 12" record, so that
  // color must never appear as a candidate and /start must refuse it.
  const tier7 = randomUUID();
  const color7 = randomUUID();
  await exec(sql`INSERT INTO press_formats (press_id, format) VALUES (${pressB}, '7_inch') ON CONFLICT DO NOTHING`);
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name, canonical_attrs)
    VALUES (${tier7}, ${pressB}, '7_inch', 'Splatter', '{"effectFamily":"splatter","confirmed":true}'::jsonb)
  `);
  await exec(sql`
    INSERT INTO press_colors (id, tier_id, name, swatch_hex)
    VALUES (${color7}, ${tier7}, 'Neon Green Splatter', '#33ff66')
  `);
  try {
    const tRes = await post("/api/press-client/import/translate", { projectId: `est:${sourceEstimateId}` });
    assert.equal(tRes.status, 200);
    const tBody = await tRes.json();
    const tierField = tBody.proposal.fields.find((f: any) => f.field === "colorTier");
    assert.equal(tierField.status, "closest");
    const mergedTierId = tierField.candidates.find((c: any) => c.name === "Splatter")?.id;
    assert.ok(mergedTierId, "the merged Splatter tier is a candidate");
    const colorField = tBody.proposal.fields.find((f: any) => f.field === "color");
    assert.equal(colorField.status, "closest");
    assert.ok(
      !colorField.candidates.some((c: any) => c.id === color7),
      "the 7\"-only color is never offered for a 12\" record",
    );
    assert.ok(
      colorField.candidates.some((c: any) => c.id === destColorId),
      "the 12\" copy's own color still is",
    );

    const bad = await post("/api/press-client/import/start", {
      projectId: `est:${sourceEstimateId}`,
      confirmations: { colorTierId: mergedTierId, colorId: color7 },
    });
    assert.equal(bad.status, 400, "an off-format color id fails closed at /start");

    const ok = await post("/api/press-client/import/start", {
      projectId: `est:${sourceEstimateId}`,
      confirmations: { colorTierId: mergedTierId, colorId: destColorId },
    });
    assert.equal(ok.status, 200, "the format-correct color still starts");
  } finally {
    await exec(sql`DELETE FROM press_colors WHERE id = ${color7}`);
    await exec(sql`DELETE FROM press_color_tiers WHERE id = ${tier7}`);
  }
});
