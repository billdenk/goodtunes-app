/**
 * Task #2431 — Reconcile legacy gogoods.com orders against LIVE Stripe.
 *
 * The gogoods.com bulk import stamped only the base album price into
 * `orders.total_cents` (origin = 'legacy:gogoods'); it never captured the
 * paid add-ons, shipping, tax, per-line items, buyer address, or the Stripe
 * payment-instrument snapshot. The authoritative record of what each fan
 * actually paid lives in Stripe: the old gogoods checkout ran through Stripe
 * Checkout Sessions whose PaymentIntents/Charges carry `metadata.txn_id`
 * (== gogoods transaction id == orders.legacy_gogoods_id) and
 * `metadata.release_id` (== albums.legacy_gogoods_id).
 *
 * This job re-derives the full order record from Stripe and back-fills it:
 *   - orders.total_cents           ← charge.amount / session.amount_total
 *   - orders.tax_cents             ← session.total_details.amount_tax
 *   - orders.shipping_charged_cents← session.total_details.amount_shipping (PRE-tax)
 *   - orders.shipping/billing_address, buyer_email/name/phone (fill-if-missing)
 *   - orders.payment_card_brand/last4/wallet_type, receipt_url (fill-if-missing)
 *   - order_items: one row per Stripe line item (album format + each add-on)
 *
 * The resolved stripe_charge_id / stripe_payment_intent_id / stripe_checkout_session_id
 * are recorded in the audit table ONLY — they are deliberately NOT written back onto
 * the orders row. A single Stripe checkout session can legitimately back one payment
 * while several charge-less legacy orders share the same buyer, so stamping the
 * session/PI onto orders risked cross-attributing one shopper's payment to unrelated
 * orders and colliding on the orders_*_unique indexes.
 *
 * DATA RECONCILIATION ONLY — deliberately NO side effects: no receipts, no
 * Connect transfers/payouts, no fulfillment push, no GoodDeed-number/cert or
 * library-entitlement minting, no order_copies, no refunds. It never calls
 * materializeOrderFromSession (which has all of those side effects); it only
 * writes the data columns above.
 *
 * MATCHING (per legacy order, deterministic first):
 *   1. txn_id      — charge whose metadata.txn_id == orders.legacy_gogoods_id
 *                    (succeeded charge only; failed card-retries share a PI).
 *                    Confidence: high.
 *   2. existing_pi — order already carries a real stripe_payment_intent_id that
 *                    maps to a scanned succeeded charge. Confidence: high.
 *   Amount-based fuzzy matching (buyer email + amount>=base + last4 + date window)
 *   was intentionally removed: charge-less legacy orders (comps / DYNAMO_* rows)
 *   were being cross-attributed to a *different* shopper's larger charge by amount,
 *   inflating totals and colliding on the orders session/PI unique indexes.
 *   Anything without an authoritative charge is left untouched and recorded as
 *   `unmatched` in the audit table + listed in the summary.
 *
 * IDEMPOTENT + reversible + non-destructive:
 *   - Per-order audit table `gogoods_stripe_reconciliation` records the match
 *     + original total; an order already present there is skipped (so re-runs
 *     resume where they left off and never double-write / re-clobber).
 *   - A `post_merge_data_backfills` marker short-circuits the whole job per DB
 *     once every legacy order has been attempted.
 *   - Gated on gogoods data existing in THIS database: a fresh dev clone with
 *     no legacy orders writes nothing and leaves the marker unset.
 *   - Chunked writes (each its own transaction) stay well under the prod
 *     proxy's ~5-min idle-in-transaction cap.
 *
 * Stripe: ALWAYS uses the LIVE (production) connector credentials, because the
 * legacy charges only exist in the live account — regardless of which DB is
 * targeted or whether this runs inside a deployment.
 *
 * Dry run (no writes; prints summary + validates the Paola spot-check):
 *   npx tsx scripts/reconcile-gogoods-stripe-orders.ts --dry-run
 * Apply to dev:
 *   npx tsx scripts/reconcile-gogoods-stripe-orders.ts
 * Apply to prod:
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/reconcile-gogoods-stripe-orders.ts
 */
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import type { StripeAddressSnapshot } from "@shared/schema";

