// Task #2814 — One-time operator cleanup: delete the June 4 2026 TEST orders
// that the paid-checkout verification tests pushed into the REAL Order Desk
// store (fixture customer "Test Fan", emails *@example.test) back when every
// paid physical order auto-pushed.
//
// Match signature (ALL conditions must hold — the store has real orders too):
//   • order date (date_added) is 2026-06-03 or 2026-06-04, AND
//   • email ends with "@example.test" OR the shipping name is exactly
//     "Test Fan".
// Never matches by folder or date alone.
//
// Default mode is DRY-RUN: pages through every order, prints the matched
// count + a sample, deletes NOTHING. Pass --execute to actually DELETE each
// matched order (logged one by one).
//
// Run (as a workflow, not a backgrounded shell — it's long-running):
//   tsx scripts/orderdesk-delete-june4-test-orders.ts             # dry run
//   tsx scripts/orderdesk-delete-june4-test-orders.ts --execute   # delete
//
// This script talks to the Order Desk API directly (its own fetch, not the
// server's odFetch client) so it is structurally exempt from the test-run
// guard in server/orderDesk.ts — the guard targets the test suite, not
// operator scripts. It is a one-time external-API cleanup: do NOT wire it
// into post-merge.

const OD_BASE = "https://app.orderdesk.me/api/v2";

const STORE_ID = process.env.ORDERDESK_STORE_ID?.trim();
const API_KEY = process.env.ORDERDESK_API_KEY?.trim();
const EXECUTE = process.argv.includes("--execute");

// The tests ran June 3–4 2026; date_added is the store-side timestamp.
const TEST_DATES = ["2026-06-03", "2026-06-04"];

if (!STORE_ID || !API_KEY) {
  console.error("ORDERDESK_STORE_ID / ORDERDESK_API_KEY not set — aborting.");
  process.exit(1);
}

async function od(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${OD_BASE}${path}`, {
    ...init,
    headers: {
      "ORDERDESK-STORE-ID": STORE_ID!,
      "ORDERDESK-API-KEY": API_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok || (body && body.status === "error")) {
    throw new Error(body?.message ?? `Order Desk ${path} failed: HTTP ${res.status}`);
  }
  return body;
}

type OdOrder = {
  id: number | string;
  email?: string | null;
  date_added?: string | null;
  shipping?: { first_name?: string | null; last_name?: string | null } | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  order_metadata?: Record<string, unknown> | null;
};

function isTestOrder(o: OdOrder): boolean {
  const date = (o.date_added ?? "").slice(0, 10);
  if (!TEST_DATES.includes(date)) return false;
  const email = (o.email ?? "").trim().toLowerCase();
  const shipName = [o.shipping?.first_name, o.shipping?.last_name].filter(Boolean).join(" ").trim();
  const custName = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ").trim();
  return (
    email.endsWith("@example.test") ||
    shipName.toLowerCase() === "test fan" ||
    custName.toLowerCase() === "test fan"
  );
}

async function main() {
  console.log(`[od-cleanup] mode: ${EXECUTE ? "EXECUTE (will delete)" : "DRY-RUN (no deletions)"}`);

  // Page through the whole store; filter locally by the strict signature.
  const PAGE = 250;
  let offset = 0;
  let total = 0;
  const matched: OdOrder[] = [];
  for (;;) {
    const body = await od(`/orders?limit=${PAGE}&offset=${offset}`);
    const orders: OdOrder[] = body?.orders ?? [];
    if (orders.length === 0) break;
    total += orders.length;
    for (const o of orders) if (isTestOrder(o)) matched.push(o);
    console.log(`[od-cleanup] scanned ${total} orders so far — ${matched.length} test matches`);
    if (orders.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`\n[od-cleanup] scanned ${total} orders total; matched ${matched.length} test orders.`);
  console.log(`[od-cleanup] sample of matches (up to 10):`);
  for (const o of matched.slice(0, 10)) {
    const name = [o.shipping?.first_name, o.shipping?.last_name].filter(Boolean).join(" ");
    console.log(`  • OD #${o.id}  ${o.date_added}  ${o.email ?? "(no email)"}  ship-to: ${name || "(none)"}`);
  }

  // Sanity check: every match MUST carry the test signature (belt-and-braces
  // re-verification before any deletion).
  const bad = matched.filter((o) => !isTestOrder(o));
  if (bad.length > 0) {
    console.error(`[od-cleanup] internal error: ${bad.length} matches fail re-verification — aborting.`);
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log(`\n[od-cleanup] DRY-RUN complete. Re-run with --execute to delete these ${matched.length} orders.`);
    return;
  }

  // Serial, paced deletes — Order Desk rate-limits aggressively (a burst of
  // ~50 tripped "API Rate Limit Exceeded"). One delete per second with a
  // 30s backoff+retry on a rate-limit response. The script is idempotent —
  // a rerun simply re-scans and deletes any remainder.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let deleted = 0;
  let failed = 0;
  for (const o of matched) {
    let done = false;
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        await od(`/orders/${o.id}`, { method: "DELETE" });
        deleted++;
        done = true;
        console.log(`[od-cleanup] deleted OD #${o.id} (${o.email ?? "no email"}, ${o.date_added}) [${deleted}/${matched.length}]`);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/rate limit/i.test(msg) && attempt < 4) {
          console.log(`[od-cleanup] rate-limited on OD #${o.id} — backing off 30s (attempt ${attempt})`);
          await sleep(30_000);
        } else {
          failed++;
          done = true;
          console.error(`[od-cleanup] FAILED to delete OD #${o.id}: ${msg}`);
        }
      }
    }
    await sleep(1000);
  }
  console.log(`\n[od-cleanup] done: deleted ${deleted}/${matched.length}, ${failed} failures.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`[od-cleanup] fatal: ${e?.message ?? e}`);
  process.exit(1);
});
