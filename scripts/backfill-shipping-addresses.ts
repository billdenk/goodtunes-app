/**
 * Task #2642 — Backfill missing shipping addresses on orders.
 *
 * `materializeOrderFromSession` read `session.shipping_details`, but under
 * the pinned Basil Stripe API version (2025-08-27.basil) that field moved to
 * `session.collected_information.shipping_details`. Every physical order
 * materialized before the fix (server/commerce.ts) got a name-only shipping
 * snapshot (all address fields null), which blanks the fulfillment CSV.
 *
 * This one-shot job finds affected orders (shipping_address IS NOT NULL but
 * shipping_address->>'line1' IS NULL) that still have a Stripe checkout
 * session or payment-intent reference, re-fetches the session from Stripe,
 * and rewrites shipping_address (and buyer_name, only if the shipping
 * recipient's name differs and buyer_name was never fan-entered elsewhere —
 * in practice we only fill buyer_name when it's blank).
 *
 * `legacy:gogoods` orders are out of scope (no Stripe session ever existed
 * for them) — the WHERE clause below naturally excludes them since they have
 * neither a stripe_checkout_session_id nor a stripe_payment_intent_id.
 *
 * Stripe environment: dev orders were checked out against the TEST connector
 * key, prod orders against LIVE. This script resolves credentials keyed off
 * which DB it's targeting (`--env=development|production`), NOT
 * `REPLIT_DEPLOYMENT` (which reflects this task-agent's own dev context
 * regardless of which DATABASE_URL was passed in).
 *
 * Idempotent: marker-guarded per DB in `post_merge_data_backfills`. A
 * MISSING-PREREQUENGT (Stripe connector not reachable for the target
 * environment) FATALs the whole run rather than silently skipping and
 * stamping the marker — a partial run must never look "done".
 *
 * Usage:
 *   npx tsx scripts/backfill-shipping-addresses.ts --env=development
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-shipping-addresses.ts --env=production
 */
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import type { StripeAddressSnapshot } from "@shared/schema";

const MARKER = "task_2642_shipping_address_backfill";

const envArg = process.argv.find((a) => a.startsWith("--env="));
const targetEnvironment = envArg ? envArg.slice("--env=".length).trim() : "";
if (targetEnvironment !== "development" && targetEnvironment !== "production") {
  console.error("usage: tsx scripts/backfill-shipping-addresses.ts --env=development|production");
  process.exit(1);
}

async function getStripeForEnv(environment: "development" | "production"): Promise<Stripe> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !token) {
    throw new Error(
      "FATAL: Stripe connector env missing (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY|WEB_REPL_RENEWAL) — refusing to run partial",
    );
  }
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", environment);
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": token },
  });
  if (!resp.ok) throw new Error(`FATAL: Stripe connector fetch failed: ${resp.status}`);
  const data = (await resp.json()) as any;
  const secret = data.items?.[0]?.settings?.secret;
  if (!secret) throw new Error(`FATAL: no Stripe secret in ${environment} connection`);
  const expectedPrefix = environment === "production" ? "sk_live" : "sk_test";
  if (!secret.startsWith(expectedPrefix)) {
    throw new Error(
      `FATAL: refusing to run — ${environment} connector returned a key not starting with ${expectedPrefix} (${secret.slice(0, 7)}…)`,
    );
  }
  return new Stripe(secret, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 5, timeout: 20000 });
}

function addressFromStripe(a: Stripe.Address | null | undefined, name: string | null | undefined): StripeAddressSnapshot | null {
  if (!a && !name) return null;
  return {
    name: name ?? null,
    line1: a?.line1 ?? null,
    line2: a?.line2 ?? null,
    city: a?.city ?? null,
    state: a?.state ?? null,
    postalCode: a?.postal_code ?? null,
    country: a?.country ?? null,
  };
}

async function main() {
  console.log(`[backfill-shipping-addresses] start (env=${targetEnvironment})`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);
  const marker = await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`);
  if ((marker.rows?.length ?? 0) > 0) {
    console.log(`marker '${MARKER}' present — already applied, skipping`);
    return;
  }

  // Affected orders: name-only shipping snapshot (all-null address fields),
  // with a Stripe session or PI reference to re-derive from. legacy:gogoods
  // orders never had a Stripe session, so they're naturally excluded.
  const affected = (
    await db.execute<{
      id: string;
      stripe_checkout_session_id: string | null;
      stripe_payment_intent_id: string | null;
      buyer_name: string | null;
    }>(sql`
      SELECT id, stripe_checkout_session_id, stripe_payment_intent_id, buyer_name
      FROM orders
      WHERE shipping_address IS NOT NULL
        AND shipping_address->>'line1' IS NULL
        AND (stripe_checkout_session_id IS NOT NULL OR stripe_payment_intent_id IS NOT NULL)
    `)
  ).rows;

  if (affected.length === 0) {
    console.log("no affected orders in this DB — nothing to backfill, marker stamped");
    await db.execute(
      sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
    );
    return;
  }
  console.log(`affected orders: ${affected.length}`);

  const stripe = await getStripeForEnv(targetEnvironment);

  let fixed = 0;
  let stillMissing = 0;
  let errored = 0;

  for (const order of affected) {
    try {
      let session: Stripe.Checkout.Session | null = null;
      if (order.stripe_checkout_session_id) {
        session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      } else if (order.stripe_payment_intent_id) {
        const found = await stripe.checkout.sessions.list({
          payment_intent: order.stripe_payment_intent_id,
          limit: 1,
        });
        session = found.data[0] ?? null;
      }
      if (!session) {
        stillMissing++;
        continue;
      }
      const shipDetails =
        (session as any).collected_information?.shipping_details ??
        (session as any).shipping_details ??
        null;
      const shipping = addressFromStripe(shipDetails?.address ?? null, shipDetails?.name ?? null);
      if (!shipping?.line1) {
        // Stripe itself has no address on file for this session either —
        // nothing to backfill (leave the row as-is, don't fabricate).
        stillMissing++;
        continue;
      }
      const nameToUse = shipping.name ?? order.buyer_name ?? null;
      await db.execute(sql`
        UPDATE orders
        SET shipping_address = ${JSON.stringify({ ...shipping, name: nameToUse })}::jsonb,
            buyer_name = COALESCE(buyer_name, ${nameToUse})
        WHERE id = ${order.id}
      `);
      fixed++;
    } catch (err: any) {
      errored++;
      console.error(`order ${order.id}: ${err?.message ?? err}`);
    }
  }

  console.log(`done: fixed=${fixed} stillMissing(no-address-in-Stripe)=${stillMissing} errored=${errored}`);

  if (errored > 0) {
    throw new Error(
      `FATAL: ${errored} order(s) failed to backfill due to Stripe/DB errors — refusing to stamp marker on a partial run`,
    );
  }

  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
  );
  console.log("marker stamped");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