const MARKER = "task_2431_gogoods_stripe_reconciliation";
const DRY_RUN = process.argv.includes("--dry-run");
// gogoods charges span 2024-08 → 2026-03; list from a safe floor.
const CHARGE_ERA_START = Math.floor(new Date("2024-06-01T00:00:00Z").getTime() / 1000);
const SESSION_CONCURRENCY = 3;
const WRITE_CHUNK = 400;
// Fetch + write the matched orders in batches so the run is RESUMABLE: each
// batch's writes (incl. audit rows) commit before the next batch is fetched, so
// a mid-run death (rate-limit throttle, OOM, reaped process) loses at most one
// batch — a rerun skips already-audited orders and continues. Small per-request
// pacing keeps us under Stripe live's sustained-rate throttle.
const SESSION_BATCH = 50;
const SESSION_PACING_MS = 120;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// `--txns=3500,4035,5394` restricts a dry-run to specific legacy txn ids (fast
// correctness spot-check without paging thousands of sessions).
const ONLY_TXNS = (() => {
  const a = process.argv.find((x) => x.startsWith("--txns="));
  return a ? new Set(a.slice("--txns=".length).split(",").map((s) => s.trim()).filter(Boolean)) : null;
})();

// ─── LIVE Stripe (production connector), independent of REPLIT_DEPLOYMENT ───
async function getLiveStripe(): Promise<Stripe> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !token) {
    throw new Error(
      "Stripe connector env missing (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY|WEB_REPL_RENEWAL)",
    );
  }
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", "production");
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": token },
  });
  if (!resp.ok) throw new Error(`connector fetch failed: ${resp.status}`);
  const data = (await resp.json()) as any;
  const secret = data.items?.[0]?.settings?.secret;
  if (!secret) throw new Error("no Stripe secret in production connection");
  if (!secret.startsWith("sk_live")) {
    throw new Error(
      `refusing to run: production connector returned a non-live key (${secret.slice(0, 7)}…)`,
    );
  }
  // Bounded per-request timeout so a throttled/hung call fails fast to a
  // transient fetchError (order left pending, retried next run) instead of
  // stalling the whole batched loop for minutes on retry backoff.
  return new Stripe(secret, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 5, timeout: 20000 });
}

type LegacyOrder = {
  id: string;
  legacy_gogoods_id: string | null;
  total_cents: number;
  created_at: string;
  stripe_payment_intent_id: string | null;
  payment_card_last4: string | null;
  album_legacy: string | null;
  buyer_email: string | null;
  customer_email: string | null;
};

type ChargeLite = {
  id: string;
  amount: number;
  created: number;
  pi: string | null;
  last4: string | null;
  brand: string | null;
  wallet: string | null;
  receiptUrl: string | null;
  billing: Stripe.Charge.BillingDetails | null;
  shipping: Stripe.Charge.Shipping | null;
  txnId: string | null;
  releaseId: string | null;
};

type LineItemPlan = { kind: string; sku: string; label: string; unitPriceCents: number; quantity: number };

type Plan = {
  orderId: string;
  method: "txn_id" | "existing_pi" | "fuzzy";
  confidence: "high" | "medium";
  chargeId: string;
  pi: string | null;
  sessionId: string | null;
  sessionMissing: boolean;
  // true when the Session lookup THREW (rate-limit / transient) rather than
  // legitimately returning no session; such orders are NOT written this run so
  // a rerun retries them (the audit table is the resume cursor).
  fetchError: boolean;
  originalTotalCents: number;
  totalCents: number;
  taxCents: number | null;
  shippingChargedCents: number | null;
  shippingAddress: StripeAddressSnapshot | null;
  billingAddress: StripeAddressSnapshot | null;
  buyerEmail: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  last4: string | null;
  brand: string | null;
  wallet: string | null;
  receiptUrl: string | null;
  items: LineItemPlan[];
};

function addr(a: Stripe.Address | null | undefined, name: string | null | undefined): StripeAddressSnapshot | null {
  if (!a && !name) return null;
  const s: StripeAddressSnapshot = {
    name: name ?? null,
    line1: a?.line1 ?? null,
    line2: a?.line2 ?? null,
    city: a?.city ?? null,
    state: a?.state ?? null,
    postalCode: a?.postal_code ?? null,
    country: a?.country ?? null,
  };
  // All-null (no usable data) → treat as absent.
  if (!s.line1 && !s.city && !s.postalCode && !s.country && !s.name) return null;
  return s;
}

