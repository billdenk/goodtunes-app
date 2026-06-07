// Apple Pay (and Google Pay) enablement for the fan Buy flow.
//
// The fan checkout uses Stripe Embedded Checkout (see server/commerce.ts).
// Embedded Checkout renders the Apple Pay / Google Pay express buttons
// automatically — but ONLY once the domain the checkout runs on is
// registered with Stripe as a "payment method domain". Registration is a
// two-part handshake:
//   1. The domain must serve Stripe's Apple Pay domain-association file at
//      /.well-known/apple-developer-merchantid-domain-association (committed
//      at public/.well-known/ and served in server/routes.ts).
//   2. We call stripe.paymentMethodDomains.create({ domain_name }) so Stripe
//      fetches that file and flips Apple Pay / Google Pay on for the domain.
//
// getStripe() returns the test client in dev and the live client in prod
// (REPLIT_DEPLOYMENT), so this same code registers the right hosts against
// the right Stripe account in each environment. Everything here is
// best-effort and idempotent: it never throws into the boot path and skips
// any domain Stripe already knows about.
import type Stripe from "stripe";
import { getStripe } from "./stripe";

// Fan-facing hosts that front the Buy flow. The admin host never runs
// checkout, so it's deliberately left out.
const FAN_HOSTS = [
  "my.goodtunes.music",
  "store.goodtunes.music",
  "get.goodtunes.music",
];

// Per-process guard so a single boot (or a burst of checkouts) only hits the
// Stripe API once — registration is permanent on Stripe's side.
let ensured = false;

// The current Replit dev/preview host(s), so Apple Pay can be exercised in
// the workspace preview (Safari) against the test Stripe account too. In a
// published deployment REPLIT_DOMAINS is the *.replit.app URL, which is fine
// to register alongside the canonical fan hosts.
function replitHosts(): string[] {
  const raw = (process.env.REPLIT_DOMAINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function applePayCandidateHosts(): string[] {
  return Array.from(new Set([...FAN_HOSTS, ...replitHosts()]));
}

export type ApplePaySyncResult = {
  domain: string;
  status: "registered" | "already" | "skipped" | "failed";
  applePay?: string | null;
  detail?: string;
};

// Register every candidate host as a Stripe payment method domain. Stripe
// validates each one by fetching the well-known file off that host, so a host
// that doesn't serve the file yet (e.g. a fan host before this ships to prod)
// is reported back as failed rather than throwing. Safe to call repeatedly.
export async function ensureApplePayDomains(
  hosts: string[] = applePayCandidateHosts(),
): Promise<ApplePaySyncResult[]> {
  const stripe = await getStripe();
  const existing = new Map<string, Stripe.PaymentMethodDomain>();
  // Page through existing domains so we don't re-create ones already known.
  for await (const d of stripe.paymentMethodDomains.list({ limit: 100 })) {
    existing.set(d.domain_name.toLowerCase(), d);
  }

  const results: ApplePaySyncResult[] = [];
  for (const host of hosts) {
    const key = host.toLowerCase();
    const prior = existing.get(key);
    if (prior) {
      // Already registered. Nudge a re-validation if Apple Pay isn't active
      // yet (e.g. the file only just went live), but never fail the boot on it.
      if (prior.apple_pay?.status !== "active") {
        try {
          const updated = await stripe.paymentMethodDomains.validate(prior.id);
          results.push({ domain: host, status: "already", applePay: updated.apple_pay?.status ?? null });
          continue;
        } catch (e: any) {
          results.push({ domain: host, status: "already", applePay: prior.apple_pay?.status ?? null, detail: e?.message });
          continue;
        }
      }
      results.push({ domain: host, status: "already", applePay: prior.apple_pay?.status ?? null });
      continue;
    }
    try {
      const created = await stripe.paymentMethodDomains.create({ domain_name: host });
      results.push({ domain: host, status: "registered", applePay: created.apple_pay?.status ?? null });
    } catch (e: any) {
      results.push({ domain: host, status: "failed", detail: e?.message ?? String(e) });
    }
  }
  return results;
}

// Boot-time entry point: fire once, swallow everything. Returns a one-line
// summary string for the boot log (no secrets, just host → status).
export async function ensureApplePayDomainsOnce(): Promise<string | null> {
  if (ensured) return null;
  ensured = true;
  try {
    const results = await ensureApplePayDomains();
    return results
      .map((r) => `${r.domain}=${r.status}${r.applePay ? `(${r.applePay})` : ""}`)
      .join(" ");
  } catch (e: any) {
    return `apple-pay domain sync failed: ${e?.message ?? e}`;
  }
}
