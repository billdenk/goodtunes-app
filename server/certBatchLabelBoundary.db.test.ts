// Failure-boundary tests for cert-batch label purchase safety:
//   1. accepted-buy-before-DB-write — a durable per-leg intent (shipment id)
//      is reconciled via EasyPost retrieval and ADOPTED, never re-bought.
//   2. buy failure leaves the intent persisted; the retry buys nothing extra.
//   3. concurrent signing-address save cannot clobber a purchase (same
//      advisory lock); after purchase it is refused.
//   4. skip refuses while a purchase intent is in flight.
//
// EasyPost is fully stubbed via globalThis.fetch (loopback pg is a socket,
// not fetch, so the DB stays real).
//
//   npx tsx --test server/certBatchLabelBoundary.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  purchaseCertBatchLabels,
  saveCertBatchSigningAddress,
  skipCertBatchLabels,
} from "./certBatch";
import type { CertBatchShippingLabels } from "@shared/schema";

process.env.EASYPOST_API_KEY = process.env.EASYPOST_API_KEY || "EZTK_test_stubbed";

const albumA = randomUUID(); // adopt-prior-purchase reconciliation
const albumB = randomUUID(); // buy-failure → intent persists → safe retry
const albumC = randomUUID(); // concurrent save + skip guards
const fpId = `fp-boundary-${randomUUID().slice(0, 8)}`;

const signingAddress = {
  name: "Artist Signer",
  street1: "1 Signature Way",
  city: "Nashville",
  state: "TN",
  zip: "37203",
  country: "US",
};
const outboundFrom = {
  name: "Printer Co",
  street1: "9 Press Rd",
  city: "Memphis",
  state: "TN",
  zip: "38103",
};

function purchasedShipmentJson(id: string, tracking: string, isReturn: boolean) {
  return {
    id,
    tracking_code: tracking,
    is_return: isReturn,
    postage_label: { label_url: `https://ep.test/${id}.pdf` },
    selected_rate: { carrier: "UPSDAP", service: "Ground", rate: "12.34" },
  };
}

// Recording fetch stub. `plan` maps "METHOD path-suffix" matchers to responses.
type Call = { method: string; url: string };
const calls: Call[] = [];
const realFetch = globalThis.fetch;
let handler: (method: string, url: string) => any = () => {
  throw new Error("unexpected fetch");
};
function stubFetch() {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? input);
    if (!url.includes("api.easypost.com")) return realFetch(input, init);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    const out = handler(method, url);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200 });
  }) as any;
}

async function readLabels(albumId: string): Promise<CertBatchShippingLabels | null> {
  const out = await db.execute(sql`SELECT cert_batch_shipping_labels AS l FROM albums WHERE id = ${albumId}`);
  const raw = (out as any).rows[0]?.l;
  return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
}

before(async () => {
  stubFetch();
  await db.execute(sql`
    INSERT INTO fulfillment_partners (id, name, shipping_address_struct)
    VALUES (${fpId}, ${"Boundary FP"}, ${JSON.stringify({
      line1: "5 Dock St",
      city: "Louisville",
      state: "KY",
      postalCode: "40202",
      country: "US",
    })}::jsonb)
  `);
  for (const id of [albumA, albumB, albumC]) {
    await db.execute(sql`
      INSERT INTO albums (id, title, artist, artwork, cert_batch_return_fulfillment_id)
      VALUES (${id}, ${"boundary test album"}, ${"test artist"}, ${""}, ${fpId})
    `);
  }
});

after(async () => {
  globalThis.fetch = realFetch;
  await db.execute(sql`DELETE FROM albums WHERE id IN (${albumA}, ${albumB}, ${albumC})`);
  await db.execute(sql`DELETE FROM fulfillment_partners WHERE id = ${fpId}`);
  await pool.end();
});

