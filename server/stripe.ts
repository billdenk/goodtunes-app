// Stripe client wiring via the Replit Stripe connector.
// Credentials come from the connection — we never read keys from env vars
// directly. The connector returns BOTH the publishable + secret keys; the
// publishable one is shipped to the browser for Stripe.js, the secret one
// stays here. Switching between test and live mode is driven by
// REPLIT_DEPLOYMENT (test in dev, live in prod) — the connection's
// `environment` field on Replit's side already separates them, so a single
// account can hold both.
//
// Per the integrations rules: never cache the client. Tokens expire.
// Call `getStripe()` fresh on every request.
import Stripe from "stripe";

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = await response.json();
  const item = data.items?.[0];
  if (!item || !item.settings?.publishable || !item.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }
  // Webhook secret: prefer the connector value if it ever exposes one,
  // but the current Replit Stripe connector page only surfaces
  // publishable + secret keys. Fall back to a plain Replit Secret
  // (`STRIPE_WEBHOOK_SECRET`) so operators can wire the `whsec_…`
  // value Stripe gives them after creating a webhook destination.
  const connectorWebhookSecret = (item.settings.webhook_secret ?? item.settings.webhookSecret ?? null) as string | null;
  const envWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  return {
    publishableKey: item.settings.publishable as string,
    secretKey: item.settings.secret as string,
    webhookSecret: connectorWebhookSecret ?? envWebhookSecret,
  };
}

export async function getStripe(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const { webhookSecret } = await getCredentials();
  return webhookSecret;
}

export function isStripeConfigured(): boolean {
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME && (!!process.env.REPL_IDENTITY || !!process.env.WEB_REPL_RENEWAL);
}
