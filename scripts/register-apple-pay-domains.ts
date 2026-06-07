// Manually (re)register the fan hosts as Stripe payment method domains so
// Apple Pay / Google Pay show up in the Embedded Checkout. The server also
// does this best-effort at boot (server/index.ts → server/applePay.ts), but
// this script is handy after a fresh publish, or to confirm the live state.
//
//   npx tsx scripts/register-apple-pay-domains.ts
//
// It runs against whichever Stripe account getStripe() resolves — the test
// account in the workspace, the live account in a deployment. Each domain
// must already serve /.well-known/apple-developer-merchantid-domain-association
// (committed at public/.well-known/) before Stripe will mark Apple Pay active.
import { ensureApplePayDomains, applePayCandidateHosts } from "../server/applePay";

async function main() {
  const hosts = applePayCandidateHosts();
  console.log(`Registering ${hosts.length} host(s) with Stripe:`);
  for (const h of hosts) console.log(`  • ${h}`);
  const results = await ensureApplePayDomains(hosts);
  console.log("\nResults:");
  for (const r of results) {
    const ap = r.applePay ? ` applePay=${r.applePay}` : "";
    const detail = r.detail ? ` — ${r.detail}` : "";
    console.log(`  ${r.domain}: ${r.status}${ap}${detail}`);
  }
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length > 0) {
    console.log(
      `\n${failed.length} domain(s) failed — usually because the host isn't serving the ` +
        `well-known association file yet (expected for fan hosts until this ships to prod).`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
