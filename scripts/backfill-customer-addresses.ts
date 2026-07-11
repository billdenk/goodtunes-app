/**
 * Task #2676 — Backfill missing/name-only shipping+billing addresses on
 * customer_users from their Stripe Customer records.
 *
 * During a window when the Stripe Basil API moved the shipping snapshot from
 * `session.shipping_details` to `session.collected_information.shipping_details`,
 * the webhook handler wrote only the buyer name into the local customer snapshot
 * (all address lines null). Stripe's own Customer object (written via
 * `customer_update: { address: "auto", shipping: "auto" }`) always has the full
 * address. This script pulls it back from Stripe and writes it into
 * `customer_users`.
 *
 * Target rows: `customer_users` where `stripe_customer_id IS NOT NULL` AND
 * (`shipping_address IS NULL` OR `shipping_address->>'line1' IS NULL`).
 *
 * Stripe environment: dev customers were created against the TEST connector key,
 * prod against LIVE. Credentials are resolved via the Replit connector API keyed
 * off `--env=development|production`, NOT `REPLIT_DEPLOYMENT`.
 *
 * Idempotent: marker-guarded per DB in `post_merge_data_backfills`. The script
 * FATALs (nonzero exit) on any Stripe/DB error rather than stamping the marker on
 * a partial run.
 *
 * Usage:
 *   npx tsx scripts/backfill-customer-addresses.ts --env=development
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-customer-addresses.ts --env=production
 */
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import type { StripeAddressSnapshot } from "@shared/schema";

const MARKER = "task_2676_addr_backfill";
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 200;

const envArg = process.argv.find((a) => a.startsWith("--env="));
const targetEnvironment = envArg ? envArg.slice("--env=".length).trim() : "";
if (targetEnvironment !== "development" && targetEnvironment !== "production") {
  console.error("usage: tsx scripts/backfill-customer-addresses.ts --env=development|production");
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

function addressFromStripe(
  a: Stripe.Address | null | undefined,
  name: string | null | undefined,
): StripeAddressSnapshot | null {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[backfill-customer-addresses] start (env=${targetEnvironment})`);

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

  // Customers with a Stripe ID but missing or name-only local shipping address.
  const affected = (
    await db.execute<{
      id: string;
      stripe_customer_id: string;
    }>(sql`
      SELECT id, stripe_customer_id
      FROM customer_users
      WHERE stripe_customer_id IS NOT NULL
        AND (
          shipping_address IS NULL
          OR shipping_address->>'line1' IS NULL
        )
    `)
  ).rows;

  if (affected.length === 0) {
    console.log("no affected customer rows in this DB — nothing to backfill, marker stamped");
    await db.execute(
      sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
    );
    return;
  }
  console.log(`affected customers: ${affected.length}`);

  const stripe = await getStripeForEnv(targetEnvironment);

  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < affected.length; i += BATCH_SIZE) {
    const batch = affected.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      try {
        const customer = await stripe.customers.retrieve(row.stripe_customer_id);
        if (customer.deleted) {
          skipped++;
          continue;
        }
        const c = customer as Stripe.Customer;

        const shipping = addressFromStripe(c.shipping?.address ?? null, c.shipping?.name ?? null);
        const billing = addressFromStripe(c.address ?? null, c.name ?? null);

        // Only update if we actually got a real address from Stripe.
        if (!shipping?.line1 && !billing?.line1) {
          skipped++;
          continue;
        }

        const updates: Record<string, string> = {};
        if (shipping?.line1) {
          updates["shipping_address"] = JSON.stringify(shipping);
        }
        if (billing?.line1) {
          updates["billing_address"] = JSON.stringify(billing);
        }

        if (updates["shipping_address"] && updates["billing_address"]) {
          await db.execute(sql`
            UPDATE customer_users
            SET shipping_address = ${updates["shipping_address"]}::jsonb,
                billing_address  = ${updates["billing_address"]}::jsonb
            WHERE id = ${row.id}
          `);
        } else if (updates["shipping_address"]) {
          await db.execute(sql`
            UPDATE customer_users
            SET shipping_address = ${updates["shipping_address"]}::jsonb
            WHERE id = ${row.id}
          `);
        } else {
          await db.execute(sql`
            UPDATE customer_users
            SET billing_address = ${updates["billing_address"]}::jsonb
            WHERE id = ${row.id}
          `);
        }
        updated++;
      } catch (err: any) {
        errored++;
        console.error(`customer ${row.id} (stripe: ${row.stripe_customer_id}): ${err?.message ?? err}`);
      }
    }
    if (i + BATCH_SIZE < affected.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `done: updated=${updated} skipped(no-address-in-Stripe)=${skipped} errored=${errored}`,
  );

  if (errored > 0) {
    throw new Error(
      `FATAL: ${errored} customer(s) failed to backfill due to Stripe/DB errors — refusing to stamp marker on a partial run`,
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