function classifyLineItem(li: Stripe.LineItem): LineItemPlan {
  const product = (li.price?.product ?? null) as Stripe.Product | null;
  const meta = product?.metadata ?? {};
  const name = li.description || product?.name || "Item";
  const unit = li.amount_subtotal ?? 0; // pre-tax, native convention
  const qty = li.quantity ?? 1;
  const isAddon = !!meta.add_on_id || (!meta.release_id && /gooddeed|signed|add[- ]?on|donation|gift/i.test(name));
  if (isAddon) {
    const sku = /signed/i.test(name) && /gooddeed/i.test(name) ? "signed_cert" : "addon";
    return { kind: "addon", sku, label: name, unitPriceCents: unit, quantity: qty };
  }
  return { kind: "format", sku: "legacy", label: name, unitPriceCents: unit, quantity: qty };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  console.log(`[reconcile-gogoods-stripe] start (dry-run=${DRY_RUN})`);

  // 0) Marker table + short-circuit.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);
  if (!DRY_RUN) {
    const marker = await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`);
    if ((marker.rows?.length ?? 0) > 0) {
      console.log(`marker '${MARKER}' present — already applied, skipping`);
      return;
    }
  }

  // 1) Legacy orders in THIS DB. Fresh dev clone → none → no-op, marker unset.
  const orders = (
    await db.execute(sql`
      SELECT o.id, o.legacy_gogoods_id, o.total_cents,
             o.created_at::text AS created_at,
             o.stripe_payment_intent_id, o.payment_card_last4,
             a.legacy_gogoods_id AS album_legacy,
             o.buyer_email,
             cu.email AS customer_email
      FROM orders o
      JOIN albums a ON a.id = o.album_id
      JOIN customer_users cu ON cu.id = o.customer_id
      WHERE o.origin = 'legacy:gogoods'
    `)
  ).rows as unknown as LegacyOrder[];

  if (orders.length === 0) {
    console.log("no legacy:gogoods orders in this DB — nothing to reconcile, marker left unset");
    return;
  }
  console.log(`legacy orders: ${orders.length}`);

  // Audit table (idempotency + reversibility).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gogoods_stripe_reconciliation (
      order_id                   varchar PRIMARY KEY,
      txn_id                     text,
      stripe_charge_id           text,
      stripe_payment_intent_id   text,
      stripe_checkout_session_id text,
      match_method               text NOT NULL,
      confidence                 text NOT NULL,
      original_total_cents       integer,
      reconciled_total_cents     integer,
      tax_cents                  integer,
      shipping_charged_cents     integer,
      item_count                 integer,
      session_missing            boolean NOT NULL DEFAULT false,
      applied_at                 timestamp NOT NULL DEFAULT now()
    )
  `);
  const done = new Set(
    (await db.execute(sql`SELECT order_id FROM gogoods_stripe_reconciliation`)).rows.map(
      (r: any) => r.order_id as string,
    ),
  );
  const pending = orders.filter((o) => !done.has(o.id));
  console.log(`already reconciled: ${done.size}; pending: ${pending.length}`);
  if (pending.length === 0 && !DRY_RUN) {
    await db.execute(
      sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
    );
    console.log("all orders already reconciled — marker stamped");
    return;
  }

  // 2) Build the Stripe charge index (one paged pass over the era).
  const stripe = await getLiveStripe();
  const byTxn = new Map<string, ChargeLite>();
  const ambiguousTxn = new Set<string>();
  const byPi = new Map<string, ChargeLite>();
  let scanned = 0;
  for await (const c of stripe.charges.list({ created: { gte: CHARGE_ERA_START }, limit: 100 })) {
    scanned++;
    if (scanned % 5000 === 0) console.log(`  …scanned ${scanned} charges (txn-matched so far: ${byTxn.size})`);
    if (c.status !== "succeeded" || !c.paid) continue;
    const card = c.payment_method_details?.card ?? null;
    const lite: ChargeLite = {
      id: c.id,
      amount: c.amount,
      created: c.created,
      pi: typeof c.payment_intent === "string" ? c.payment_intent : (c.payment_intent?.id ?? null),
      last4: card?.last4 ?? null,
      brand: card?.brand ?? null,
      wallet: card?.wallet?.type ?? null,
      receiptUrl: c.receipt_url ?? null,
      billing: c.billing_details ?? null,
      shipping: c.shipping ?? null,
      txnId: (c.metadata?.txn_id as string | undefined) ?? null,
      releaseId: (c.metadata?.release_id as string | undefined) ?? null,
    };
    if (lite.txnId) {
      if (byTxn.has(lite.txnId)) ambiguousTxn.add(lite.txnId);
      else byTxn.set(lite.txnId, lite);
    }
    if (lite.pi) byPi.set(lite.pi, lite);
  }
  console.log(
    `stripe charges scanned=${scanned}; succeeded-with-txn=${byTxn.size} ambiguous-txn=${ambiguousTxn.size}`,
  );

  // 3) Match each pending order to a charge.
  type Matched = { order: LegacyOrder; charge: ChargeLite; method: Plan["method"]; confidence: Plan["confidence"] };
  const matched: Matched[] = [];
  const unmatched: { order: LegacyOrder; reason: string }[] = [];
  for (const o of pending) {
    const legacyId = o.legacy_gogoods_id ? String(o.legacy_gogoods_id) : null;
    // 1) txn_id
    if (legacyId && byTxn.has(legacyId) && !ambiguousTxn.has(legacyId)) {
      matched.push({ order: o, charge: byTxn.get(legacyId)!, method: "txn_id", confidence: "high" });
      continue;
    }
    if (legacyId && ambiguousTxn.has(legacyId)) {
      unmatched.push({ order: o, reason: "ambiguous txn_id (multiple succeeded charges)" });
      continue;
    }
    // 2) existing PI on the order
    if (o.stripe_payment_intent_id && byPi.has(o.stripe_payment_intent_id)) {
      matched.push({ order: o, charge: byPi.get(o.stripe_payment_intent_id)!, method: "existing_pi", confidence: "high" });
      continue;
    }
    // 3) No authoritative txn_id charge and no existing PI → genuinely
    //    charge-less legacy order (recorded as unmatched, order left untouched).
    //    Amount-based fuzzy matching was intentionally removed: it matched on
    //    `charge.amount >= order.total`, so a small charge-less order (e.g. $3)
    //    would falsely attach to the same buyer's unrelated larger charge
    //    (e.g. $49.95), overwriting its total and linking it to a stranger's
    //    payment. Only the authoritative txn_id metadata link is trusted.
    unmatched.push({ order: o, reason: "no charge candidate" });
  }
  console.log(`matched=${matched.length} unmatched=${unmatched.length}`);

  // 4) Fetch sessions + apply in RESUMABLE batches. Each batch fetches its
  //    Checkout Sessions (low concurrency + small per-request pacing to stay
  //    under Stripe live's sustained-rate throttle), then — unless dry-run —
  //    commits its UPDATEs, order_items, and audit rows before the next batch.
  //    A mid-run death (throttle, OOM, reaped process) therefore loses at most
  //    one batch: a rerun re-scans, finds those orders already in the audit
  //    table, excludes them from `pending`, and continues from the cursor.
  let work: Matched[] = matched;
  if (ONLY_TXNS) {
    work = matched.filter((m) => ONLY_TXNS!.has(String(m.order.legacy_gogoods_id)));
    console.log(`--txns filter: ${work.length} of ${matched.length} matched orders selected`);
  }

  const buildPlan = async ({ order: o, charge, method, confidence }: Matched): Promise<Plan> => {
    // Jittered pacing spreads the concurrent workers' calls out in time.
    await sleep(Math.floor(Math.random() * SESSION_PACING_MS));
    let session: Stripe.Checkout.Session | null = null;
    let items: LineItemPlan[] = [];
    let fetchError = false;
    if (charge.pi) {
      try {
        // ONE call per order: list sessions by PI with line items expanded.
        // `data.line_items` is a 2-level expand (allowed; the 5-level
        // `data.line_items.data.price.product` is what Stripe rejects). The
        // session carries amount_total + total_details (tax/shipping); the line
        // items carry amount_subtotal + description, which classifyLineItem uses
        // (product metadata isn't expanded here, so it falls back to the name
        // regex — fine for the order_items breakdown).
        const list = await stripe.checkout.sessions.list({
          payment_intent: charge.pi,
          limit: 3,
          expand: ["data.line_items"],
        });
        session =
          list.data.find((s) => s.payment_status === "paid" || s.status === "complete") ??
          list.data[0] ??
          null;
        if (session?.line_items?.data?.length) {
          items = session.line_items.data.map(classifyLineItem);
        }
      } catch (e: any) {
        // Transient (rate-limit) failure: flag so this order is left pending.
        fetchError = true;
        console.warn(`session lookup failed for order ${o.id} (pi ${charge.pi}): ${e?.message}`);
      }
    }
    const shipAddr =
      addr(session?.shipping_details?.address ?? charge.shipping?.address, session?.shipping_details?.name ?? charge.shipping?.name) ??
      addr(charge.shipping?.address, charge.shipping?.name);
    const billAddr =
      addr(charge.billing?.address, charge.billing?.name) ??
      addr(session?.customer_details?.address, session?.customer_details?.name);
    return {
      orderId: o.id,
      method,
      confidence,
      chargeId: charge.id,
      pi: charge.pi,
      sessionId: session?.id ?? null,
      sessionMissing: !session,
      fetchError,
      originalTotalCents: o.total_cents,
      totalCents: session?.amount_total ?? charge.amount,
      taxCents: session?.total_details?.amount_tax ?? null,
      shippingChargedCents: session?.total_details?.amount_shipping ?? null,
      shippingAddress: shipAddr,
      billingAddress: billAddr,
      buyerEmail: charge.billing?.email ?? session?.customer_details?.email ?? o.buyer_email ?? o.customer_email ?? null,
      buyerName: charge.billing?.name ?? session?.customer_details?.name ?? null,
      buyerPhone: charge.billing?.phone ?? session?.customer_details?.phone ?? null,
      last4: charge.last4,
      brand: charge.brand,
      wallet: charge.wallet,
      receiptUrl: charge.receiptUrl,
      items,
    };
  };

  const writePlans = async (batchPlans: Plan[]): Promise<{ updated: number; itemsInserted: number }> => {
    let updated = 0;
    let itemsInserted = 0;
    for (let i = 0; i < batchPlans.length; i += WRITE_CHUNK) {
      const chunk = batchPlans.slice(i, i + WRITE_CHUNK);
      await db.transaction(async (tx) => {
        for (const p of chunk) {
          const shipJson = p.shippingAddress ? sql`${JSON.stringify(p.shippingAddress)}::jsonb` : sql`NULL::jsonb`;
          const billJson = p.billingAddress ? sql`${JSON.stringify(p.billingAddress)}::jsonb` : sql`NULL::jsonb`;
          await tx.execute(sql`
            UPDATE orders SET
              total_cents = ${p.totalCents},
              tax_cents = COALESCE(tax_cents, ${p.taxCents}),
              shipping_charged_cents = COALESCE(shipping_charged_cents, ${p.shippingChargedCents}),
              shipping_address = COALESCE(shipping_address, ${shipJson}),
              billing_address = COALESCE(billing_address, ${billJson}),
              buyer_email = COALESCE(buyer_email, ${p.buyerEmail}),
              buyer_name = COALESCE(buyer_name, ${p.buyerName}),
              buyer_phone = COALESCE(buyer_phone, ${p.buyerPhone}),
              payment_card_last4 = COALESCE(payment_card_last4, ${p.last4}),
              payment_card_brand = COALESCE(payment_card_brand, ${p.brand}),
              payment_wallet_type = COALESCE(payment_wallet_type, ${p.wallet}),
              receipt_url = COALESCE(receipt_url, ${p.receiptUrl})
            WHERE id = ${p.orderId}
          `);
          updated++;
          if (p.items.length) {
            // Only materialize items when the order has none yet (idempotent:
            // legacy orders start with zero, and the audit table stops re-runs).
            const existing = (
              await tx.execute(sql`SELECT count(*)::int AS n FROM order_items WHERE order_id = ${p.orderId}`)
            ).rows[0] as any;
            if ((existing?.n ?? 0) === 0) {
              for (const it of p.items) {
                const r = await tx.execute(sql`
                  INSERT INTO order_items (order_id, kind, sku, label, unit_price_cents, quantity)
                  VALUES (${p.orderId}, ${it.kind}, ${it.sku}, ${it.label}, ${it.unitPriceCents}, ${it.quantity})
                `);
                itemsInserted += r.rowCount ?? 0;
              }
            }
          }
          await tx.execute(sql`
            INSERT INTO gogoods_stripe_reconciliation
              (order_id, txn_id, stripe_charge_id, stripe_payment_intent_id, stripe_checkout_session_id,
               match_method, confidence, original_total_cents, reconciled_total_cents, tax_cents,
               shipping_charged_cents, item_count, session_missing)
            VALUES
              (${p.orderId}, ${orders.find((o) => o.id === p.orderId)?.legacy_gogoods_id ?? null}, ${p.chargeId},
               ${p.pi}, ${p.sessionId}, ${p.method}, ${p.confidence}, ${p.originalTotalCents}, ${p.totalCents},
               ${p.taxCents}, ${p.shippingChargedCents}, ${p.items.length}, ${p.sessionMissing})
            ON CONFLICT (order_id) DO NOTHING
          `);
        }
      });
    }
    return { updated, itemsInserted };
  };

  const plans: Plan[] = [];
  let totalUpdated = 0;
  let totalItems = 0;
  let transientSkipped = 0;
  for (let b = 0; b < work.length; b += SESSION_BATCH) {
    const batch = work.slice(b, b + SESSION_BATCH);
    const batchPlans = await mapLimit(batch, SESSION_CONCURRENCY, buildPlan);
    plans.push(...batchPlans);
    if (!DRY_RUN) {
      // Skip transient (rate-limited) fetches — no audit row → retried next run.
      const writable = batchPlans.filter((p) => !p.fetchError);
      transientSkipped += batchPlans.length - writable.length;
      const res = await writePlans(writable);
      totalUpdated += res.updated;
      totalItems += res.itemsInserted;
    }
    console.log(
      `  processed ${Math.min(b + SESSION_BATCH, work.length)}/${work.length}` +
        (DRY_RUN ? "" : ` (written=${totalUpdated}, items=${totalItems}, transient-skipped=${transientSkipped})`),
    );
  }

  // 5) Summary + Paola spot-check.
  const sumOrig = plans.reduce((a, p) => a + p.originalTotalCents, 0);
  const sumNew = plans.reduce((a, p) => a + p.totalCents, 0);
  const byMethod = plans.reduce<Record<string, number>>((a, p) => ((a[p.method] = (a[p.method] ?? 0) + 1), a), {});
  const missing = plans.filter((p) => p.sessionMissing && !p.fetchError).length;
  const errored = plans.filter((p) => p.fetchError).length;
  // Shared-checkout diagnostic: legacy orders that resolve to the SAME Stripe
  // session/PI (one real checkout → multiple gogoods order rows). The 1:1
  // stripe_checkout_session_id / stripe_payment_intent_id columns can't hold
  // these, and per-order total_cents from the shared charge would double-count.
  const groupBy = (key: (p: Plan) => string | null) => {
    const m = new Map<string, Plan[]>();
    for (const p of plans) {
      const k = key(p);
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(p);
    }
    return [...m.values()].filter((g) => g.length > 1);
  };
  const sharedSessions = groupBy((p) => p.sessionId);
  const sharedPis = groupBy((p) => p.pi);
  const txnOf = (p: Plan) => String(orders.find((o) => o.id === p.orderId)?.legacy_gogoods_id);
  console.log(`shared-session groups=${sharedSessions.length} shared-PI groups=${sharedPis.length}`);
  for (const g of sharedSessions.slice(0, 8)) {
    console.log(
      `  SHARED session ${g[0].sessionId}: ${g.length} orders ` +
        g.map((p) => `[txn ${txnOf(p)} $${(p.totalCents / 100).toFixed(2)}]`).join(" "),
    );
  }
  console.log("─── SUMMARY ───");
  console.log(`plans=${plans.length} by-method=${JSON.stringify(byMethod)} sessions-missing=${missing} fetch-errors=${errored}`);
  console.log(`sum original total: $${(sumOrig / 100).toFixed(2)} → reconciled: $${(sumNew / 100).toFixed(2)}`);
  console.log(`unmatched: ${unmatched.length}`);
  for (const u of unmatched.slice(0, 20)) console.log(`  - order ${u.order.id} (txn ${u.order.legacy_gogoods_id}): ${u.reason}`);
  if (unmatched.length > 20) console.log(`  … and ${unmatched.length - 20} more`);

  // Paola spot-check (paolaorjuela85 legacy txns 3500/4035/5394 → 3665/13593/6460).
  const paola = plans.filter((p) => ["3500", "4035", "5394"].includes(String(orders.find((o) => o.id === p.orderId)?.legacy_gogoods_id)));
  if (paola.length) {
    console.log("─── Paola spot-check ───");
    let ptot = 0;
    for (const p of paola) {
      ptot += p.totalCents;
      console.log(
        `  txn ${orders.find((o) => o.id === p.orderId)?.legacy_gogoods_id}: total $${(p.totalCents / 100).toFixed(2)} ` +
          `(tax $${((p.taxCents ?? 0) / 100).toFixed(2)}, ship $${((p.shippingChargedCents ?? 0) / 100).toFixed(2)}, ` +
          `items=${p.items.map((i) => `${i.kind}:$${(i.unitPriceCents / 100).toFixed(2)}`).join("+")})`,
      );
    }
    console.log(`  Paola lifetime (this run): $${(ptot / 100).toFixed(2)} (expected $237.18)`);
  }

  if (DRY_RUN) {
    console.log("dry-run — no writes performed");
    return;
  }
  console.log(`writes: orders-updated=${totalUpdated} order-items-inserted=${totalItems} transient-skipped=${transientSkipped}`);

  // 6b) Record the UN-matchable orders (no Stripe charge by txn-metadata and no
  //     unambiguous fuzzy candidate — verified to be genuine charge-less legacy
  //     rows: no payment_intent, dates inside the charge era). These will never
  //     match on a rerun, so we audit them (method='unmatched', order untouched)
  //     to exclude them from `pending` and let the marker stamp — otherwise
  //     post-merge would re-scan every matchable order on every future merge.
  //     Idempotent via ON CONFLICT; a run with transient fetch errors still
  //     leaves those matched-but-unwritten orders pending, so the marker holds.
  let unmatchedRecorded = 0;
  // Skip on a partial (`--txns`) run: `unmatched` holds the whole no-charge set,
  // not just the selected txns, so recording it there would be wrong.
  for (let i = 0; !ONLY_TXNS && i < unmatched.length; i += WRITE_CHUNK) {
    const chunk = unmatched.slice(i, i + WRITE_CHUNK);
    await db.transaction(async (tx) => {
      for (const u of chunk) {
        const r = await tx.execute(sql`
          INSERT INTO gogoods_stripe_reconciliation
            (order_id, txn_id, stripe_charge_id, stripe_payment_intent_id, stripe_checkout_session_id,
             match_method, confidence, original_total_cents, reconciled_total_cents, tax_cents,
             shipping_charged_cents, item_count, session_missing)
          VALUES
            (${u.order.id}, ${u.order.legacy_gogoods_id ?? null}, NULL, NULL, NULL,
             'unmatched', 'none', ${u.order.total_cents}, ${u.order.total_cents}, NULL,
             NULL, 0, true)
          ON CONFLICT (order_id) DO NOTHING
        `);
        unmatchedRecorded += r.rowCount ?? 0;
      }
    });
  }
  console.log(`unmatched recorded (no-charge, order untouched): ${unmatchedRecorded}`);

  // 7) Stamp the global marker only when every legacy order has an audit row
  //    (matched, previously reconciled, or recorded unmatched). A run left with
  //    transient fetch errors keeps `remaining > 0`, so the marker holds and a
  //    rerun resumes those orders from the audit cursor.
  const remaining = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM orders o
      WHERE o.origin = 'legacy:gogoods'
        AND NOT EXISTS (SELECT 1 FROM gogoods_stripe_reconciliation r WHERE r.order_id = o.id)
    `)
  ).rows[0] as any;
  if ((remaining?.n ?? 0) === 0) {
    await db.execute(
      sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
    );
    console.log("all legacy orders reconciled — marker stamped");
  } else {
    console.log(`${remaining.n} legacy orders still unmatched — marker left unset for a future retry`);
  }
}

process.on("unhandledRejection", (e) => {
  console.error("reconcile-gogoods-stripe UNHANDLED REJECTION:", e);
  process.exit(1);
});
process.on("uncaughtException", (e) => {
  console.error("reconcile-gogoods-stripe UNCAUGHT EXCEPTION:", e);
  process.exit(1);
});

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("reconcile-gogoods-stripe failed:", e);
    process.exit(1);
  });