test("a stored intent whose buy was accepted before the DB write is adopted, not re-bought", async () => {
  // Simulate: previous attempt created+bought shp_prior, crashed before
  // persisting the snapshot — only the intent survived.
  await db.execute(sql`
    UPDATE albums SET cert_batch_shipping_labels = ${JSON.stringify({
      status: "pending",
      signingAddress,
      intents: { outbound: "shp_prior" },
      outbound: null,
      return: null,
      returnDestination: null,
    } satisfies CertBatchShippingLabels)}::jsonb WHERE id = ${albumA}
  `);
  calls.length = 0;
  handler = (method, url) => {
    if (method === "GET" && url.endsWith("/shipments/shp_prior")) {
      return { json: purchasedShipmentJson("shp_prior", "1ZPRIOR", false) };
    }
    if (method === "POST" && url.endsWith("/shipments")) {
      return { json: { id: "shp_ret_a", rates: [{ id: "rate_r", carrier: "UPSDAP", service: "Ground", rate: "9.99" }] } };
    }
    if (method === "POST" && url.endsWith("/shipments/shp_ret_a/buy")) {
      return { json: purchasedShipmentJson("shp_ret_a", "1ZRETA", true) };
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const r = await purchaseCertBatchLabels({ albumId: albumA, outboundTo: signingAddress, outboundFrom });
  assert.equal(r.ok, true);
  assert.equal((r as any).labels.outbound.trackingCode, "1ZPRIOR");
  assert.equal((r as any).labels.return.trackingCode, "1ZRETA");
  // The prior shipment must never see another /buy.
  assert.equal(calls.filter((c) => c.url.endsWith("/shipments/shp_prior/buy")).length, 0);
  const stored = await readLabels(albumA);
  assert.equal(stored?.status, "purchased");
});

test("buy failure persists the intent; the retry reconciles and buys nothing extra for that leg", async () => {
  await db.execute(sql`
    UPDATE albums SET cert_batch_shipping_labels = ${JSON.stringify({
      status: "pending",
      signingAddress,
      outbound: null,
      return: null,
      returnDestination: null,
    } satisfies CertBatchShippingLabels)}::jsonb WHERE id = ${albumB}
  `);
  calls.length = 0;
  handler = (method, url) => {
    if (method === "POST" && url.endsWith("/shipments")) {
      return { json: { id: "shp_out_b", rates: [{ id: "rate_o", carrier: "UPSDAP", service: "Ground", rate: "11.00" }] } };
    }
    if (method === "POST" && url.endsWith("/shipments/shp_out_b/buy")) {
      return new Error("socket hang up"); // buy outcome UNKNOWN
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const first = await purchaseCertBatchLabels({ albumId: albumB, outboundTo: signingAddress, outboundFrom });
  assert.equal(first.ok, false);
  const mid = await readLabels(albumB);
  assert.equal(mid?.intents?.outbound, "shp_out_b"); // durable BEFORE the buy
  assert.equal(mid?.outbound, null);

  // Retry: EasyPost says the buy actually went through. No new outbound buy.
  calls.length = 0;
  handler = (method, url) => {
    if (method === "GET" && url.endsWith("/shipments/shp_out_b")) {
      return { json: purchasedShipmentJson("shp_out_b", "1ZOUTB", false) };
    }
    if (method === "POST" && url.endsWith("/shipments")) {
      return { json: { id: "shp_ret_b", rates: [{ id: "rate_r2", carrier: "UPSDAP", service: "Ground", rate: "9.50" }] } };
    }
    if (method === "POST" && url.endsWith("/shipments/shp_ret_b/buy")) {
      return { json: purchasedShipmentJson("shp_ret_b", "1ZRETB", true) };
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const retry = await purchaseCertBatchLabels({ albumId: albumB, outboundTo: signingAddress, outboundFrom });
  assert.equal(retry.ok, true);
  assert.equal((retry as any).labels.outbound.trackingCode, "1ZOUTB");
  assert.equal(calls.filter((c) => c.url.endsWith("/shipments/shp_out_b/buy")).length, 0);
});

test("concurrent signing-address save waits on the purchase lock and cannot clobber the bought snapshot", async () => {
  await db.execute(sql`
    UPDATE albums SET cert_batch_shipping_labels = ${JSON.stringify({
      status: "pending",
      signingAddress,
      outbound: null,
      return: null,
      returnDestination: null,
    } satisfies CertBatchShippingLabels)}::jsonb WHERE id = ${albumC}
  `);
  let seq = 0;
  handler = (method, url) => {
    if (method === "POST" && url.endsWith("/shipments")) {
      const id = `shp_c_${++seq}`;
      return { json: { id, rates: [{ id: `rate_${id}`, carrier: "UPSDAP", service: "Ground", rate: "10.00" }] } };
    }
    if (method === "POST" && /\/shipments\/shp_c_\d+\/buy$/.test(url)) {
      const id = url.split("/").slice(-2)[0];
      return { json: purchasedShipmentJson(id, `1Z${id.toUpperCase()}`, id !== "shp_c_1") };
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const purchaseP = purchaseCertBatchLabels({ albumId: albumC, outboundTo: signingAddress, outboundFrom });
  await new Promise((r) => setTimeout(r, 25)); // let the purchase take the lock first
  const saveP = saveCertBatchSigningAddress(albumC, { ...signingAddress, name: "Someone Else" });
  const [purchase, save] = await Promise.all([purchaseP, saveP]);
  assert.equal(purchase.ok, true);
  assert.equal(save.ok, false); // waited on the lock, then saw the purchase and refused
  const stored = await readLabels(albumC);
  assert.equal(stored?.status, "purchased");
  assert.ok(stored?.outbound?.trackingCode);

  // And skip refuses outright once labels are bought.
  const skipped = await skipCertBatchLabels(albumC, "local_pickup");
  assert.equal(skipped.ok, false);
});

test("skip refuses while a purchase intent is in flight (possibly charged)", async () => {
  await db.execute(sql`
    UPDATE albums SET cert_batch_shipping_labels = ${JSON.stringify({
      status: "pending",
      signingAddress,
      intents: { outbound: "shp_unknown" },
      outbound: null,
      return: null,
      returnDestination: null,
    } satisfies CertBatchShippingLabels)}::jsonb WHERE id = ${albumB}
  `);
  const skipped = await skipCertBatchLabels(albumB, "local_pickup");
  assert.equal(skipped.ok, false);
  assert.match(skipped.message ?? "", /in flight/i);
});
